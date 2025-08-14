import { useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  Node,
  Edge,
  useEdgesState,
  useNodesState,
  MarkerType,
  BackgroundVariant,
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
import { BarChart3, ChevronLeft, ChevronRight, Table } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ListPanel } from '@/components/ListPanel';

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

type ColumnMetrics = {
  nullPct: number; // 0-100
  distinctPct: number; // 0-100
  p95?: number; // numeric p95
  p95len?: number; // text length p95
  min?: number;
  max?: number;
  median?: number;
  mean?: number;
  examples?: string[]; // sample values for text
};

type TableMetrics = {
  orphanRatePct: number; // orphan rows rate for FKs in this table (child side)
  duplicateRowPct: number; // duplicate entire-row rate (heuristic)
  columns: Record<string, ColumnMetrics>;
};

const mockTableMetrics: Record<string, TableMetrics> = {
  users: {
    orphanRatePct: 0,
    duplicateRowPct: 0.3,
    columns: {
      id: {
        nullPct: 0,
        distinctPct: 100,
        min: 1,
        p95: 120,
        max: 999,
        median: 60,
        mean: 65,
      },
      email: {
        nullPct: 2,
        distinctPct: 98,
        p95len: 28,
        examples: ['a@example.com', 'b@domain.jp'],
      },
      name: {
        nullPct: 5,
        distinctPct: 92,
        p95len: 16,
        examples: ['Alice', 'Bob'],
      },
      created_at: { nullPct: 0, distinctPct: 95 },
    },
  },
  posts: {
    orphanRatePct: 1.5, // some user_id not found in users (example)
    duplicateRowPct: 0.1,
    columns: {
      id: {
        nullPct: 0,
        distinctPct: 100,
        min: 1,
        p95: 800,
        max: 1200,
        median: 400,
        mean: 420,
      },
      user_id: { nullPct: 0.2, distinctPct: 75, p95: 1000, max: 1200 },
      title: {
        nullPct: 1,
        distinctPct: 85,
        p95len: 40,
        examples: ['Hello world', 'My post'],
      },
      published_at: { nullPct: 35, distinctPct: 70 },
    },
  },
  comments: {
    orphanRatePct: 3.2,
    duplicateRowPct: 0.6,
    columns: {
      id: {
        nullPct: 0,
        distinctPct: 100,
        min: 1,
        p95: 2000,
        max: 4000,
        median: 900,
        mean: 980,
      },
      post_id: { nullPct: 0.1, distinctPct: 60, p95: 1500, max: 4000 },
      author: {
        nullPct: 4,
        distinctPct: 70,
        p95len: 14,
        examples: ['guest', 'alice'],
      },
      body: {
        nullPct: 2,
        distinctPct: 65,
        p95len: 120,
        examples: ['Nice!', 'Thanks for sharing'],
      },
    },
  },
};

function getTableMetrics(tableName: string | null): TableMetrics | null {
  if (!tableName) return null;
  return mockTableMetrics[tableName] || null;
}

function getColumnMetrics(
  tableName: string | null,
  colName: string
): ColumnMetrics | null {
  if (!tableName) return null;
  const t = mockTableMetrics[tableName];
  if (!t) return null;
  return t.columns[colName] || null;
}

const demoSchema: Schema = {
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id', type: 'INTEGER', isPrimary: true },
        { name: 'email', type: 'TEXT' },
        { name: 'name', type: 'TEXT' },
        { name: 'created_at', type: 'DATETIME' },
      ],
      meta: {
        createdAt: '2024-06-01T10:00:00Z',
        updatedAt: '2025-08-10T08:30:00Z',
        approxRows: 1243,
      },
    },
    {
      name: 'posts',
      columns: [
        { name: 'id', type: 'INTEGER', isPrimary: true },
        { name: 'user_id', type: 'INTEGER' },
        { name: 'title', type: 'TEXT' },
        { name: 'published_at', type: 'DATETIME' },
      ],
      meta: {
        createdAt: '2024-07-15T09:00:00Z',
        updatedAt: '2025-08-12T14:05:00Z',
        approxRows: 5120,
      },
    },
    {
      name: 'comments',
      columns: [
        { name: 'id', type: 'INTEGER', isPrimary: true },
        { name: 'post_id', type: 'INTEGER' },
        { name: 'author', type: 'TEXT' },
        { name: 'body', type: 'TEXT' },
      ],
      meta: {
        createdAt: '2024-07-20T12:00:00Z',
        updatedAt: '2025-08-13T21:12:00Z',
        approxRows: 17890,
      },
    },
  ],
  fks: [
    {
      from: { table: 'posts', column: 'user_id' },
      to: { table: 'users', column: 'id' },
    },
    {
      from: { table: 'comments', column: 'post_id' },
      to: { table: 'posts', column: 'id' },
    },
  ],
};

const TableNode = ({ data }: any) => {
  const { table }: { table: Table } = data;
  return (
    <div className="rounded-2xl border border-violet-300 bg-white/90 shadow-sm backdrop-blur">
      <div className="rounded-t-2xl bg-gradient-to-r from-[#f3e8ff] via-[#e9d5ff] to-[#d8b4fe] px-4 py-2">
        <div className="text-sm font-semibold text-violet-700">
          {table.name}
        </div>
      </div>
      <div className="px-4 py-2">
        <ul className="space-y-1">
          {table.columns.map((c) => (
            <li
              key={c.name}
              className="flex items-center justify-between text-[12px] leading-5"
            >
              <span className="font-medium text-zinc-800">
                {c.isPrimary ? '🔑 ' : ''}
                {c.name}
              </span>
              <span className="text-zinc-500">{c.type}</span>
            </li>
          ))}
        </ul>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        className="!bg-violet-400"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-violet-400"
      />
    </div>
  );
};

const nodeTypes = { table: TableNode };

function schemaToFlow(schema: Schema) {
  const spacingX = 360;
  const spacingY = 240;

  const nodes: Node[] = schema.tables.map((t, idx) => ({
    id: t.name,
    type: 'table',
    position: {
      x: 80 + (idx % 3) * spacingX,
      y: 60 + Math.floor(idx / 3) * spacingY,
    },
    data: { table: t },
  }));

  const edges: Edge[] = schema.fks.map((fk, i) => ({
    id: `fk-${i}-${fk.from.table}.${fk.from.column}->${fk.to.table}.${fk.to.column}`,
    source: fk.from.table,
    target: fk.to.table,
    label: `${fk.from.column} → ${fk.to.column}`,
    // type: "default", // 明示しなくてもOK
    // animated: false, // デフォルト false なので不要
    style: { stroke: '#8b5cf6', strokeWidth: 2 },
    labelStyle: { fill: '#6b7280', fontSize: 10, fontWeight: 600 },
    markerEnd: {
      type: MarkerType.ArrowClosed, // ← ここを列挙体で
      width: 18,
      height: 18,
      color: '#8b5cf6',
    },
  }));

  return { nodes, edges };
}

export default function GraphPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTableName, setNewTableName] = useState('new_table');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [rf, setRf] = useState<ReactFlowInstance | null>(null);
  const [isStatsOpen, setIsStatsOpen] = useState(true);

  const getTable = (id: string | null) =>
    demoSchema.tables.find((t) => t.name === id) || null;
  const focusNode = (id: string) => {
    const n = nodes.find((n) => n.id === id);
    if (n && rf) {
      rf.setCenter(n.position.x + 120, n.position.y + 60, {
        zoom: 1.1,
        duration: 300,
      });
    }
  };

  const onNodeClick: NodeMouseHandler = (_e, node) => {
    setSelectedId(node.id);
  };

  const prettyType = (t: string) => (t || 'UNKNOWN').toUpperCase();
  const formatDate = (ts?: number) =>
    ts ? new Date(ts).toLocaleDateString() : '—';
  const formatNumber = (n?: number) =>
    typeof n === 'number' ? n.toLocaleString() : '—';

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => schemaToFlow(demoSchema),
    []
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const stats = useMemo(() => {
    const tables = demoSchema.tables.length;
    const columns = demoSchema.tables.reduce(
      (acc, t) => acc + t.columns.length,
      0
    );
    const fks = demoSchema.fks.length;
    const avgCols = tables ? columns / tables : 0;

    // degree (in/out) per table
    const degreeMap: Record<
      string,
      { in: number; out: number; total: number }
    > = {};
    demoSchema.tables.forEach(
      (t) => (degreeMap[t.name] = { in: 0, out: 0, total: 0 })
    );
    demoSchema.fks.forEach((f) => {
      if (degreeMap[f.from.table]) degreeMap[f.from.table].out++;
      if (degreeMap[f.to.table]) degreeMap[f.to.table].in++;
    });
    Object.keys(degreeMap).forEach(
      (k) => (degreeMap[k].total = degreeMap[k].in + degreeMap[k].out)
    );

    // hubs & orphans
    const sortedByDegree = Object.entries(degreeMap).sort(
      (a, b) => b[1].total - a[1].total
    );
    const topHubs = sortedByDegree
      .slice(0, 3)
      .map(([name, d]) => ({ name, degree: d.total }));
    const topHub = sortedByDegree[0]?.[0] ?? null;
    const topHubDegree = sortedByDegree[0]?.[1].total ?? 0;
    const orphanTables = Object.entries(degreeMap)
      .filter(([, d]) => d.total === 0)
      .map(([k]) => k);

    // sources (only outgoing), sinks (only incoming)
    const sources = Object.entries(degreeMap)
      .filter(([, d]) => d.out > 0 && d.in === 0)
      .map(([k]) => k);
    const sinks = Object.entries(degreeMap)
      .filter(([, d]) => d.in > 0 && d.out === 0)
      .map(([k]) => k);

    // PK coverage
    const tablesWithPk = demoSchema.tables.filter((t) =>
      t.columns.some((c) => c.isPrimary)
    ).length;
    const pkCoverage = tables ? Math.round((tablesWithPk / tables) * 100) : 0;

    // Additional overview metrics
    const fkPerTable = tables ? +(fks / tables).toFixed(2) : 0;
    const connectivityPct = tables
      ? Math.round(((tables - orphanTables.length) / tables) * 100)
      : 0;
    const graphDensity =
      tables > 1 ? +(fks / (tables * (tables - 1))).toFixed(3) : 0; // directed density

    // --- Augmented stats ---
    // self-referential FKs (table -> same table)
    const selfRefCount = demoSchema.fks.filter(
      (f) => f.from.table === f.to.table
    ).length;

    // reciprocal links (A->B and B->A) counted once per unordered pair
    const pairSet = new Set<string>();
    const edgesSet = new Set(
      demoSchema.fks.map((f) => `${f.from.table}->${f.to.table}`)
    );
    demoSchema.fks.forEach((f) => {
      const a = f.from.table,
        b = f.to.table;
      if (a !== b && edgesSet.has(`${b}->${a}`)) {
        const key = [a, b].sort().join('<>');
        pairSet.add(key);
      }
    });
    const reciprocalPairsCount = pairSet.size;

    // connected components (treat FKs as undirected for connectivity)
    const names = demoSchema.tables.map((t) => t.name);
    const undirected: Record<string, Set<string>> = {};
    names.forEach((n) => (undirected[n] = new Set()));
    demoSchema.fks.forEach((f) => {
      undirected[f.from.table].add(f.to.table);
      undirected[f.to.table].add(f.from.table);
    });
    const seen = new Set<string>();
    let componentsCount = 0;
    const stack: string[] = [];
    for (const n of names) {
      if (seen.has(n)) continue;
      componentsCount++;
      stack.push(n);
      while (stack.length) {
        const u = stack.pop()!;
        if (seen.has(u)) continue;
        seen.add(u);
        undirected[u].forEach((v) => {
          if (!seen.has(v)) stack.push(v);
        });
      }
    }

    // cycle detection in directed graph
    const adj: Record<string, string[]> = {};
    names.forEach((n) => (adj[n] = []));
    demoSchema.fks.forEach((f) => {
      adj[f.from.table].push(f.to.table);
    });
    const temp = new Set<string>();
    const perm = new Set<string>();
    let hasCycle = false;
    const visit = (u: string) => {
      if (temp.has(u)) {
        hasCycle = true;
        return;
      }
      if (perm.has(u) || hasCycle) return;
      temp.add(u);
      for (const v of adj[u]) visit(v);
      temp.delete(u);
      perm.add(u);
    };
    names.forEach(visit);

    // column type distribution (normalized to upper)
    const typeCounts: Record<string, number> = {};
    demoSchema.tables.forEach((t) =>
      t.columns.forEach((c) => {
        const key = (c.type || 'UNKNOWN').toUpperCase();
        typeCounts[key] = (typeCounts[key] || 0) + 1;
      })
    );
    const typeDist = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    const maxTypeCount = typeDist[0]?.[1] ?? 0;

    // table-level metadata aggregates
    const metaRec = demoSchema.tables.map((t) => ({
      name: t.name,
      createdTs: t.meta?.createdAt ? Date.parse(t.meta.createdAt) : NaN,
      updatedTs: t.meta?.updatedAt ? Date.parse(t.meta.updatedAt) : NaN,
      rows: t.meta?.approxRows ?? 0,
    }));
    const validCreated = metaRec.filter((m) => Number.isFinite(m.createdTs));
    const validUpdated = metaRec.filter((m) => Number.isFinite(m.updatedTs));
    const earliestCreatedTs = validCreated.length
      ? Math.min(...validCreated.map((m) => m.createdTs))
      : undefined;
    const latestUpdatedTs = validUpdated.length
      ? Math.max(...validUpdated.map((m) => m.updatedTs))
      : undefined;
    const totalApproxRows = metaRec.reduce((acc, m) => acc + (m.rows || 0), 0);
    const recentTables = validUpdated
      .sort((a, b) => b.updatedTs - a.updatedTs)
      .slice(0, 3);

    // selected table stats
    const sel = selectedId
      ? demoSchema.tables.find((t) => t.name === selectedId)
      : null;
    const selOut = selectedId ? (degreeMap[selectedId]?.out ?? 0) : 0;
    const selIn = selectedId ? (degreeMap[selectedId]?.in ?? 0) : 0;
    const selCols = sel?.columns.length ?? 0;

    return {
      tables,
      columns,
      fks,
      avgCols,
      pkCoverage,
      orphanCount: orphanTables.length,
      orphanTables,
      topHub,
      topHubDegree,
      sourcesCount: sources.length,
      sinksCount: sinks.length,
      typeDist,
      maxTypeCount,
      selCols,
      selOut,
      selIn,
      // new metrics
      fkPerTable,
      connectivityPct,
      graphDensity,
      topHubs,
      // augmented stats
      selfRefCount,
      reciprocalPairsCount,
      componentsCount,
      hasCycle,
      // meta overview
      earliestCreatedTs,
      latestUpdatedTs,
      totalApproxRows,
      recentTables,
    };
  }, [selectedId]);

  return (
    <div className="h-screen w-full overflow-hidden bg-gradient-to-br from-[#f3e8ff] via-[#e9e5ff] to-[#d8b4fe]">
      <div className="flex h-full">
        {/* Left: schema browser */}
        <div className="pointer-events-auto z-10 my-4 ml-4 mr-4 hidden h-[calc(100%-2rem)] w-80 rounded-xl border border-violet-200/60 bg-white/80 p-3 shadow-lg backdrop-blur lg:block">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-violet-700">
              <Table className="h-4 w-4" />
              Tables
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                {demoSchema.tables.length}
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setIsCreateOpen(true)}
              >
                + New table
              </Button>
            </div>
          </div>
          <Input
            placeholder="Filter tables…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-2 h-8"
          />
          <div className="flex h-[calc(100%-88px)] flex-col overflow-hidden">
            {/* list */}
            <div className="flex-1 overflow-y-auto pr-1">
              {demoSchema.tables
                .filter((t) =>
                  t.name.toLowerCase().includes(query.toLowerCase())
                )
                .map((t) => (
                  <button
                    key={t.name}
                    onClick={() => {
                      setSelectedId(t.name);
                      focusNode(t.name);
                    }}
                    className={`group mb-1 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-violet-50 ${
                      selectedId === t.name ? 'bg-violet-100' : ''
                    }`}
                  >
                    <span className="truncate font-medium text-zinc-800">
                      {t.name}
                    </span>
                    <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600">
                      {t.columns.length}
                    </span>
                  </button>
                ))}
            </div>

            {/* details */}
            <div className="mt-2 shrink-0 rounded-lg border bg-white">
              {selectedId ? (
                <div className="max-h-72 overflow-y-auto p-2">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="truncate text-sm font-semibold text-violet-700">
                      {selectedId}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => focusNode(selectedId!)}
                    >
                      Focus
                    </Button>
                  </div>
                  <div className="text-xs text-zinc-500">Columns</div>
                  <table className="mt-1 w-full text-sm">
                    <tbody>
                      {getTable(selectedId)?.columns.map((c) => (
                        <tr key={c.name} className="border-b last:border-none">
                          <td className="px-2 py-1 font-medium text-zinc-800">
                            {c.isPrimary ? '🔑 ' : ''}
                            {c.name}
                          </td>
                          <td className="px-2 py-1 text-right text-zinc-600">
                            {c.type}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-2 text-xs text-zinc-500">Relations</div>
                  {demoSchema.fks.filter(
                    (f) =>
                      f.from.table === selectedId || f.to.table === selectedId
                  ).length === 0 ? (
                    <div className="mt-1 rounded border border-dashed p-2 text-xs text-zinc-400">
                      No relations.
                    </div>
                  ) : (
                    <ul className="mt-1 space-y-1 text-xs text-zinc-700">
                      {demoSchema.fks
                        .filter(
                          (f) =>
                            f.from.table === selectedId ||
                            f.to.table === selectedId
                        )
                        .map((f, i) => (
                          <li
                            key={i}
                            className="flex items-center justify-between"
                          >
                            <span className="truncate">
                              {f.from.table}.{f.from.column} → {f.to.table}.
                              {f.to.column}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => focusNode(f.to.table)}
                            >
                              Go
                            </Button>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="p-3 text-center text-xs text-zinc-500">
                  Select a table to see details
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Right: ER diagram header */}
        <div className="flex flex-1 flex-col">
          <div className="flex h-14 items-center px-3">
            <div className="text-sm text-zinc-600">ER diagram</div>
            <div className="ml-auto">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsStatsOpen((v) => !v)}
                aria-expanded={isStatsOpen}
              >
                <BarChart3 className="mr-1 h-4 w-4" />{' '}
                {isStatsOpen ? 'Hide stats' : 'Show stats'}
              </Button>
            </div>
          </div>
          <div className="relative flex-1 overflow-hidden">
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
                      * This is a minimal placeholder. We'll extend this to full
                      column/PK/FK editor next.
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
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              fitView
              onInit={setRf}
              onNodeClick={onNodeClick}
              proOptions={{ hideAttribution: true }}
              defaultEdgeOptions={{ type: 'default' }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
              <MiniMap
                pannable
                zoomable
                nodeStrokeColor={() => '#a78bfa'}
                nodeColor={() => '#ede9fe'}
                maskColor="rgba(0,0,0,0.05)"
              />
              <Controls />
            </ReactFlow>

            {/* Right floating stats sidebar */}
            <div
              className={`pointer-events-auto absolute bottom-4 right-4 top-4 z-20 w-80 transform rounded-xl border border-violet-200/60 bg-white/85 p-3 shadow-lg backdrop-blur transition-transform duration-300 ${isStatsOpen ? 'translate-x-0' : 'translate-x-[calc(100%+1rem)]'}`}
              aria-hidden={!isStatsOpen}
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-violet-700">
                  <BarChart3 className="h-4 w-4" /> Stats
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsStatsOpen(false)}
                  aria-label="Close stats"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Tabs defaultValue="overview" className="mt-1">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="quality">Quality</TabsTrigger>
                  <TabsTrigger value="columns">Columns</TabsTrigger>
                </TabsList>

                {/* OVERVIEW */}
                <TabsContent value="overview" className="mt-2 space-y-3">
                  {/* Top KPIs */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border bg-white p-2">
                      <div className="text-[10px] text-zinc-500">Tables</div>
                      <div className="text-xl font-semibold text-zinc-800">
                        {stats.tables}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-white p-2">
                      <div className="text-[10px] text-zinc-500">
                        FKs (relations)
                      </div>
                      <div className="text-xl font-semibold text-zinc-800">
                        {stats.fks}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-white p-2">
                      <div className="text-[10px] text-zinc-500">
                        PK coverage
                      </div>
                      <div className="text-xl font-semibold text-zinc-800">
                        {stats.pkCoverage}%
                      </div>
                    </div>
                    <div className="rounded-lg border bg-white p-2">
                      <div className="text-[10px] text-zinc-500">
                        Orphan tables
                      </div>
                      <div className="text-xl font-semibold text-zinc-800">
                        {stats.orphanCount}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-white p-2">
                      <div className="text-[10px] text-zinc-500">
                        Last updated
                      </div>
                      <div className="text-sm font-medium text-zinc-800">
                        {formatDate(stats.latestUpdatedTs)}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-white p-2">
                      <div className="text-[10px] text-zinc-500">
                        Approx rows (total)
                      </div>
                      <div className="text-sm font-medium text-zinc-800">
                        {formatNumber(stats.totalApproxRows)}
                      </div>
                    </div>
                  </div>

                  {/* Top hubs list */}
                  {stats.topHubs && stats.topHubs.length > 0 && (
                    <ListPanel title="Top hubs">
                      <ul className="divide-y">
                        {stats.topHubs.map((h: any) => (
                          <li
                            key={h.name}
                            className="flex items-center justify-between px-2.5 py-1.5 text-xs"
                          >
                            <span className="truncate text-zinc-700">
                              {h.name}
                            </span>
                            <span className="rounded border bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-700">
                              {h.degree}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </ListPanel>
                  )}

                  {/* Recently updated preview */}
                  {stats.recentTables && stats.recentTables.length > 0 && (
                    <ListPanel title="Recently updated">
                      <ul className="divide-y">
                        {stats.recentTables.map((r: any) => (
                          <li
                            key={r.name}
                            className="flex items-center justify-between px-2.5 py-1.5 text-xs"
                          >
                            <span className="truncate text-zinc-700">
                              {r.name}
                            </span>
                            <span className="rounded bg-white px-1.5 py-0.5 text-[10px] text-zinc-700">
                              {formatDate(r.updatedTs)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </ListPanel>
                  )}

                  {/* Orphan tables preview */}
                  {stats.orphanTables && stats.orphanTables.length > 0 && (
                    <ListPanel title="Orphan tables">
                      <ul className="divide-y">
                        {stats.orphanTables.slice(0, 4).map((t) => (
                          <li
                            key={t}
                            className="px-2.5 py-1.5 text-xs text-zinc-700"
                          >
                            {t}
                          </li>
                        ))}
                      </ul>
                    </ListPanel>
                  )}
                </TabsContent>

                {/* QUALITY */}
                <TabsContent value="quality" className="mt-2 space-y-3">
                  {!selectedId ? (
                    <div className="rounded-lg border bg-white p-3 text-xs text-zinc-500">
                      Select a table to see quality metrics.
                    </div>
                  ) : (
                    (() => {
                      const tm = getTableMetrics(selectedId);
                      const cols = getTable(selectedId)?.columns || [];
                      const nullList = cols
                        .map((c) => ({
                          name: c.name,
                          m: getColumnMetrics(selectedId, c.name),
                        }))
                        .map((x) => ({
                          name: x.name,
                          nullPct: x.m?.nullPct ?? 0,
                        }))
                        .sort((a, b) => b.nullPct - a.nullPct)
                        .slice(0, 4);
                      const avgNull = cols.length
                        ? Math.round(
                            cols.reduce(
                              (acc, c) =>
                                acc +
                                (getColumnMetrics(selectedId, c.name)
                                  ?.nullPct ?? 0),
                              0
                            ) / cols.length
                          )
                        : 0;
                      const dupPct = tm?.duplicateRowPct ?? 0;
                      const orphanPct = tm?.orphanRatePct ?? 0;
                      return (
                        <>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="rounded-lg border bg-white p-2">
                              <div className="text-[10px] text-zinc-500">
                                Orphan rate
                              </div>
                              <div className="text-xl font-semibold text-zinc-800">
                                {orphanPct}%
                              </div>
                            </div>
                            <div className="rounded-lg border bg-white p-2">
                              <div className="text-[10px] text-zinc-500">
                                Avg NULL%
                              </div>
                              <div className="text-xl font-semibold text-zinc-800">
                                {avgNull}%
                              </div>
                            </div>
                            <div className="rounded-lg border bg-white p-2">
                              <div className="text-[10px] text-zinc-500">
                                Duplicate rows
                              </div>
                              <div className="text-xl font-semibold text-zinc-800">
                                {dupPct}%
                              </div>
                            </div>
                          </div>

                          <ListPanel title="Top columns by NULL%">
                            {nullList.length === 0 ? (
                              <div className="px-2.5 py-1.5 text-xs text-zinc-500">
                                No columns.
                              </div>
                            ) : (
                              <ul className="divide-y">
                                {nullList.map((item) => (
                                  <li
                                    key={item.name}
                                    className="flex items-center gap-2 px-2.5 py-1.5 text-xs"
                                  >
                                    <span className="w-32 truncate text-zinc-700">
                                      {item.name}
                                    </span>
                                    <div className="relative h-2 flex-1 overflow-hidden rounded bg-violet-100">
                                      <div
                                        className="h-full rounded bg-violet-400"
                                        style={{ width: `${item.nullPct}%` }}
                                      />
                                    </div>
                                    <span className="w-10 text-right text-zinc-600">
                                      {item.nullPct}%
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </ListPanel>

                          <div className="rounded-lg border bg-white p-2 text-xs text-zinc-600">
                            <p>
                              Tips: Reduce orphan rows by enforcing FK
                              integrity; add indexes on FK columns; backfill
                              NULLs or make columns NOT NULL where appropriate.
                            </p>
                          </div>
                        </>
                      );
                    })()
                  )}
                </TabsContent>

                {/* COLUMNS */}
                <TabsContent value="columns" className="mt-2">
                  {!selectedId ? (
                    <div className="rounded-lg border bg-white p-3 text-xs text-zinc-500">
                      Select a table to list its columns.
                    </div>
                  ) : (
                    <>
                      <div className="mb-1 text-xs font-semibold text-zinc-600">
                        Columns ({getTable(selectedId)?.columns.length ?? 0})
                      </div>
                      <div className="max-h-[48vh] overflow-hidden rounded-lg border bg-white">
                        {/* header */}
                        <div className="sticky top-0 z-10 grid grid-cols-12 border-b bg-zinc-50 px-3 py-2 text-[11px] font-medium text-zinc-500">
                          <div className="col-span-6">Column</div>
                          <div className="col-span-2 text-right">Type</div>
                        </div>
                        {/* body */}
                        <div className="max-h-[calc(48vh-40px)] overflow-y-auto">
                          <Accordion
                            type="single"
                            collapsible
                            className="divide-y"
                          >
                            {(getTable(selectedId)?.columns || []).map((c) => {
                              const m = getColumnMetrics(selectedId, c.name);
                              const nullPct = m?.nullPct ?? 0;
                              const distinctPct = m?.distinctPct ?? 0;
                              const p95 = m?.p95 ?? m?.p95len;
                              return (
                                <AccordionItem key={c.name} value={c.name}>
                                  <AccordionTrigger className="px-3 py-2 hover:no-underline">
                                    <div className="grid w-full grid-cols-12 items-center gap-2">
                                      <div className="col-span-6 truncate text-left font-medium text-zinc-800">
                                        {c.isPrimary ? '🔑 ' : ''}
                                        {c.name}
                                      </div>
                                      <div className="col-span-2 text-right">
                                        <span className="rounded bg-violet-100 px-2 py-0.5 text-[11px] text-violet-700">
                                          {prettyType(c.type)}
                                        </span>
                                      </div>
                                    </div>
                                  </AccordionTrigger>
                                  <AccordionContent className="px-3 pb-3">
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                      <div className="rounded border p-2">
                                        <div className="text-[10px] text-zinc-500">
                                          NULL percentage
                                        </div>
                                        <div className="mt-1 flex items-center gap-2">
                                          <div className="relative h-2 flex-1 overflow-hidden rounded bg-violet-100">
                                            <div
                                              className="h-full rounded bg-violet-400"
                                              style={{ width: `${nullPct}%` }}
                                            />
                                          </div>
                                          <div className="w-10 text-right text-zinc-700">
                                            {nullPct}%
                                          </div>
                                        </div>
                                      </div>
                                      <div className="rounded border p-2">
                                        <div className="text-[10px] text-zinc-500">
                                          Distinct percentage
                                        </div>
                                        <div className="mt-1 flex items-center gap-2">
                                          <div className="relative h-2 flex-1 overflow-hidden rounded bg-violet-100">
                                            <div
                                              className="h-full rounded bg-violet-400"
                                              style={{
                                                width: `${distinctPct}%`,
                                              }}
                                            />
                                          </div>
                                          <div className="w-10 text-right text-zinc-700">
                                            {distinctPct}%
                                          </div>
                                        </div>
                                      </div>
                                      <div className="rounded border p-2">
                                        <div className="text-[10px] text-zinc-500">
                                          p95{' '}
                                          {m?.p95 !== undefined
                                            ? '(numeric)'
                                            : m?.p95len !== undefined
                                              ? '(length)'
                                              : ''}
                                        </div>
                                        <div className="mt-1 text-zinc-700">
                                          {p95 !== undefined ? p95 : '—'}
                                        </div>
                                      </div>
                                      <div className="rounded border p-2">
                                        <div className="text-[10px] text-zinc-500">
                                          Examples
                                        </div>
                                        {m?.examples && m.examples.length ? (
                                          <ul className="mt-1 list-disc pl-5 text-zinc-700">
                                            {m.examples
                                              .slice(0, 4)
                                              .map((ex, i) => (
                                                <li
                                                  key={i}
                                                  className="truncate"
                                                >
                                                  {ex}
                                                </li>
                                              ))}
                                          </ul>
                                        ) : (
                                          <div className="mt-1 text-zinc-500">
                                            —
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </AccordionContent>
                                </AccordionItem>
                              );
                            })}
                          </Accordion>
                        </div>
                      </div>
                    </>
                  )}
                </TabsContent>
              </Tabs>
            </div>

            {/* collapsed opener button */}
            {!isStatsOpen && (
              <button
                type="button"
                onClick={() => setIsStatsOpen(true)}
                className="absolute right-0 top-1/2 z-20 -translate-y-1/2 translate-x-2 rounded-l-md border border-violet-200/60 bg-white/80 p-1 shadow-md backdrop-blur hover:bg-white"
                aria-label="Open stats"
              >
                <ChevronLeft className="h-4 w-4 text-violet-700" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
