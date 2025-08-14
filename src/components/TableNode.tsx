import { memo } from 'react';
import { Handle, Position } from 'reactflow';

// Width estimation helpers
// We approximate a comfortable node width from the longest column/type labels
// using an off-screen canvas. If the canvas API is unavailable, we fall back
// to a conservative average character width to avoid layout thrashing.
const DEFAULT_FONT =
  '500 13px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
const AVG_CHAR_WIDTH_PX = 7.2; // safe average for 13px UI fonts

function measureTextPx(text: string, font = DEFAULT_FONT): number {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.font = font;
    const metrics = ctx.measureText(text);
    return metrics.width;
  } catch {
    return text.length * AVG_CHAR_WIDTH_PX;
  }
}

function estimateNodeWidthPx(params: {
  columnNames: string[];
  typeNames: string[];
  baseFont?: string;
}): number {
  const { columnNames, typeNames, baseFont = DEFAULT_FONT } = params;
  const longestCol = columnNames.reduce(
    (a, b) => (b.length > a.length ? b : a),
    ''
  );
  const longestTyp = typeNames.reduce(
    (a, b) => (b.length > a.length ? b : a),
    ''
  );

  const nameW = measureTextPx(longestCol, baseFont);
  const typeW = measureTextPx(longestTyp, baseFont);

  // UI allowances: icon gutter, paddings, a small safety margin
  const ICON_GUTTER = 22; // e.g. key icon / bullet spacing
  const H_PADDING = 24 * 2; // left + right padding inside the node
  const SAFETY = 12; // guard against font metric variance

  const target = nameW + ICON_GUTTER + typeW + H_PADDING + SAFETY;

  // Keep within sensible bounds so tiny/huge tables remain readable
  const MIN_W = 220;
  const MAX_W = 520;
  return Math.max(MIN_W, Math.min(MAX_W, Math.round(target)));
}

/**
 * TableNode
 * ---------
 * Presentational node renderer for a database table within React Flow.
 * It displays the table name and a compact list of columns, and exposes
 * connection handles for inbound/outbound relationships.
 *
 * Purpose
 * -------
 * - Keep node rendering concerns isolated from page containers.
 * - Provide a small, predictable surface area for styling and a11y tweaks.
 *
 * Notes for contributors
 * ----------------------
 * - Keep this component stateless and idempotent; it must render purely
 *   from its props to play well with React Flow's memoisation.
 * - Avoid heavy logic here; compute metrics or derived data in the parent
 *   (or a hook) and pass them down if needed.
 */

// Minimal shared shapes; move to a central types module when available.
export type Column = { name: string; type?: string; isPrimary?: boolean };
export type Table = { name: string; columns: Column[] };
export type TableNodeData = { table: Table };

type Props = { data: TableNodeData };

function TableNodeBase({ data }: Props) {
  const { table } = data;
  const computedWidth = estimateNodeWidthPx({
    columnNames: (table.columns ?? []).map((c) => String(c?.name ?? '')),
    typeNames: (table.columns ?? []).map((c) => String(c?.type ?? '')),
  });

  return (
    <div
      className="min-w-[220px] rounded-2xl border bg-white/95 shadow-sm backdrop-blur"
      style={{ width: computedWidth, maxWidth: computedWidth }}
    >
      {/* Header */}
      <div className="rounded-t-2xl bg-violet-200 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="truncate text-sm font-semibold text-violet-800">
            {table.name}
          </div>
          <span className="ml-2 shrink-0 rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
            {table.columns.length}
          </span>
        </div>
      </div>

      {/* Columns (truncated preview for performance) */}
      <div className="max-h-56 overflow-auto px-3 py-2">
        <table className="w-full table-fixed text-sm">
          <tbody>
            {table.columns.slice(0, 12).map((c) => (
              <tr key={c.name} className="border-b last:border-none">
                <td className="truncate px-2 py-1 font-medium text-zinc-800">
                  {c.isPrimary ? '🔑 ' : ''}
                  {c.name}
                </td>
                <td className="w-24 px-2 py-1 text-right text-zinc-600">
                  {c.type ?? ''}
                </td>
              </tr>
            ))}
            {table.columns.length > 12 && (
              <tr>
                <td
                  colSpan={2}
                  className="px-2 py-1 text-right text-xs text-zinc-500"
                >
                  …and more
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Connection handles: keep exposed for edges to attach to. */}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

// Memoise to avoid unnecessary re-renders while panning/zooming.
const TableNode = memo(TableNodeBase);
export default TableNode;
