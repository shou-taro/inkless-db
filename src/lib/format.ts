/**
 * Byte size formatter (with British English commentary).
 *
 * Purpose
 * -------
 * Convert a byte count into a human‑readable string, e.g. 1536 → "1.5 KB".
 *
 * Defaults
 * --------
 * - Uses the binary (IEC-like) base of 1024.
 * - Outputs units up to TB (B / KB / MB / GB / TB).
 * - Applies "smart" decimals: show 1 decimal place for values < 10 in non-byte units, otherwise 0.
 * - Inserts a space between the value and the unit for readability (configurable).
 *
 * Rationale
 * ---------
 * Whilst there is a perennial KB vs KiB debate, many user interfaces prefer the simpler
 * "KB/MB/GB" labels even when using base 1024. This function follows that convention by default,
 * but allows switching to base 1000 (SI) or supplying custom units if desired.
 *
 * Examples
 * --------
 *   formatBytes(0)                       -> "0 B"
 *   formatBytes(1536)                    -> "1.5 KB"
 *   formatBytes(1048576)                 -> "1 MB"
 *   formatBytes(1048576, { decimals: 2 }) -> "1.00 MB"
 *   formatBytes(1500, { base: 1000 })    -> "1.5 kB"
 *   formatBytes(-2048)                   -> "-2 KB"
 *
 * Notes
 * -----
 * - Returns an empty string for `undefined`/`null` to make optional display logic tidy.
 * - Clamps at the largest provided unit; it will not invent units beyond the list.
 * - Intentionally keeps the implementation dependency‑free and tiny.
 */

export type FormatBytesOptions = {
  /**
   * Numerical base used for scaling.
   * 1024 (binary/IEC‑like) by default. Use 1000 for SI.
   */
  base?: 1024 | 1000;
  /**
   * Number of decimal places. If omitted or set to 'smart',
   * the formatter uses 1 decimal place for values < 10 in non‑byte units, else 0.
   */
  decimals?: number | 'smart';
  /**
   * Whether to include a space between the number and the unit.
   * Defaults to true. Set to false for compact formats (e.g. "1.5KB").
   */
  space?: boolean;
  /**
   * Custom unit labels. Provide as many as you need, ordered from bytes upwards.
   * If omitted, sensible defaults matching the chosen base are used.
   */
  units?: readonly string[];
};

/**
 * Convert a byte count into a human‑readable string.
 */
export const formatBytes = (
  bytes?: number | null,
  {
    base = 1024,
    decimals = 'smart',
    space = true,
    units,
  }: FormatBytesOptions = {}
): string => {
  // Gracefully handle absent inputs (common when sizes are optional).
  if (bytes === undefined || bytes === null) return '';
  if (!Number.isFinite(bytes)) return '';

  // Choose default unit set based on the base if none provided.
  const defaultUnits =
    base === 1024
      ? (['B', 'KB', 'MB', 'GB', 'TB'] as const)
      : (['B', 'kB', 'MB', 'GB', 'TB'] as const);
  const U = (
    units && units.length > 0 ? units : defaultUnits
  ) as readonly string[];

  // Work with absolute value for scaling; re‑apply sign at the end.
  const sign = bytes < 0 ? '-' : '';
  let value = Math.abs(bytes);
  let idx = 0;

  while (value >= base && idx < U.length - 1) {
    value = value / base;
    idx++;
  }

  // Determine decimal places.
  const dp =
    typeof decimals === 'number'
      ? Math.max(0, decimals)
      : value < 10 && idx > 0
        ? 1
        : 0;

  const sep = space ? ' ' : '';
  return `${sign}${value.toFixed(dp)}${sep}${U[idx]}`;
};
