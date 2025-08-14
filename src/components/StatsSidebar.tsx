import React, { memo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ChevronRight, BarChart2, Network, Info } from 'lucide-react';
import { formatBytes } from '@/lib/format';

/**
 * StatsSidebar
 * ------------
 * Right‑hand panel that surfaces graph‑level and table‑level statistics.
 * It is intentionally presentational: all state is owned by the parent,
 * and this component renders the given data and emits user intent via
 * callbacks (e.g. `onClose`, `focusNode`).
 *
 * Sections
 * --------
 * - Overview: global counts, hub tables, graph shape hints
 * - Quality: example placeholders for data‑quality indicators
 * - Columns: per‑column metrics for the currently selected table
 *
 * Notes for contributors
 * ----------------------
 * - Keep layout and copy here; compute heavy stats in a hook or utility.
 * - This panel may be lazily loaded to reduce initial payload size.
 */

// Minimal shared shapes; prefer importing project types when available.
export type ColumnMetrics = {
  nullPct: number;
  distinctPct: number;
  p95?: number;
  p95len?: number;
  min?: number;
  max?: number;
  median?: number;
  mean?: number;
  examples?: string[];
};
export type TableMetrics = {
  orphanRatePct: number;
  duplicateRowPct: number;
  columns: Record<string, ColumnMetrics>;
};
export type Table = {
  name: string;
  columns: { name: string; type?: string }[];
};
export type Schema = { tables: Table[] };

export type DbInfo = {
  path: string;
  sizeBytes?: number;
  openedAt?: string; // ISO string
};

export type GraphStats = {
  tables: number;
  columns: number;
  fks: number;
  avgCols: number;
  pkCoverage: number;
  orphanCount: number;
  orphanTables: string[];
  topHubs: { name: string; degree: number }[];
  topHub: string | null;
  topHubDegree: number;
  sourcesCount: number;
  sinksCount: number;
  typeDist: [string, number][];
  maxTypeCount: number;
  selCols: number;
  selOut: number;
  selIn: number;
  fkPerTable: number;
  connectivityPct: number;
  graphDensity: number;
  selfRefCount: number;
  reciprocalPairsCount: number;
  componentsCount: number;
  hasCycle: boolean;
  earliestCreatedTs?: number;
  latestUpdatedTs?: number;
  totalApproxRows: number;
  recentTables: { name: string; updatedTs: number }[];
};

export type StatsSidebarProps = {
  /** Whether the panel is visible. The parent controls this. */
  isOpen: boolean;
  /** Close the panel (e.g. hide a drawer). */
  onClose: () => void;
  /** Schema, used to contextualise column listings. */
  schema: Schema;
  /** Currently selected table name, if any. */
  selectedId: string | null;
  /**
   * Precomputed statistics for the whole graph and optionally
   * the currently selected table.
   */
  stats: GraphStats;
  /** Focus a node on the canvas by table name. */
  focusNode: (tableName: string) => void;
  /** Retrieve metrics for a given table (provided by the parent). */
  getTableMetrics: (tableName: string | null) => TableMetrics | null;
  /** Retrieve metrics for a given column in the selected table. */
  getColumnMetrics: (
    tableName: string | null,
    columnName: string
  ) => ColumnMetrics | null;
  /** Optional extra classes for layout containers. */
  className?: string;
  /** Optional metadata for the currently opened database file. */
  dbInfo?: DbInfo;
};

function StatItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded border bg-card px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/** Small, self-contained KPI card. */
function KpiCard({
  label,
  value,
  help,
}: {
  label: string;
  value: React.ReactNode;
  help?: string;
}) {
  return (
    <div className="rounded border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        {help && (
          <div className="text-[10px] text-muted-foreground/70">{help}</div>
        )}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

/** Lightweight progress bar for percentage-style stats (0–100). */
function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative h-2 w-full overflow-hidden rounded bg-muted">
      <div
        className="absolute left-0 top-0 h-full rounded bg-violet-400"
        style={{ width: `${clamped}%` }}
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        role="progressbar"
      />
    </div>
  );
}

function OverviewTab({
  stats,
  schema,
  selectedId,
  focusNode,
  dbInfo,
  getTableMetrics,
}: {
  stats: GraphStats;
  schema: Schema;
  selectedId: string | null;
  focusNode: (t: string) => void;
  dbInfo?: DbInfo;
  getTableMetrics?: (tableName: string | null) => TableMetrics | null;
}) {
  const basename = (p: string) => p.split(/[\\/]/).pop() || p;
  const formatWhen = (iso?: string) =>
    iso ? new Date(iso).toLocaleString() : '—';

  return (
    <div className="space-y-4">
      {/* Primary KPIs grouped in a single card for scannability */}
      <div className="rounded border bg-card p-3 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <KpiCard label="Tables" value={stats.tables} />
          <KpiCard label="Columns" value={stats.columns} />
          <KpiCard label="Foreign keys" value={stats.fks} />
          <KpiCard
            label="Avg columns / table"
            value={stats.avgCols.toFixed(1)}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Connectivity</span>
              <span>{(stats.connectivityPct * 100).toFixed(0)}%</span>
            </div>
            <ProgressBar pct={stats.connectivityPct * 100} />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Density</span>
              <span>
                {Number.isFinite(stats.graphDensity)
                  ? stats.graphDensity.toFixed(3)
                  : '—'}
              </span>
            </div>
            <ProgressBar
              pct={Math.max(0, Math.min(100, stats.graphDensity * 100))}
            />
          </div>
        </div>
      </div>

      {/* Database meta (renders only when provided) */}
      {dbInfo && (
        <div className="rounded border bg-card p-3 shadow-sm">
          <div className="mb-2 text-sm font-semibold">Database</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-muted-foreground">File</div>
            <div title={dbInfo.path} className="truncate">
              {basename(dbInfo.path)}
            </div>
            <div className="text-muted-foreground">Size</div>
            <div>
              {typeof dbInfo.sizeBytes === 'number'
                ? formatBytes(dbInfo.sizeBytes)
                : '—'}
            </div>
            <div className="text-muted-foreground">Opened</div>
            <div>{formatWhen(dbInfo.openedAt)}</div>
          </div>
        </div>
      )}

      {/* Selected table meta (renders only when a table is selected) */}
      {selectedId && (
        <div className="rounded border bg-card p-3 shadow-sm">
          <div className="mb-2 text-sm font-semibold">Selected table</div>
          {(() => {
            const t = schema.tables.find((x) => x.name === selectedId);
            const tm = getTableMetrics ? getTableMetrics(selectedId) : null;
            const cols = t?.columns?.length ?? 0;
            return t ? (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-muted-foreground">Name</div>
                <div className="truncate">{t.name}</div>
                <div className="text-muted-foreground">Columns</div>
                <div>{cols}</div>
                <div className="text-muted-foreground">FKs out / in</div>
                <div>
                  {stats.selOut} / {stats.selIn}
                </div>
                {tm && (
                  <>
                    <div className="text-muted-foreground">Orphan rows</div>
                    <div>{Math.round(tm.orphanRatePct * 100)}%</div>
                    <div className="text-muted-foreground">Duplicate rows</div>
                    <div>{Math.round(tm.duplicateRowPct * 100)}%</div>
                  </>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                The selected table is not present.
              </div>
            );
          })()}
        </div>
      )}

      {/* Hub tables */}
      <div className="rounded border bg-card p-3 shadow-sm">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Network className="h-4 w-4" />
          <span>Hubs</span>
        </div>
        {stats.topHubs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No high‑degree tables found.
          </p>
        ) : (
          <ul className="divide-y rounded border">
            {stats.topHubs.slice(0, 8).map((h) => (
              <li
                key={h.name}
                className="flex items-center justify-between px-2.5 py-1.5"
              >
                <button
                  type="button"
                  className="truncate text-left font-medium text-primary hover:underline"
                  onClick={() => focusNode(h.name)}
                  title={`Focus ${h.name}`}
                >
                  {h.name}
                </button>
                <span className="text-xs text-muted-foreground">
                  {h.degree}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Orphan tables preview (renders only when present) */}
      {stats.orphanTables.length > 0 && (
        <div className="rounded border bg-card p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Info className="h-4 w-4" />
            <span>Orphan tables</span>
          </div>
          <ul className="divide-y rounded border">
            {stats.orphanTables.map((t) => (
              <li
                key={t}
                className="flex items-center justify-between px-2.5 py-1.5"
              >
                <button
                  type="button"
                  className="truncate text-left font-medium text-primary hover:underline"
                  onClick={() => focusNode(t)}
                  title={`Focus ${t}`}
                >
                  {t}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ColumnsTab({
  schema,
  selectedId,
  getColumnMetrics,
}: {
  schema: Schema;
  selectedId: string | null;
  getColumnMetrics: (t: string | null, c: string) => ColumnMetrics | null;
}) {
  const table = schema.tables.find((t) => t.name === selectedId) || null;
  if (!table) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a table to see its columns.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">{table.name}</div>
      <ul className="space-y-1">
        {table.columns.map((c) => {
          const m = getColumnMetrics(selectedId, c.name);
          return (
            <li
              key={c.name}
              className="flex items-center justify-between rounded border px-2 py-1 text-xs"
            >
              <span className="truncate">
                {c.name}
                {c.type && (
                  <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {c.type}
                  </span>
                )}
              </span>
              {m ? (
                <span className="shrink-0 text-muted-foreground">
                  null {Math.round(m.nullPct * 100)}% · distinct{' '}
                  {Math.round(m.distinctPct * 100)}%
                </span>
              ) : (
                <span className="shrink-0 text-muted-foreground">—</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default memo(function StatsSidebar({
  isOpen,
  onClose,
  schema,
  selectedId,
  stats,
  focusNode,
  getTableMetrics,
  getColumnMetrics,
  className,
  dbInfo,
}: StatsSidebarProps) {
  if (!isOpen) return null;

  const tm = getTableMetrics(selectedId);

  return (
    <aside
      className={`flex h-full w-96 min-w-80 flex-col rounded-lg border bg-background shadow-md ${className ?? ''}`}
      aria-label="Statistics sidebar"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <BarChart2 className="h-4 w-4" />
          <span>Statistics</span>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onClose}
          aria-label="Close"
          title="Close"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <Separator />

      <Tabs defaultValue="overview" className="flex grow flex-col">
        <TabsList className="mx-3 mt-3 grid grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="quality">Quality</TabsTrigger>
          <TabsTrigger
            value="columns"
            disabled={!selectedId}
            title={!selectedId ? 'Select a table to view columns' : undefined}
          >
            Columns
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="grow p-3">
          <TabsContent value="overview" className="m-0">
            <OverviewTab
              stats={stats}
              schema={schema}
              selectedId={selectedId}
              focusNode={focusNode}
              dbInfo={dbInfo}
              getTableMetrics={getTableMetrics}
            />
          </TabsContent>

          <TabsContent value="quality" className="m-0">
            {tm ? (
              <div className="space-y-2 text-sm">
                <div className="font-medium">{selectedId}</div>
                <div className="text-muted-foreground">
                  Orphan rows: {Math.round(tm.orphanRatePct * 100)}%
                </div>
                <div className="text-muted-foreground">
                  Duplicate rows: {Math.round(tm.duplicateRowPct * 100)}%
                </div>
                <div className="text-muted-foreground">
                  FKs out: {stats.selOut} · FKs in: {stats.selIn}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a table to see quality indicators.
              </p>
            )}
          </TabsContent>

          <TabsContent value="columns" className="m-0">
            <ColumnsTab
              schema={schema}
              selectedId={selectedId}
              getColumnMetrics={getColumnMetrics}
            />
          </TabsContent>
        </ScrollArea>
      </Tabs>
      <Separator />
    </aside>
  );
});
