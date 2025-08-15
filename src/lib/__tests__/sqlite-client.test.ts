import { describe, it, expect } from 'vitest';
import { createSQLiteClient } from '@/lib/db/sqlite-client';

describe('createSQLiteClient', () => {
  it('throws if path is missing (Tauri path is required)', async () => {
    const client = createSQLiteClient({ kind: 'sqlite' });
    await expect(client.getSchema()).rejects.toThrow(
      /SQLite path is required/i
    );
    await expect(client.getRows('t', 5)).rejects.toThrow(
      /SQLite path is required/i
    );
  });

  it('does not throw on disconnect without path', async () => {
    const client = createSQLiteClient({ kind: 'sqlite' });
    await expect(client.disconnect()).resolves.toBeUndefined();
  });
});
