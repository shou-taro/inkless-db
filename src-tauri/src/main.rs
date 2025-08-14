// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::Connection;
use serde::Serialize;
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder};
use futures::channel::oneshot;

#[derive(Serialize)]
struct Column {
    name: String,
    r#type: String,
    is_primary: bool,
}

#[derive(Serialize)]
struct Table {
    name: String,
    columns: Vec<Column>,
}

#[derive(Serialize)]
struct EdgeEnd {
    table: String,
    column: String,
}

#[derive(Serialize)]
struct FkEdge {
    from: EdgeEnd,
    to: EdgeEnd,
}

#[derive(Serialize)]
struct Schema {
    tables: Vec<Table>,
    fks: Vec<FkEdge>,
}

#[tauri::command]
fn db_get_schema(path: String) -> Result<Schema, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;

    // list user tables (exclude sqlite_*)
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .map_err(|e| e.to_string())?;
    let table_iter = stmt
        .query_map([], |row| Ok(row.get::<_, String>(0)?))
        .map_err(|e| e.to_string())?;

    let mut tables: Vec<Table> = Vec::new();

    for tname_res in table_iter {
        let tname = tname_res.map_err(|e| e.to_string())?;

        // columns via PRAGMA table_info
        let mut pragma = conn
            .prepare(&format!("PRAGMA table_info({});", tname))
            .map_err(|e| e.to_string())?;
        let cols_iter = pragma
            .query_map([], |row| {
                Ok(Column {
                    name: row.get::<_, String>(1)?,
                    r#type: row
                        .get::<_, String>(2)
                        .unwrap_or_else(|_| "TEXT".to_string()),
                    is_primary: row.get::<_, i64>(5).unwrap_or(0) == 1,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut columns = Vec::new();
        for c in cols_iter {
            columns.push(c.map_err(|e| e.to_string())?);
        }

        tables.push(Table { name: tname, columns });
    }

    // foreign keys via PRAGMA foreign_key_list
    let mut fks: Vec<FkEdge> = Vec::new();
    for tbl in &tables {
        let mut fk_stmt = conn
            .prepare(&format!("PRAGMA foreign_key_list({});", tbl.name))
            .map_err(|e| e.to_string())?;
        let fk_iter = fk_stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(3)?, // referenced table
                    row.get::<_, String>(4)?, // from column
                    row.get::<_, String>(5)?, // to column
                ))
            })
            .map_err(|e| e.to_string())?;

        for item in fk_iter {
            let (ref_table, from_col, to_col) = item.map_err(|e| e.to_string())?;
            fks.push(FkEdge {
                from: EdgeEnd {
                    table: tbl.name.clone(),
                    column: from_col,
                },
                to: EdgeEnd {
                    table: ref_table,
                    column: to_col,
                },
            });
        }
    }

    Ok(Schema { tables, fks })
}

#[derive(Serialize)]
struct RowsResult {
    columns: Vec<String>,
    rows: Vec<Vec<serde_json::Value>>,
}

#[tauri::command]
fn db_get_rows(path: String, table: String, limit: Option<usize>) -> Result<RowsResult, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(10);
    // NOTE: table 名は内部利用を想定。外部入力を直接使う場合はエスケープ・バリデーションが必要です。
    let query = format!("SELECT * FROM {} LIMIT {}", table, lim);
    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;

    let col_count = stmt.column_count();
    let columns: Vec<String> = (0..col_count)
        .map(|i| stmt.column_name(i).unwrap_or("").to_string())
        .collect();

    let mut rows_cursor = stmt.query([]).map_err(|e| e.to_string())?;
    let mut rows: Vec<Vec<serde_json::Value>> = Vec::new();

    while let Some(row) = rows_cursor.next().map_err(|e| e.to_string())? {
        let mut rec: Vec<serde_json::Value> = Vec::with_capacity(col_count);
        for i in 0..col_count {
            let v: rusqlite::types::Value = row
                .get::<_, rusqlite::types::Value>(i)
                .unwrap_or(rusqlite::types::Value::Null);
            let j = match v {
                rusqlite::types::Value::Null => serde_json::Value::Null,
                rusqlite::types::Value::Integer(x) => serde_json::Value::from(x),
                rusqlite::types::Value::Real(x) => serde_json::Value::from(x),
                rusqlite::types::Value::Text(x) => serde_json::Value::from(x),
                rusqlite::types::Value::Blob(_) => serde_json::Value::String("<BLOB>".into()),
            };
            rec.push(j);
        }
        rows.push(rec);
    }

    Ok(RowsResult { columns, rows })
}

#[tauri::command]
async fn open_sqlite_dialog(window: tauri::Window) -> Option<String> {
    // Bridge the callback-style API to async via a oneshot channel (non-blocking).
    let (tx, rx) = oneshot::channel::<Option<String>>();

    FileDialogBuilder::new(window.dialog().clone())
        .add_filter("SQLite DB", &["sqlite", "db", "sqlite3", "db3"])
        .pick_file(move |picked| {
            let path = picked.map(|p| p.to_string());
            let _ = tx.send(path);
        });

    rx.await.ok().flatten()
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![db_get_schema, db_get_rows, open_sqlite_dialog])
        // Optional: enable plugins if you added them in Cargo.toml
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
