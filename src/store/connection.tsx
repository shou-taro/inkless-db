// Minimal connection state store for sharing the current database connection across the app.

import { createContext, useContext, useState, ReactNode } from 'react';

// Represents supported database drivers.
type Driver = 'Sqlite' | 'Postgres' | 'MySql';

// Optional metadata for connection, used for display/formatting.
export type ConnMeta = {
  // For SQLite, the file path.
  sqlitePath?: string;
  // For Postgres/MySQL, host and database info.
  host?: string;
  port?: number;
  database?: string;
  user?: string;
};

// Holds the active connection ID, driver, and optional metadata.
type ConnState = {
  connId: string | null;
  driver: Driver | null;
  meta: ConnMeta | null;
};

// Defines the shape of the context, including state and mutation functions.
type ConnContextType = {
  state: ConnState;
  setConnection: (connId: string, driver: Driver, meta?: ConnMeta) => void;
  clearConnection: () => void;
};

// Initializes the React context for connection state.
const ConnContext = createContext<ConnContextType | undefined>(undefined);

// Wraps children components to provide connection state via context.
export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConnState>({
    connId: null,
    driver: null,
    meta: null,
  });

  // Sets the active connection.
  const setConnection = (connId: string, driver: Driver, meta?: ConnMeta) =>
    setState({ connId, driver, meta: meta ?? null });
  // Clears the active connection.
  const clearConnection = () =>
    setState({ connId: null, driver: null, meta: null });

  return (
    <ConnContext.Provider value={{ state, setConnection, clearConnection }}>
      {children}
    </ConnContext.Provider>
  );
}

// Custom hook to access the connection context and enforce usage within the provider.
export function useConnection() {
  const ctx = useContext(ConnContext);
  if (!ctx)
    throw new Error('useConnection must be used within ConnectionProvider');
  return ctx;
}
// Helper to extract the filename from a path.
function baseName(p: string) {
  return p.split(/[\\/]/).pop() || p;
}

// Returns a display label for the current connection.
export function connectionLabel(state: ConnState): string {
  if (!state.connId || !state.driver) return 'No database loaded';
  const d = state.driver;
  const m = state.meta ?? {};
  if (d === 'Sqlite') {
    return m.sqlitePath ? baseName(m.sqlitePath) : 'SQLite';
  }
  if (d === 'Postgres') {
    const user = m.user ? `${m.user}@` : '';
    const host = m.host || 'localhost';
    const db = m.database || 'postgres';
    const port = m.port != null ? `:${m.port}` : '';
    return `${user}${host}${port}/${db}`;
  }
  if (d === 'MySql') {
    const user = m.user ? `${m.user}@` : '';
    const host = m.host || 'localhost';
    const db = m.database || 'mysql';
    const port = m.port != null ? `:${m.port}` : '';
    return `${user}${host}${port}/${db}`;
  }
  return 'Connected';
}
