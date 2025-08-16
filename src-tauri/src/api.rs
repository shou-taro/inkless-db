use tauri_plugin_dialog::{DialogExt, FileDialogBuilder};
use tokio::sync::oneshot;

use serde::Deserialize;
use tauri::State;

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock, atomic::{AtomicUsize, Ordering}};
use std::fs;
use std::path::{PathBuf, Path};

#[cfg(target_os = "macos")]
use cocoa::base::{id, nil, YES};
#[cfg(target_os = "macos")]
use cocoa::foundation::NSString;
#[cfg(target_os = "macos")]
use objc::{class, msg_send, sel, sel_impl};

use crate::db::{self, builder, schema, Driver, Registry, QueryResult};

static SCOPE_MAP: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
static SCOPE_NEXT_ID: AtomicUsize = AtomicUsize::new(1);

fn scope_map() -> &'static Mutex<HashMap<String, String>> {
  SCOPE_MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Deserialize)]
pub struct OpenArgs {
    pub driver: Driver,
    pub url: String,
}

#[tauri::command]
pub async fn open_connection(reg: State<'_, Registry>, args: OpenArgs) -> Result<String, String> {
    db::open_connection(&reg, args.driver, &args.url)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct CloseArgs {
    pub conn_id: String,
}

#[tauri::command]
pub async fn close_connection(reg: State<'_, Registry>, args: CloseArgs) -> Result<(), String> {
    db::close_connection(&reg, &args.conn_id)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct ExecArgs {
    pub conn_id: String,
    pub sql: String,
    pub limit: Option<u32>,
}

#[tauri::command]
pub async fn execute_sql(reg: State<'_, Registry>, args: ExecArgs) -> Result<QueryResult, String> {
    db::execute_sql(
        &reg,
        &args.conn_id,
        &args.sql,
        args.limit.unwrap_or(1000),
    )
    .await
    .map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct SchemaArgs {
    pub conn_id: String,
}

#[tauri::command]
pub async fn get_schema(reg: State<'_, Registry>, args: SchemaArgs) -> Result<serde_json::Value, String> {
    use serde_json::{json, Value};

    let pools = reg.inner.read().await;
    let pool = pools
        .get(&args.conn_id)
        .ok_or_else(|| "connection not found".to_string())?;

    let s = schema::inspect_schema(pool).await.map_err(|e| e.to_string())?;
    let mut v = serde_json::to_value(s).unwrap_or_else(|_| json!({}));

    // Ensure new fields are present in the JSON payload for each column.
    if let Some(obj) = v.as_object_mut() {
        if let Some(tables) = obj.get_mut("tables").and_then(|t| t.as_array_mut()) {
            for t in tables.iter_mut() {
                if let Some(cols) = t.get_mut("columns").and_then(|c| c.as_array_mut()) {
                    for c in cols.iter_mut() {
                        if let Some(col) = c.as_object_mut() {
                            col.entry("primaryKey").or_insert(Value::Bool(false));
                            // If backend provided `not_null` accidentally, convert it to `nullable`
                            if let Some(nn) = col.remove("not_null") { // legacy field -> boolean
                                let nullable = match nn {
                                    Value::Bool(b) => Value::Bool(!b),
                                    Value::Number(n) => Value::Bool(n.as_i64().unwrap_or(0) == 0),
                                    _ => Value::Bool(true),
                                };
                                col.insert("nullable".into(), nullable);
                            }
                            col.entry("nullable").or_insert(Value::Bool(true));
                            col.entry("length").or_insert(Value::Null);
                            col.entry("precision").or_insert(Value::Null);
                            col.entry("scale").or_insert(Value::Null);
                            // normalise default -> defaultValue if needed
                            if let Some(def) = col.remove("default") {
                                col.insert("defaultValue".into(), def);
                            } else {
                                col.entry("defaultValue").or_insert(Value::Null);
                            }
                            // normalise data_type -> type if needed
                            if let Some(dt) = col.remove("data_type") {
                                col.insert("type".into(), dt);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(v)
}

#[derive(Deserialize)]
pub struct SelectSpecArgs {
    pub conn_id: String,
    pub spec: builder::SelectSpec,
}

#[tauri::command]
pub async fn execute_select_spec(
    reg: State<'_, Registry>,
    args: SelectSpecArgs,
) -> Result<QueryResult, String> {
    let pools = reg.inner.read().await;
    let pool = pools.get(&args.conn_id).ok_or_else(|| "connection not found".to_string())?;
    let dialect = pool.dialect();
    let (sql, values) = builder::build_select(&args.spec, dialect);
    db::execute_sql_with_binds(pool, &sql, values, 1000)
        .await
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
fn start_security_scope(path: &str) -> Result<(), String> {
  unsafe {
    let ns_path: id = NSString::alloc(nil).init_str(path);
    let url: id = msg_send![class!(NSURL), fileURLWithPath: ns_path];
    let ok: cocoa::base::BOOL = msg_send![url, startAccessingSecurityScopedResource];
    if ok == YES { Ok(()) } else { Err("failed to start security-scoped access".to_string()) }
  }
}

#[cfg(not(target_os = "macos"))]
fn start_security_scope(_path: &str) -> Result<(), String> { Ok(()) }

#[cfg(target_os = "macos")]
fn stop_security_scope(path: &str) {
  unsafe {
    let ns_path: id = NSString::alloc(nil).init_str(path);
    let url: id = msg_send![class!(NSURL), fileURLWithPath: ns_path];
    let _: () = msg_send![url, stopAccessingSecurityScopedResource];
  }
}

#[cfg(not(target_os = "macos"))]
fn stop_security_scope(_path: &str) { /* no-op */ }

#[derive(Deserialize)]
pub struct BeginScopeArgs { pub path: String }

#[tauri::command]
pub async fn begin_security_scoped_access(args: BeginScopeArgs) -> Result<String, String> {
  start_security_scope(&args.path)?;
  let id_num = SCOPE_NEXT_ID.fetch_add(1, Ordering::Relaxed);
  let id = format!("scope-{}", id_num);
  let mut map = scope_map().lock().unwrap();
  map.insert(id.clone(), args.path);
  Ok(id)
}

#[derive(Deserialize)]
pub struct EndScopeArgs { pub id: String }

#[tauri::command]
pub async fn end_security_scoped_access(args: EndScopeArgs) -> Result<(), String> {
  let mut map = scope_map().lock().unwrap();
  if let Some(path) = map.remove(&args.id) {
    stop_security_scope(&path);
  }
  Ok(())
}

#[tauri::command]
pub async fn open_sqlite_dialog(window: tauri::Window) -> Option<String> {
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
pub async fn inkless_fs_size(path: String) -> Result<u64, String> {
    use std::path::Path;
    use std::fs;

    let p = Path::new(&path);
    // Prefer metadata (follows symlinks). Fallback to symlink_metadata.
    let md = fs::metadata(p).or_else(|_| fs::symlink_metadata(p))
        .map_err(|e| e.to_string())?;
    Ok(md.len())
}

fn ensure_dir_sync(path: &Path) -> Result<(), String> {
    if !path.exists() {
        std::fs::create_dir_all(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn copy_to_temp(path: String) -> Result<String, String> {
    // Target folder: <tmp>/inkless-db
    let mut folder = std::env::temp_dir();
    folder.push("inkless-db");
    let folder_pb = PathBuf::from(&folder);
    ensure_dir_sync(&folder_pb)?;

    // Source path and stamped target name
    let src = PathBuf::from(&path);
    let name = src
        .file_name()
        .ok_or_else(|| "invalid source path".to_string())?;
    let stamped = format!(
        "{}-{}",
        chrono::Utc::now().timestamp_millis(),
        name.to_string_lossy()
    );
    let mut target = folder_pb.clone();
    target.push(stamped);

    fs::copy(&src, &target).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}