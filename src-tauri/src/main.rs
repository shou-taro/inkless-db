// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;  // Tauri command handlers for DB operations
mod db;   // DB layer: pools, schema, builders, etc.

use tauri_plugin_dialog::{DialogExt, FileDialogBuilder};

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
            api::open_sqlite_dialog,
            api::begin_security_scoped_access,
            api::end_security_scoped_access,
            api::inkless_fs_size,
            api::copy_to_temp,
        ])
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
