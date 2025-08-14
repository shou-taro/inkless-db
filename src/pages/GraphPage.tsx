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
import { ZoomIn, ZoomOut, Maximize2, Crosshair } from 'lucide-react';

import SchemaBrowser from '@/components/SchemaBrowser';
import GraphCanvas from '@/components/GraphCanvas';
import TableNode from '@/components/TableNode';

/**
 * Layout and colour tokens
 * ------------------------
 * Extracted to avoid magic numbers and scattered hex values.
 * These align with Tailwind tokens configured in tailwind.config.js where possible.
 */
const SPACING_X = 360; // horizontal gap between table nodes
const SPACING_Y = 240; // vertical gap between table nodes
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
  openedAt?: string; // ISO string
};

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
  console.log('[DBG] schemaToFlow input:', {
    tableCount: schema.tables.length,
    fkCount: schema.fks.length,
  });
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

  useEffect(() => {
    console.log('[DBG] activeSchema updated:', {
      tables: activeSchema?.tables?.length ?? 0,
      fks: activeSchema?.fks?.length ?? 0,
      sampleTables: activeSchema?.tables?.slice(0, 3)?.map((t) => t.name),
    });
  }, [activeSchema]);

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
      console.log('[DBG] fetchFromClient guards:', {
        status: (dbCtx as any)?.status,
        hasClient: Boolean(dbCtx?.client),
        connection: {
          hasPath: Boolean(conn?.path),
          hasFile: Boolean(conn?.file),
          path: conn?.path,
        },
      });
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
        console.log('[DBG] DbClient.getSchema result:', s);
        console.log('[DBG] DbClient.getDbInfo result:', info);
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
    console.log('[DBG] DbContext changed:', {
      status: (dbCtx as any)?.status,
      hasClient: Boolean(dbCtx?.client),
      connection: (dbCtx as any)?.connection,
    });
    // Expose for ad-hoc inspection from DevTools
    (window as any).__DBG_DBCTX__ = dbCtx;
  }, [dbCtx]);

  // Derive minimal dbInfo from the active connection so the header shows immediately.
  useEffect(() => {
    console.log(
      '[DBG] derive dbInfo from connection:',
      (dbCtx as any)?.connection
    );
    const conn: any = dbCtx?.connection;
    if (!conn) return;
    const path: string | undefined = conn.path;
    if (!path) return;

    console.log('[DBG] inferred dbInfo path (tauri):', path);
    setDbInfo((prev) => ({
      path,
      sizeBytes: prev?.sizeBytes,
      openedAt: prev?.openedAt ?? new Date().toISOString(),
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

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => schemaToFlow(activeSchema),
    [activeSchema]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  // When the active schema changes, refresh nodes/edges to reflect the new DB.
  useEffect(() => {
    console.log('[DBG] initial flow:', {
      nodes: initialNodes.length,
      edges: initialEdges.length,
    });
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

  return (
    <div className="h-screen w-screen overflow-hidden bg-gradient-to-br from-violet-50 via-fuchsia-200/50 to-violet-400">
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

              {/* Canvas panel */}
              <div className="absolute inset-0 flex flex-col rounded-xl border border-violet-100/60 bg-white/80 p-2 shadow-lg backdrop-blur">
                {/* Header: ER diagram title and DB info */}
                <div className="flex min-h-[3.25rem] items-center px-2 pb-1">
                  <span className="mr-4 shrink-0 text-lg font-semibold text-violet-800">
                    ER diagram
                  </span>
                  <div className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
                    {dbInfo?.path ? (
                      <>
                        <span className="mx-2 text-violet-300">•</span>
                        <span
                          title={dbInfo.path}
                          className="max-w-[44ch] truncate"
                        >
                          {dbInfo.path.split(/[\\/]/).pop()}
                        </span>
                        {typeof dbInfo.sizeBytes === 'number' && (
                          <span className="text-xs text-slate-500">
                            ({formatBytes(dbInfo.sizeBytes)})
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="rounded border border-dashed border-violet-200 px-2 py-0.5 text-xs text-violet-600">
                        No database loaded
                      </span>
                    )}
                  </div>
                </div>
                {/* Floating toolbar (top‑right) */}
                <div className="pointer-events-auto absolute right-3 top-3 z-10 flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    className="border-violet-200 hover:bg-violet-50"
                    aria-label="Zoom out"
                    onClick={() => rf?.zoomOut?.()}
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="border-violet-200 hover:bg-violet-50"
                    aria-label="Zoom in"
                    onClick={() => rf?.zoomIn?.()}
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="border-violet-200 hover:bg-violet-50"
                    aria-label="Fit view"
                    onClick={() => rf?.fitView?.({ duration: 300 })}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="border-violet-200 hover:bg-violet-50"
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
                </div>
                {/* Canvas body */}
                <div className="min-h-0 w-full flex-1">
                  {nodes.length === 0 && (
                    <div className="pointer-events-none absolute inset-x-0 top-[4.5rem] z-10 text-center text-sm text-violet-700/70">
                      Loading ER diagram…
                    </div>
                  )}
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
                    fitViewOptions={{ padding: 0.2 }}
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
