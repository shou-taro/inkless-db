import { createContext, useContext, useState, type ReactNode } from 'react';
import { createClient, type DbClient } from '@/lib/db/client';

export type DbKind = 'sqlite' | 'postgresql' | 'mysql';

export type SQLiteConn = {
  kind: 'sqlite';
  file?: File | null;
  path?: string;
};

export type PostgresConn = {
  kind: 'postgresql';
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  ssl?: boolean;
};

export type MySQLConn = {
  kind: 'mysql';
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  ssl?: boolean;
};

export type DbConnection = SQLiteConn | PostgresConn | MySQLConn;
export type DbStatus = 'idle' | 'connecting' | 'connected' | 'error';

type DbContextValue = {
  connection: DbConnection | null;
  client: DbClient | null;
  status: DbStatus;
  error?: string;
  connect: (c: DbConnection) => Promise<void>;
  disconnect: () => void;
};

const DbContext = createContext<DbContextValue | undefined>(undefined);

export function DbProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<DbConnection | null>(null);
  const [client, setClient] = useState<DbClient | null>(null);
  const [status, setStatus] = useState<DbStatus>('idle');
  const [error, setError] = useState<string | undefined>(undefined);

  async function connect(c: DbConnection) {
    setStatus('connecting');
    setError(undefined);
    try {
      const newClient = createClient(c);
      setConnection(c);
      setClient(newClient);
      setStatus('connected');
    } catch (e: any) {
      setStatus('error');
      setError(e?.message ?? 'Failed to connect');
    }
  }

  function disconnect() {
    setConnection(null);
    setClient(null);
    setStatus('idle');
    setError(undefined);
  }

  return (
    <DbContext.Provider
      value={{ connection, client, status, error, connect, disconnect }}
    >
      {children}
    </DbContext.Provider>
  );
}

export function useDb() {
  const ctx = useContext(DbContext);
  if (!ctx) throw new Error('useDb must be used within DbProvider');
  return ctx;
}
