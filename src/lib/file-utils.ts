/**
 * File utility helpers (en‑GB commentary)
 * --------------------------------------
 * Small, dependency‑free helpers for working with file paths and names.
 * These functions are deliberately conservative and portable: they avoid relying
 * on Node's `path` module so they work in browser/Tauri contexts as well.
 */

/**
 * Extract the base file name from a given path string.
 *
 * Behaviour
 * ---------
 * - Works with both Windows (`\`) and POSIX (`/`) separators.
 * - Ignores any trailing separator, e.g. "/dir/subdir/" → "subdir".
 * - If the input contains no separators, returns the input unchanged.
 *
 * Examples
 * --------
 *   getBaseName('/Users/alice/db/example.sqlite')  -> 'example.sqlite'
 *   getBaseName('C:\\Users\\alice\\db\\example.db') -> 'example.db'
 *   getBaseName('/Users/alice/db/')                 -> 'db'
 *   getBaseName('example.sqlite')                   -> 'example.sqlite'
 */
export function getBaseName(p: string): string {
  if (!p) return '';
  // Remove a single trailing separator to handle "/dir/" and "C:\dir\"
  const trimmed = p.replace(/[\\/]+$/, '');
  // Split on both Windows and POSIX separators
  const parts = trimmed.split(/[\\/]/);
  return parts.length ? parts[parts.length - 1] : trimmed;
}

/**
 * Determine whether a file name has an accepted SQLite database extension.
 *
 * Accepted extensions (case‑insensitive):
 * - ".sqlite"
 * - ".db"
 *
 * Notes
 * -----
 * - This checks only the file name string; it does not hit the filesystem.
 * - Intended for client‑side validation prior to opening/reading a file.
 */
export function isAcceptedFileName(name: string): boolean {
  if (!name) return false;
  return /\.(sqlite|db)$/i.test(name);
}
