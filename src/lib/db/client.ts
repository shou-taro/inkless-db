import type { DbConnection } from '@/lib/db/context';
import { createSQLiteClient } from './sqlite-client';

export type TableSchema = {
  name: string;
  columns: Array<{ name: string; type: string; isPrimary?: boolean }>;
};

export type SchemaGraph = {
  tables: TableSchema[];
  fks: Array<{
    from: { table: string; column: string };
    to: { table: string; column: string };
  }>;
};

export interface DbClient {
  getSchema: () => Promise<SchemaGraph>;
  getRows: (
    table: string,
    limit?: number
  ) => Promise<{ columns: string[]; rows: Array<(string | number | null)[]> }>;
  disconnect: () => Promise<void>;
}

export function createClient(connection: DbConnection): DbClient {
  switch (connection.kind) {
    case 'sqlite':
      return createSQLiteClient(connection);
    case 'postgresql':
      throw new Error('PostgreSQL client not implemented yet');
    case 'mysql':
      throw new Error('MySQL client not implemented yet');
    default:
      throw new Error(`Unsupported DB kind: ${(connection as any).kind}`);
  }
}
