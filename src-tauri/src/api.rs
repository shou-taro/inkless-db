use serde::Deserialize;
use tauri::State;

use crate::db::{self, builder, schema, Driver, Registry, QueryResult};

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
    let pools = reg.inner.read().await;
    let pool = pools.get(&args.conn_id).ok_or_else(|| "connection not found".to_string())?;
    schema::inspect_schema(pool)
        .await
        .map(|s| serde_json::to_value(s).unwrap_or_default())
        .map_err(|e| e.to_string())
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