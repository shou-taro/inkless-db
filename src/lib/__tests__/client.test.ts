import { describe, it, expect } from 'vitest';
import { createClient } from '@/lib/db/client';
import type { DbConnection } from '@/lib/db/context';

describe('createClient', () => {
  it('returns sqlite client for sqlite connections', () => {
    const conn: DbConnection = { kind: 'sqlite', path: '/tmp/x.sqlite' };
    const client = createClient(conn);
    expect(client).toBeTruthy();
    expect(typeof client.getSchema).toBe('function');
  });

  it('throws for unsupported DB kinds (postgres/mysql placeholders)', () => {
    expect(() =>
      createClient({
        kind: 'postgresql',
        host: '',
        port: 5432,
        database: '',
        user: '',
        password: '',
      } as any)
    ).toThrow(/not implemented/i);

    expect(() =>
      createClient({
        kind: 'mysql',
        host: '',
        port: 3306,
        database: '',
        user: '',
        password: '',
      } as any)
    ).toThrow(/not implemented/i);
  });
});
