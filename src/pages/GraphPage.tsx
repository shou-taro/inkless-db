import { useEffect, useMemo, useState } from 'react';
import { useConnection } from '@/store/connection';
import { getSchema, type DatabaseSchema } from '@/lib/db/tauri';
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

// Types for schema: derived from backend schema, adapted minimally for view model here.
// These types are still used for the UI, but are populated from DatabaseSchema.
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

type PreviewResult = { columns: string[]; rows: any[] };

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

export default function GraphPage({ onExit }: { onExit: () => void }) {
  // Active schema initially seeded as empty, replaced if a real SQLite file is opened.
  const [activeSchema, setActiveSchema] = useState<Schema>({
    tables: [],
    fks: [],
  });
  const { state, clearConnection } = useConnection();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!state.connId) {
        // No active connection; notify parent to exit
        onExit();
        return;
      }
      try {
        const raw: DatabaseSchema = await getSchema(state.connId);
        if (cancelled) return;
        // Adapt backend schema to the view model expected by this page
        const tables = raw.tables.map((t) => ({
          name: t.name,
          columns: t.columns.map((c) => ({
            name: c.name,
            type: c.data_type,
            isPrimary: !!c.is_pk,
          })),
        }));
        const fks: ForeignKey[] = raw.tables.flatMap((t) =>
          (t.foreign_keys ?? []).map((fk) => ({
            from: { table: t.name, column: fk.from },
            to: { table: fk.to_table, column: fk.to },
          }))
        );
        setActiveSchema({ tables, fks });
      } catch (e) {
        console.error('Failed to load schema:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [state.connId, state, onExit]);

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
      throw new Error('Row preview is not available for this connection yet.');
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
                                          const idx =
                                            preview.columns.indexOf(c);
                                          const v = Array.isArray(r)
                                            ? idx >= 0
                                              ? r[idx]
                                              : undefined
                                            : r?.[c];
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
                      {state.connId ? (
                        <>
                          <FileText
                            className="h-4 w-4 shrink-0 text-violet-700"
                            aria-hidden
                          />
                          <span className="min-w-0 max-w-[52ch] truncate text-sm text-slate-700">
                            Connected
                          </span>
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
                      try { clearConnection(); } catch {}
                      onExit();
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
