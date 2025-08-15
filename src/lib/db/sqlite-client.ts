import type { SQLiteConn } from '@/lib/db/context';
import type { DbClient, SchemaGraph } from './client';

// Tauri v2: '@tauri-apps/api/core' / v1: '@tauri-apps/api/tauri'
// If you are on Tauri v1, change the import to: `from '@tauri-apps/api/tauri'`
import { invoke } from '@tauri-apps/api/core';

export function createSQLiteClient(conn: SQLiteConn): DbClient {
  const ensurePath = (): string => {
    if (conn.path) return conn.path;
    // If you prefer to support File uploads, persist the File to a temp path and set conn.path upstream.
    throw new Error('SQLite path is required on Tauri.');
  };

  return {
    async getSchema(): Promise<SchemaGraph> {
      const path = ensurePath();
      const result = await invoke<SchemaGraph>('db_get_schema', { path });
      return result;
    },

    async getRows(table: string, limit = 10) {
      const path = ensurePath();
      if (!table.trim()) throw new Error('Table name is required');
      const result = await invoke<{
        columns: string[];
        rows: Array<(string | number | null)[]>;
      }>('db_get_rows', { path, table, limit });
      return result;
    },

    async disconnect() {
      // nothing to do for file-based SQLite
      return;
    },
  };
}
