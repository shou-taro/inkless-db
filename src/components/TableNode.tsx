import { memo } from 'react';
import { Handle, Position } from 'reactflow';

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

  return (
    <div className="min-w-[220px] rounded-2xl border bg-white/95 shadow-sm backdrop-blur">
      {/* Header */}
      <div className="from-brandPurple-50 rounded-t-2xl bg-gradient-to-r via-violet-200 to-violet-300 px-4 py-2">
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
