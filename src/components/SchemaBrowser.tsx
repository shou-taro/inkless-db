import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Search, Plus, Info, Table as TableIcon } from 'lucide-react';

/**
 * SchemaBrowser
 * --------------
 * Left‑hand pane that lets users search and browse tables within a schema.
 * It keeps presentation concerns here, and defers state changes to the parent
 * via callbacks (query change, selection, and creation).
 *
 * Responsibilities
 * ----------------
 * - Search input with immediate filtering (case‑insensitive substring match)
 * - Table list with keyboard/focus friendly affordances
 * - Lightweight detail preview for the currently selected table
 * - Emits callbacks rather than mutating any external state directly
 *
 * Notes for contributors
 * ----------------------
 * - This component is intentionally lean and presentational.
 *   Any fetching, focusing, or graph‑level navigation should be handled by
 *   the parent after receiving `onSelect`.
 * - Design system: buttons use the custom `brand` / `brandOutline` variants
 *   (see the shadcn/ui Button configuration).
 */

// Minimal shape definitions; expand or import shared types when available.
export type Column = {
  name: string;
  type?: string;
  /** Column is part of primary key */
  primaryKey?: boolean;
  /** Whether the column allows NULL values */
  nullable?: boolean;
  /** Max length for character types (e.g. VARCHAR) */
  length?: number;
  /** Numeric precision (total digits) */
  precision?: number;
  /** Numeric scale (digits after decimal) */
  scale?: number;
};
export type Table = { name: string; columns?: Column[] };
export type Schema = { tables: Table[] };

export type SchemaBrowserProps = {
  /** Current schema (tables only are required here). */
  schema: Schema;
  /** Current search query (controlled input). */
  query: string;
  /** Called when the query text changes. */
  onQueryChange: (value: string) => void;
  /** Currently selected table name (if any). */
  selectedId: string | null;
  /** Called when a table is chosen from the list. */
  onSelect: (tableName: string) => void;
  /** Trigger creation flow (e.g., open a modal in the parent). */
  onCreate: () => void;
  /** Optional extra classes for layout containers. */
  className?: string;
};

/**
 * Simple helper that wraps matched substrings in <mark> for visibility.
 * Falls back to plain text if the query is empty.
 */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return (
    <>
      {before}
      <mark className="rounded px-0.5 py-0.5">{match}</mark>
      {after}
    </>
  );
}

function parseLenPrecScaleFromType(ty?: string): {
  length?: number;
  precision?: number;
  scale?: number;
} {
  if (!ty) return {};
  const m = ty.match(/\(([^)]+)\)/);
  if (!m) return {};
  const parts = m[1].split(',').map((s) => s.trim());
  const a = parts[0] && /^\d+$/.test(parts[0]) ? Number(parts[0]) : undefined;
  const b = parts[1] && /^\d+$/.test(parts[1]) ? Number(parts[1]) : undefined;
  // Heuristic: CHAR/VARCHAR/TEXT-like → length, NUMERIC/DECIMAL-like → precision/scale
  const upper = ty.toUpperCase();
  if (/CHAR|VARCHAR|N?VAR?CHAR|STRING/.test(upper)) {
    return { length: a };
  }
  if (/DECIMAL|NUMERIC/.test(upper)) {
    return { precision: a, scale: b };
  }
  // Fallback: if two numbers, treat as precision/scale; if one, treat as length
  if (a !== undefined && b !== undefined) return { precision: a, scale: b };
  if (a !== undefined) return { length: a };
  return {};
}

export default function SchemaBrowser({
  schema,
  query,
  onQueryChange,
  selectedId,
  onSelect,
  onCreate,
  className,
}: SchemaBrowserProps) {
  // Precompute filtered tables for smoother rendering.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return schema.tables;
    return schema.tables.filter((t) => t.name.toLowerCase().includes(q));
  }, [schema.tables, query]);

  const selectedTable = useMemo(
    () => schema.tables.find((t) => t.name === selectedId) || null,
    [schema.tables, selectedId]
  );

  return (
    <aside
      className={`mx-5 my-6 flex w-[260px] min-w-[260px] flex-col rounded-lg border-r border-violet-200 bg-violet-100 shadow-md ${className ?? ''}`.replace(
        /\bml-2\b/,
        ''
      )}
      aria-label="Schema browser"
      style={{ height: 'calc(100% - 3rem)' }}
    >
      <div className="flex items-center justify-between p-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-purple-700">
          <TableIcon className="h-4 w-4 text-purple-700" />
          <span>Tables</span>
        </div>
      </div>

      <Separator />

      {/* Header: search + create */}
      <div className="flex items-center gap-2 p-2.5">
        <div className="relative grow">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-purple-400" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search tables…"
            aria-label="Search tables"
            className="border border-purple-300 pl-8 placeholder-purple-400"
          />
        </div>
        <Button
          type="button"
          onClick={onCreate}
          aria-label="Create new table"
          className="bg-purple-500 text-white hover:bg-purple-600"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <Separator />

      {/* List of tables */}
      <ScrollArea className="h-full">
        <ul className="space-y-0.5 p-2.5">
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              No tables match the search.
            </li>
          )}
          {filtered.map((t) => {
            const isActive = t.name === selectedId;
            return (
              <li key={t.name}>
                <button
                  type="button"
                  onClick={() => onSelect(t.name)}
                  className={`group flex w-full items-center gap-2 rounded px-3 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
                    isActive ? 'bg-violet-300' : 'hover:bg-violet-200'
                  } active:bg-violet-200`}
                  aria-current={isActive ? 'true' : undefined}
                >
                  <TableIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">
                    <Highlight text={t.name} query={query} />
                  </span>
                  {t.columns && (
                    <span className="ml-auto rounded bg-purple-100 px-1.5 text-[10px] leading-5 text-purple-700">
                      {t.columns.length}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </ScrollArea>

      <Separator />

      {/* Lightweight detail preview */}
      <div className="space-y-2 p-2.5" aria-live="polite">
        <div className="flex items-center gap-2 text-sm text-purple-700">
          <Info className="h-4 w-4" />
          <span>Details</span>
        </div>
        {selectedTable ? (
          <div className="rounded-md border border-purple-200 p-3">
            <div className="mb-1 text-sm font-semibold">
              {selectedTable.name}
            </div>
            <div className="text-xs text-muted-foreground">
              {selectedTable.columns?.length ?? 0} columns
            </div>
            {selectedTable.columns && selectedTable.columns.length > 0 && (
              <ul className="mt-2 max-h-28 space-y-1 overflow-auto pr-1 text-xs">
                {selectedTable.columns.slice(0, 12).map((c) => (
                  <li
                    key={c.name}
                    className="flex items-center justify-between"
                  >
                    {/* Left: name with key emoji if primary key */}
                    <span className="truncate text-sm" title={c.name}>
                      {c.primaryKey ? '🔑 ' : ''}
                      {c.name}
                    </span>
                    {/* Right: NOT NULL / NULL OK and type */}
                    <div className="flex shrink-0 items-center gap-1">
                      {c.nullable === false ? (
                        <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] leading-4 text-rose-700">
                          NOT NULL
                        </span>
                      ) : (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] leading-4 text-slate-600">
                          NULL OK
                        </span>
                      )}
                      {c.type ? (
                        <span
                          className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] leading-4 text-purple-700"
                          title={c.type}
                        >
                          {c.type}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
                {selectedTable.columns.length > 12 && (
                  <li className="text-muted-foreground">…and more</li>
                )}
              </ul>
            )}
          </div>
        ) : (
          <div className="rounded-md border p-3 text-xs text-muted-foreground">
            Select a table to see a brief summary here.
          </div>
        )}
      </div>
    </aside>
  );
}
