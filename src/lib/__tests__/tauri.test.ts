import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock Tauri v2 API core so that unit tests remain hermetic.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import {
  openConnection,
  closeConnection,
  executeSql,
  executeSelectSpec,
  getSchema,
  openSqliteDialog,
  fileSize,
  type QueryResult,
  type SelectSpec,
} from '@/lib/tauri';

afterEach(() => {
  vi.clearAllMocks();
});

const resolved = <T>(v: T) => (invoke as any).mockResolvedValueOnce(v);
const rejected = (e: unknown) => (invoke as any).mockRejectedValueOnce(e);

describe('tauri thin client wrappers', () => {
  it('openConnection returns a connection id', async () => {
    resolved('conn-1');
    const id = await openConnection('sqlite', 'sqlite::memory:');
    expect(id).toBe('conn-1');
    expect(invoke).toHaveBeenCalledWith('open_connection', {
      args: { driver: 'sqlite', url: 'sqlite::memory:' },
    });
  });

  it('closeConnection delegates to backend command', async () => {
    resolved(undefined);
    await closeConnection('conn-1');
    expect(invoke).toHaveBeenCalledWith('close_connection', {
      args: { conn_id: 'conn-1' },
    });
  });

  it('executeSql returns QueryResult', async () => {
    const qr: QueryResult = {
      columns: ['id', 'name'],
      rows: [[1, 'alice']],
      truncated: false,
    };
    resolved(qr);
    const res = await executeSql('conn-1', 'select 1', 100);
    expect(res).toEqual(qr);
    expect(invoke).toHaveBeenCalledWith('execute_sql', {
      args: { conn_id: 'conn-1', sql: 'select 1', limit: 100 },
    });
  });

  it('executeSelectSpec passes spec and returns QueryResult', async () => {
    const qr: QueryResult = { columns: ['id'], rows: [[1]], truncated: false };
    resolved(qr);
    const spec: SelectSpec = {
      table: 'users',
      columns: ['id'],
      filters: [],
      sort: ['id', true],
      limit: 10,
      offset: 0,
    };
    const res = await executeSelectSpec('conn-1', spec);
    expect(res).toEqual(qr);
    expect(invoke).toHaveBeenCalledWith('execute_select_spec', {
      args: { conn_id: 'conn-1', spec },
    });
  });

  it('getSchema returns a schema object', async () => {
    const schema = { dialect: 'sqlite', schemas: ['main'], tables: [] };
    resolved(schema);
    const res = await getSchema('conn-1');
    expect(res).toEqual(schema);
    expect(invoke).toHaveBeenCalledWith('get_schema', {
      args: { conn_id: 'conn-1' },
    });
  });

  it('openSqliteDialog normalises null', async () => {
    resolved(null);
    const path = await openSqliteDialog();
    expect(path).toBeNull();
    expect(invoke).toHaveBeenCalledWith('open_sqlite_dialog');
  });

  it('fileSize returns a number', async () => {
    resolved(123);
    const size = await fileSize('/tmp/foo');
    expect(size).toBe(123);
    expect(invoke).toHaveBeenCalledWith('inkless_fs_size', {
      args: { path: '/tmp/foo' },
    });
  });

  it('wraps backend errors into Error instances', async () => {
    rejected('boom');
    await expect(
      openConnection('sqlite', 'sqlite::memory:')
    ).rejects.toBeInstanceOf(Error);

    rejected({ message: 'bad' });
    await expect(executeSql('c', 'select 1')).rejects.toBeInstanceOf(Error);
  });
});
