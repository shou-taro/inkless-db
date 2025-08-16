// Thin client wrappers for Tauri backend commands
// Keep this file as the single boundary where the frontend talks to Rust.
// This improves type-safety, centralises error handling, and eases testing.

import { invoke } from '@tauri-apps/api/core';

// --- Shared types between frontend and backend ---
export type Driver = 'sqlite' | 'postgres' | 'mysql';

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
}

export interface FilterCond {
  column: string;
  op: string; // '=', '!=', '>', '>=', '<', '<=', 'like', 'not_like', 'is_null', 'is_not_null', 'in', 'not_in'
  value: unknown; // number | string | boolean | null | unknown[]
}

export interface SelectSpec {
  table: string;
  columns: string[];
  filters: FilterCond[];
  sort?: [string, boolean] | null; // [column, asc]
  limit?: number | null;
  offset?: number | null;
}

// Database schema as returned by the backend. Keep it flexible to avoid tight coupling.
export interface DatabaseSchema {
  dialect: string;
  schemas: string[];
  tables: Array<{
    schema: string;
    name: string;
    type_: string; // 'BASE TABLE' | 'VIEW' | etc.
    columns: Array<{
      name: string;
      type?: string;
      nullable: boolean;
      defaultValue?: string | number | boolean | null;
      primaryKey: boolean;
      length?: number | null;
      precision?: number | null;
      scale?: number | null;
    }>;
    foreign_keys: Array<{
      from: string;
      ref_schema?: string | null;
      to_table: string;
      to: string;
    }>;
  }>;
}

// --- Internal helper to normalise errors into Error instances ---
function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  try {
    return new Error(typeof err === 'string' ? err : JSON.stringify(err));
  } catch {
    return new Error('Unknown error');
  }
}

// --- Tauri command wrappers ---
export async function openConnection(
  driver: Driver,
  url: string
): Promise<string> {
  try {
    return await invoke<string>('open_connection', { args: { driver, url } });
  } catch (e) {
    throw toError(e);
  }
}

export async function closeConnection(connId: string): Promise<void> {
  try {
    await invoke('close_connection', { args: { conn_id: connId } });
  } catch (e) {
    throw toError(e);
  }
}

export async function executeSql(
  connId: string,
  sql: string,
  limit = 1000
): Promise<QueryResult> {
  try {
    return await invoke<QueryResult>('execute_sql', {
      args: { conn_id: connId, sql, limit },
    });
  } catch (e) {
    throw toError(e);
  }
}

export async function executeSelectSpec(
  connId: string,
  spec: SelectSpec
): Promise<QueryResult> {
  try {
    return await invoke<QueryResult>('execute_select_spec', {
      args: { conn_id: connId, spec },
    });
  } catch (e) {
    throw toError(e);
  }
}

export async function getSchema(connId: string): Promise<DatabaseSchema> {
  try {
    return await invoke<DatabaseSchema>('get_schema', {
      args: { conn_id: connId },
    });
  } catch (e) {
    throw toError(e);
  }
}

// --- Optional convenience wrappers used by the UI ---
// NOTE: On macOS, the backend should open the dialog with security-scoped access enabled
// (e.g. NSOpenPanel with security-scoped bookmarks) so the selected path can be accessed.
export async function openSqliteDialog(): Promise<string | null> {
  try {
    // Backend signature takes Window internally; JS side requires no arguments
    const path = await invoke<string | null>('open_sqlite_dialog');
    return path ?? null;
  } catch (e) {
    throw toError(e);
  }
}

export async function fileSize(path: string): Promise<number> {
  try {
    return await invoke<number>('inkless_fs_size', { args: { path } });
  } catch (e) {
    throw toError(e);
  }
}

// --- macOS security-scoped resource helpers ---
// Begin a security-scoped access session for the given file path and return a session id (token).
// The backend must implement a Tauri command named `begin_security_scoped_access` that accepts `{ path: string }`
// and returns a string token/id. On non-macOS platforms it can be a no-op that returns an empty string.
export async function beginSecurityScopedAccess(path: string): Promise<string> {
  try {
    return await invoke<string>('begin_security_scoped_access', {
      args: { path },
    });
  } catch (e) {
    throw toError(e);
  }
}

// End a previously begun security-scoped session.
// The backend must implement a Tauri command named `end_security_scoped_access` that accepts `{ id: string }`.
export async function endSecurityScopedAccess(id: string): Promise<void> {
  try {
    await invoke('end_security_scoped_access', { args: { id } });
  } catch (e) {
    throw toError(e);
  }
}

export async function copyToTemp(path: string): Promise<string> {
  return await invoke<string>('copy_to_temp', { args: { path } });
}
