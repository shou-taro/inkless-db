import { useEffect, useMemo, useState } from 'react';
import { formatBytes } from '@/lib/format';
import { useDb } from '@/lib/db/context';
// Tauri's invoke is optional; we guard calls in case we're running in a non‑Tauri context.
let tauriInvoke:
  | undefined
  | ((cmd: string, args?: Record<string, any>) => Promise<any>);
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  // @ts-ignore – optional dependency in web preview
  tauriInvoke = require('@tauri-apps/api/tauri').invoke as typeof tauriInvoke;
} catch {}
import {
  Node,
  Edge,
  useEdgesState,
  useNodesState,
  NodeMouseHandler,
  ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Crosshair,
  Table,
  FileText,
  Clipboard,
  LogOut,
} from 'lucide-react';

import SchemaBrowser from '@/components/SchemaBrowser';
import GraphCanvas from '@/components/GraphCanvas';
import TableNode from '@/components/TableNode';

/**
 * Layout and colour tokens
 * ------------------------
 * Extracted to avoid magic numbers and scattered hex values.
 * These align with Tailwind tokens configured in tailwind.config.js where possible.
 */
const SPACING_X = 280; // horizontal gap between table nodes (narrower to avoid overly wide diagrams)
const SPACING_Y = 220; // vertical gap between table nodes (slightly tighter but still readable)
const FOCUS_OFFSET_X = 120; // centre offset when focusing a node (x)
const FOCUS_OFFSET_Y = 60; // centre offset when focusing a node (y)
const FOCUS_ZOOM = 1.1; // zoom level used when focusing a node
const FOCUS_DURATION_MS = 300; // animation duration for focus transitions

type Column = {
  name: string;
  type: string;
  isPrimary?: boolean;
};

type Table = {
  name: string;
  columns: Column[];
  meta?: {
    createdAt?: string; // ISO string
    updatedAt?: string; // ISO string
    approxRows?: number; // approximate row count
  };
};

type ForeignKey = {
  from: { table: string; column: string };
  to: { table: string; column: string };
};

type Schema = {
  tables: Table[];
  fks: ForeignKey[];
};

type DbInfo = {
  path: string;
  sizeBytes?: number;
};

type PreviewResult = { columns: string[]; rows: any[] };

// Optional globals populated by WelcomePage after selecting a SQLite file.
declare global {
  interface Window {
    __INKLESS_DBINFO__?: DbInfo;
    __INKLESS_SCHEMA__?: Schema;
  }
}

// Optional bridge provided by WelcomePage/client layer.
// It may expose async getters for the currently opened DB.
declare global {
  interface Window {
    inklessClient?: {
      getSchema?: () => Promise<Schema | null>;
      getDbInfo?: () => Promise<DbInfo | null>;
    };
  }
}

// Define nodeTypes at module scope so the object identity stays stable across renders.
const nodeTypes = { table: TableNode };

function schemaToFlow(schema: Schema) {
  // Choose a near-square grid based on table count to prevent excessively wide rows.
  const count = schema.tables.length || 1;
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const nodes: Node[] = schema.tables.map((t, idx) => ({
    id: t.name,
    type: 'table',
    position: {
      x: 80 + (idx % cols) * SPACING_X,
      y: 60 + Math.floor(idx / cols) * SPACING_Y,
    },
    data: { table: t },
  }));

  const edges: Edge[] = schema.fks.map((fk, i) => ({
    id: `fk-${i}-${fk.from.table}.${fk.from.column}->${fk.to.table}.${fk.to.column}`,
    source: fk.from.table,
    target: fk.to.table,
    label: `${fk.from.column} → ${fk.to.column}`,
  }));

  return { nodes, edges };
}

export default function GraphPage() {
  // Active schema initially seeded as empty, replaced if a real SQLite file is opened.
  const [activeSchema, setActiveSchema] = useState<Schema>({
    tables: [],
    fks: [],
  });
  const [dbInfo, setDbInfo] = useState<DbInfo | null>(null);

  // Central DB context (WelcomePage controls connection lifecycle)
  const dbCtx = useDb();

  // Initialise from (priority): WelcomePage client bridge -> WelcomePage globals -> localStorage -> Tauri -> demo
  useMemo(() => {
    (async () => {
      // 0) Prefer the WelcomePage client bridge if available
      if (window.inklessClient?.getSchema || window.inklessClient?.getDbInfo) {
        try {
          const [bSchema, bInfo] = await Promise.all([
            window.inklessClient?.getSchema?.() ?? Promise.resolve(null),
            window.inklessClient?.getDbInfo?.() ?? Promise.resolve(null),
          ]);
          if (bSchema && Array.isArray(bSchema.tables)) {
            setActiveSchema(bSchema);
          }
          if (bInfo && bInfo.path) {
            setDbInfo(bInfo);
          }
          if (bSchema || bInfo) return; // initialised via bridge
        } catch (e) {
          console.warn('WelcomePage bridge failed, falling back.', e);
        }
      }

      try {
        // 1) WelcomePage may have placed schema/dbinfo on window after selection
        if (
          window.__INKLESS_SCHEMA__ &&
          Array.isArray(window.__INKLESS_SCHEMA__.tables)
        ) {
          setActiveSchema(window.__INKLESS_SCHEMA__);
        }
        if (window.__INKLESS_DBINFO__ && window.__INKLESS_DBINFO__.path) {
          setDbInfo(window.__INKLESS_DBINFO__);
        }
        if (window.__INKLESS_SCHEMA__ || window.__INKLESS_DBINFO__) return; // already initialised

        // 2) Fallback: localStorage (WelcomePage can persist here)
        try {
          const s = localStorage.getItem('inkless:schema');
          if (s) {
            const parsed = JSON.parse(s) as Schema;
            if (parsed && Array.isArray(parsed.tables)) setActiveSchema(parsed);
          }
          const d = localStorage.getItem('inkless:dbinfo');
          if (d) {
            const parsed = JSON.parse(d) as DbInfo;
            if (parsed && parsed.path) setDbInfo(parsed);
          }
          if (s || d) return; // obtained from storage
        } catch {}

        // 3) Desktop: ask Tauri backend
        if (tauriInvoke) {
          const info = (await tauriInvoke(
            'inkless_get_sqlite_info'
          )) as DbInfo | null;
          if (info && info.path) setDbInfo(info);
          const schema = (await tauriInvoke(
            'inkless_introspect_sqlite_schema'
          )) as Schema | null;
          if (schema && Array.isArray(schema.tables)) setActiveSchema(schema);
          return;
        }

        // 4) Otherwise: leave schema empty
      } catch (err) {
        console.warn(
          'Failed to initialise schema from WelcomePage/Tauri; leaving schema empty.',
          err
        );
      }
    })();
  }, []);

  // When a client is available from the context, ask it for the real schema & db meta.
  useEffect(() => {
    let cancelled = false;
    const fetchFromClient = async () => {
      // Debug: observe current context state before applying guards
      const conn: any = dbCtx?.connection;
      const hasPath = Boolean(conn?.path);
      const hasClient = Boolean(dbCtx?.client);
      if (!hasPath || !hasClient) {
        console.info('[DBG] skip fetchFromClient (tauri requires path):', {
          hasPath,
          hasClient,
        });
        return;
      }
      try {
        const c: any = dbCtx?.client;
        if (!c) return;
        // Prefer async getters if implemented by the client
        const [s, info] = await Promise.all([
          typeof c.getSchema === 'function'
            ? c.getSchema()
            : Promise.resolve(c.schema ?? null),
          typeof c.getDbInfo === 'function'
            ? c.getDbInfo()
            : Promise.resolve(c.dbInfo ?? c.info ?? c.meta ?? null),
        ]);

        if (!cancelled) {
          if (s && Array.isArray(s.tables)) setActiveSchema(s);
          if (info && info.path) setDbInfo(info);
        }
      } catch (e: any) {
        const msg = String(e?.message || e);
        // Quietly ignore readiness errors until the connection provides a source.
        if (/path is required/i.test(msg)) {
          return; // no log; effect will re-run when connection changes
        }
        // Log unexpected failures for diagnosis.
        console.warn(
          'Failed to fetch from DbClient; keeping current state.',
          e
        );
      }
    };
    fetchFromClient();
    return () => {
      cancelled = true;
    };
  }, [dbCtx?.client, dbCtx?.connection]);

  // Observe DbContext transitions (helps confirm WelcomePage -> Provider updates)
  useEffect(() => {
    // Expose for ad-hoc inspection from DevTools
    (window as any).__DBG_DBCTX__ = dbCtx;
  }, [dbCtx]);

  // Derive minimal dbInfo from the active connection so the header shows immediately.
  useEffect(() => {
    const conn: any = dbCtx?.connection;
    if (!conn) return;
    const path: string | undefined = conn.path;
    if (!path) return;

    setDbInfo((prev) => ({
      path,
      sizeBytes: prev?.sizeBytes,
    }));

    // On Tauri, fetch richer info (size, etc.) once available.
    if (tauriInvoke) {
      tauriInvoke('inkless_get_sqlite_info')
        .then((info: any) => {
          if (info && info.path) setDbInfo(info);
        })
        .catch(() => {
          /* ignore – we already show the basic path */
        });
    }
  }, [dbCtx?.connection]);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTableName, setNewTableName] = useState('new_table');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [rf, setRf] = useState<ReactFlowInstance | null>(null);

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => schemaToFlow(activeSchema),
    [activeSchema]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  // When the active schema changes, refresh nodes/edges to reflect the new DB.
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const focusNode = (id: string) => {
    const n = nodes.find((n) => n.id === id);
    if (n && rf) {
      rf.setCenter(
        n.position.x + FOCUS_OFFSET_X,
        n.position.y + FOCUS_OFFSET_Y,
        {
          zoom: FOCUS_ZOOM,
          duration: FOCUS_DURATION_MS,
        }
      );
    }
  };

  const onNodeClick: NodeMouseHandler = (_e, node) => {
    setSelectedId(node.id);
  };

  const loadPreview = async (tableName: string) => {
    setPreviewLoading(true);
    setPreviewError(null);
    setPreview(null);
    try {
      const client: any = dbCtx?.client;
      if (client && typeof client.getRows === 'function') {
        const res = await client.getRows({ table: tableName, limit: 5 });
        if (res && Array.isArray(res.rows)) {
          const cols = Array.isArray(res.columns)
            ? res.columns
            : res.rows[0]
              ? Object.keys(res.rows[0])
              : [];
          setPreview({ columns: cols, rows: res.rows });
          return;
        }
      }

      // Fallback: call into Tauri using a single canonical command.
      // Fallback: call into Tauri using a single canonical command.
      // We standardise on `db_get_rows` with a positional string only.
      if (tauriInvoke) {
        // Normalise backend replies into { columns, rows }
        const asPreview = (res: any): PreviewResult | null => {
          if (!res) return null;
          if (Array.isArray(res.rows)) {
            const cols = Array.isArray(res.columns)
              ? res.columns
              : res.rows[0]
                ? Object.keys(res.rows[0])
                : [];
            return { columns: cols, rows: res.rows };
          }
          if (Array.isArray(res)) {
            const cols = res[0] ? Object.keys(res[0]) : [];
            return { columns: cols, rows: res };
          }
          return null;
        };

        try {
          // Debug log the type and value of tableName before invoking db_get_rows.
          console.log(
            '[DBG] preview: db_get_rows arg typeof/value =',
            typeof tableName,
            tableName
          );
          console.log(
            '[DBG] preview: invoking db_get_rows (positional string) for table',
            tableName
          );
          const res = await tauriInvoke('db_get_rows', tableName as any);
          const preview = asPreview(res);
          if (preview) {
            setPreview(preview);
            return;
          }
          // If we reached here, the response shape was unexpected or empty.
          setPreviewError('Unexpected response from db_get_rows.');
          return;
        } catch (e: any) {
          const msg = String(e?.message || e);

          // If backend complains about type, attempt a robust raw-SQL fallback.
          if (/expected a string/i.test(msg) || /invalid args/i.test(msg)) {
            try {
              const sql = `SELECT * FROM "${String(tableName).split('"').join('""')}" LIMIT 5`;
              console.log(
                '[DBG] preview: falling back to inkless_exec_sql with',
                sql
              );
              const res2 = await tauriInvoke('inkless_exec_sql', {
                sql,
              } as any);
              const asPreview = (res: any): PreviewResult | null => {
                if (!res) return null;
                if (Array.isArray(res.rows)) {
                  const cols = Array.isArray(res.columns)
                    ? res.columns
                    : res.rows[0]
                      ? Object.keys(res.rows[0])
                      : [];
                  return { columns: cols, rows: res.rows };
                }
                if (Array.isArray(res)) {
                  const cols = res[0] ? Object.keys(res[0]) : [];
                  return { columns: cols, rows: res };
                }
                return null;
              };
              const preview2 = asPreview(res2);
              if (preview2) {
                setPreview(preview2);
                return;
              }
            } catch (e2) {
              // ignore and fall through to error surface
            }
          }

          // Surface a concise message and stop.
          setPreviewError(msg);
          return;
        }
      }

      setPreviewError('Row preview is not available for this connection.');
    } catch (e: any) {
      setPreviewError(String(e?.message || e));
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-gradient-to-br from-slate-50 via-violet-50 to-slate-100">
      <div className="mx-auto h-full max-w-[1400px] p-6">
        <div className="grid h-full min-w-0 grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
          {/* Left: schema browser (extracted) */}
          <div className="relative h-full">
            <SchemaBrowser
              schema={{ tables: activeSchema.tables }}
              query={query}
              onQueryChange={setQuery}
              selectedId={selectedId}
              onSelect={(name) => {
                setSelectedId(name);
                focusNode(name);
              }}
              onCreate={() => setIsCreateOpen(true)}
              className="fixed left-0 top-0 z-30"
            />
          </div>
          {/* Right: ER diagram */}
          <div className="relative flex min-w-0 flex-col">
            <div className="relative flex-1 overflow-hidden">
              {/* Modal: create table (unchanged) */}
              {isCreateOpen && (
                <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                  <Card className="w-[720px] max-w-[95vw]">
                    <CardHeader>
                      <CardTitle className="text-violet-700">
                        Create new table
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label htmlFor="table-name">Table name</Label>
                        <Input
                          id="table-name"
                          value={newTableName}
                          onChange={(e) => setNewTableName(e.target.value)}
                        />
                      </div>
                      <p className="text-xs text-zinc-500">
                        * This is a minimal placeholder. We'll extend this to
                        full column/PK/FK editor next.
                      </p>
                    </CardContent>
                    <CardFooter className="justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setIsCreateOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button onClick={() => setIsCreateOpen(false)}>
                        Create
                      </Button>
                    </CardFooter>
                  </Card>
                </div>
              )}

              {isPreviewOpen && (
                <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                  <Card className="w-[880px] max-w-[95vw]">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle className="text-violet-700">
                        {selectedId ? `Preview: ${selectedId}` : 'Preview'}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsPreviewOpen(false)}
                        >
                          Close
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {previewLoading && (
                        <div className="py-6 text-center text-sm text-slate-600">
                          Loading preview…
                        </div>
                      )}
                      {previewError && (
                        <div className="py-6 text-center text-sm text-red-600">
                          {previewError}
                        </div>
                      )}
                      {!previewLoading && !previewError && preview && (
                        <div className="overflow-auto rounded-md border">
                          <table className="w-full table-auto text-sm">
                            <thead className="bg-violet-50 text-slate-700">
                              <tr>
                                {preview.columns.map((c) => (
                                  <th
                                    key={c}
                                    className="whitespace-nowrap px-3 py-2 text-left font-medium"
                                  >
                                    {c}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {preview.rows.length === 0 ? (
                                <tr>
                                  <td
                                    className="px-3 py-3 text-center text-slate-500"
                                    colSpan={Math.max(
                                      1,
                                      preview.columns.length
                                    )}
                                  >
                                    (no rows)
                                  </td>
                                </tr>
                              ) : (
                                preview.rows.map((r, i) => (
                                  <tr key={i} className="hover:bg-violet-50/40">
                                    {preview.columns.map((c) => (
                                      <td
                                        key={c}
                                        className="whitespace-nowrap px-3 py-2 align-top text-slate-700"
                                      >
                                        {(() => {
                                          const v = r?.[c];
                                          if (v === null || v === undefined)
                                            return (
                                              <span className="text-slate-400">
                                                NULL
                                              </span>
                                            );
                                          if (typeof v === 'object')
                                            return (
                                              <code className="text-xs">
                                                {JSON.stringify(v)}
                                              </code>
                                            );
                                          return String(v);
                                        })()}
                                      </td>
                                    ))}
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Canvas panel */}
              <div className="absolute inset-0 flex flex-col rounded-xl border border-violet-200/50 bg-violet-200/70 p-2 shadow-lg backdrop-blur-sm">
                {/* Header: ER diagram title and DB info */}
                <div className="mb-1 flex min-h-[3.25rem] items-center px-2 pb-3 pr-24">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="shrink-0 bg-gradient-to-r from-violet-700 via-fuchsia-600 to-violet-700 bg-clip-text text-lg font-semibold text-transparent">
                      ER diagram
                    </span>

                    {/* File info pill now sits next to the title, avoiding overlap with the right toolbar */}
                    <div className="ml-3 flex min-w-0 items-center gap-1.5 rounded-full border border-violet-200/60 bg-white/70 px-2 py-1 shadow-sm backdrop-blur-sm">
                      {dbInfo?.path ? (
                        <>
                          <FileText
                            className="h-4 w-4 shrink-0 text-violet-700"
                            aria-hidden
                          />
                          <span
                            title={dbInfo.path}
                            className="min-w-0 max-w-[52ch] truncate text-sm text-slate-700"
                          >
                            {dbInfo.path.split(/[\\/]/).pop()}
                          </span>
                          {typeof dbInfo.sizeBytes === 'number' && (
                            <span className="ml-2 shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-700">
                              {formatBytes(dbInfo.sizeBytes)}
                            </span>
                          )}
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="ml-1 h-7 w-7 shrink-0 text-slate-600 hover:text-slate-900"
                            onClick={() => {
                              try {
                                if (dbInfo?.path)
                                  navigator.clipboard?.writeText(dbInfo.path);
                              } catch {}
                            }}
                            aria-label="Copy file path"
                            title="Copy file path"
                          >
                            <Clipboard className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <span className="rounded-full border border-dashed border-slate-300 bg-white/60 px-3 py-1 text-xs text-slate-600">
                          No database loaded
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Floating toolbar (top‑right) */}
                <div className="pointer-events-auto absolute right-3 top-3 z-10 flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    className="mr-1 border-violet-200/60 bg-white/70 backdrop-blur-sm hover:bg-white/90"
                    aria-label="End session and return to Welcome"
                    title="End session and return to Welcome"
                    onClick={async () => {
                      try {
                        // Politely disconnect the shared DbContext if available
                        dbCtx?.disconnect?.();
                      } catch {}
                      try {
                        // Ask backend (if present) to clear its connection state
                        if (tauriInvoke) {
                          try {
                            await tauriInvoke('inkless_disconnect');
                          } catch {}
                        }
                      } catch {}
                      try {
                        // Clear any globals and cached schema/info so we land fresh on Welcome
                        delete (window as any).__INKLESS_SCHEMA__;
                        delete (window as any).__INKLESS_DBINFO__;
                        localStorage.removeItem('inkless:schema');
                        localStorage.removeItem('inkless:dbinfo');
                      } catch {}
                      try {
                        // Give the host app a chance to handle navigation (App may listen for this)
                        window.dispatchEvent(
                          new CustomEvent('inkless:navigate', {
                            detail: 'welcome',
                          })
                        );
                      } catch {}
                      // Fallback: refresh. App defaults should render the Welcome view on a clean boot.
                      window.location.reload();
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="border-violet-200/60 bg-white/70 backdrop-blur-sm hover:bg-white/90"
                    aria-label="Zoom out"
                    onClick={() => rf?.zoomOut?.()}
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="border-violet-200/60 bg-white/70 backdrop-blur-sm hover:bg-white/90"
                    aria-label="Zoom in"
                    onClick={() => rf?.zoomIn?.()}
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="border-violet-200/60 bg-white/70 backdrop-blur-sm hover:bg-white/90"
                    aria-label="Fit view"
                    onClick={() => rf?.fitView?.({ duration: 300 })}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="border-violet-200/60 bg-white/70 backdrop-blur-sm hover:bg-white/90"
                    aria-label="Centre selected"
                    onClick={() => selectedId && focusNode(selectedId)}
                    disabled={!selectedId}
                    title={
                      selectedId
                        ? `Centre ${selectedId}`
                        : 'Select a table to centre'
                    }
                  >
                    <Crosshair className="h-4 w-4" />
                  </Button>
                  {selectedId && (
                    <Button
                      size="icon"
                      variant="outline"
                      className="ml-2 h-9 border-violet-200/60 bg-white/70 px-2 py-0 text-xs leading-none backdrop-blur-sm hover:bg-white/90"
                      onClick={async () => {
                        setIsPreviewOpen(true);
                        await loadPreview(selectedId);
                      }}
                      aria-label="Preview first 5 rows"
                      title="Preview first 5 rows"
                    >
                      <Table className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {/* Canvas body */}
                <div className="mx-auto min-h-0 w-full max-w-[1100px] flex-1">
                  <GraphCanvas
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    nodeTypes={nodeTypes}
                    onInit={setRf}
                    onNodeClick={onNodeClick}
                    fitView
                    // Trim default fit padding so diagrams do not appear overly wide.
                    // GraphCanvas should forward this to ReactFlow's `fitViewOptions` internally.
                    fitViewOptions={{ padding: 0.35 }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
