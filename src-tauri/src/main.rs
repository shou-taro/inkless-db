// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;  // Tauri command handlers for DB operations
mod db;   // DB layer: pools, schema, builders, etc.

use futures::channel::oneshot;
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder};

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

#[tauri::command]
async fn inkless_fs_size(path: String) -> Result<u64, String> {
    // Returns the file size (in bytes) for the given absolute path.
    use std::fs;
    fs::metadata(&path)
        .map(|m| m.len())
        .map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        // Share the connection registry across commands
        .manage(db::Registry::new())
        // Expose DB + utility commands to the frontend
        .invoke_handler(tauri::generate_handler![
            // DB: connections & queries
            api::open_connection,
            api::close_connection,
            api::execute_sql,
            api::get_schema,
            api::execute_select_spec,
            // Utils
            open_sqlite_dialog,
            inkless_fs_size
        ])
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
