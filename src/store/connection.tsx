// Minimal connection state store for sharing the current database connection across the app.

import { createContext, useContext, useState, ReactNode } from 'react';

// Represents supported database drivers.
type Driver = 'Sqlite' | 'Postgres' | 'MySql';

// Holds the active connection ID and driver.
type ConnState = {
  connId: string | null;
  driver: Driver | null;
};

// Defines the shape of the context, including state and mutation functions.
type ConnContextType = {
  state: ConnState;
  setConnection: (connId: string, driver: Driver) => void;
  clearConnection: () => void;
};

// Initializes the React context for connection state.
const ConnContext = createContext<ConnContextType | undefined>(undefined);

// Wraps children components to provide connection state via context.
export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConnState>({ connId: null, driver: null });

  // Sets the active connection.
  const setConnection = (connId: string, driver: Driver) => setState({ connId, driver });
  // Clears the active connection.
  const clearConnection = () => setState({ connId: null, driver: null });

  return (
    <ConnContext.Provider value={{ state, setConnection, clearConnection }}>
      {children}
    </ConnContext.Provider>
  );
}

// Custom hook to access the connection context and enforce usage within the provider.
export function useConnection() {
  const ctx = useContext(ConnContext);
  if (!ctx) throw new Error('useConnection must be used within ConnectionProvider');
  return ctx;
}