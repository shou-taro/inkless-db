pub mod builder;
pub mod schema;
pub mod pool; 

use std::{collections::HashMap, sync::Arc, time::{SystemTime, UNIX_EPOCH}};

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{self, Column, Pool, Row};
use tokio::sync::RwLock;

/// DB driver kinds supported by the app.
#[derive(Clone, Copy, Serialize, Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Driver {
    Sqlite,
    Postgres,
    MySql,
}

/// Dialect mirrors Driver but is used internally where a reference to pool is present.
#[derive(Clone, Copy, Debug)]
pub enum Dialect {
    Sqlite,
    Postgres,
    MySql,
}

/// Dynamic pool wrapper so we can store heterogeneous pools in a single map.
#[derive(Clone)]
pub enum DynPool {
    Sqlite(Pool<sqlx::Sqlite>),
    Postgres(Pool<sqlx::Postgres>),
    MySql(Pool<sqlx::MySql>),
}

impl DynPool {
    pub fn dialect(&self) -> Dialect {
        match self {
            DynPool::Sqlite(_) => Dialect::Sqlite,
            DynPool::Postgres(_) => Dialect::Postgres,
            DynPool::MySql(_) => Dialect::MySql,
        }
    }
}

/// Connection registry (shared state managed by Tauri).
#[derive(Default)]
pub struct Registry {
    pub inner: Arc<RwLock<HashMap<String, DynPool>>>,
}

impl Registry {
    pub fn new() -> Self {
        Self::default()
    }
}

/// Result set returned to the frontend.
#[derive(Serialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<Value>>, // each row is a JSON array of cell values
    pub truncated: bool,       // true if rows were cut off to respect the limit
}

/// Open a connection and register it. Returns a connection id.
pub async fn open_connection(reg: &Registry, driver: Driver, url: &str) -> Result<String> {
    let id = gen_id();
    let pool = match driver {
        Driver::Sqlite => {
            let pool = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(5)
                .connect(url)
                .await?;
            DynPool::Sqlite(pool)
        }
        Driver::Postgres => {
            let pool = sqlx::postgres::PgPoolOptions::new()
                .max_connections(5)
                .connect(url)
                .await?;
            DynPool::Postgres(pool)
        }
        Driver::MySql => {
            let pool = sqlx::mysql::MySqlPoolOptions::new()
                .max_connections(5)
                .connect(url)
                .await?;
            DynPool::MySql(pool)
        }
    };

    reg.inner.write().await.insert(id.clone(), pool);
    Ok(id)
}

/// Close (forget) a connection by id.
pub async fn close_connection(reg: &Registry, conn_id: &str) -> Result<()> {
    reg.inner.write().await.remove(conn_id);
    Ok(())
}

/// Execute arbitrary SQL and return a JSON-friendly result.
/// NOTE: For large datasets, prefer specifying a LIMIT/OFFSET on the SQL from the UI.
pub async fn execute_sql(reg: &Registry, conn_id: &str, sql: &str, limit: u32) -> Result<QueryResult> {
    let pools = reg.inner.read().await;
    let pool = pools
        .get(conn_id)
        .ok_or_else(|| anyhow::anyhow!("connection not found"))?;

    match pool {
        DynPool::Sqlite(p) => {
            let rows: Vec<sqlx::sqlite::SqliteRow> = sqlx::query(sql).fetch_all(p).await?;
            Ok(rows_to_result_sqlite(rows, limit as usize))
        }
        DynPool::Postgres(p) => {
            let rows: Vec<sqlx::postgres::PgRow> = sqlx::query(sql).fetch_all(p).await?;
            Ok(rows_to_result_pg(rows, limit as usize))
        }
        DynPool::MySql(p) => {
            let rows: Vec<sqlx::mysql::MySqlRow> = sqlx::query(sql).fetch_all(p).await?;
            Ok(rows_to_result_mysql(rows, limit as usize))
        }
    }
}

/// Fetch database schema (schemas, tables, columns, minimal indexes/keys) as JSON.
pub async fn get_schema(reg: &Registry, conn_id: &str) -> Result<Value> {
    let pools = reg.inner.read().await;
    let pool = pools
        .get(conn_id)
        .ok_or_else(|| anyhow::anyhow!("connection not found"))?;

    match pool {
        DynPool::Sqlite(p) => schema_sqlite(p).await,
        DynPool::Postgres(p) => schema_postgres(p).await,
        DynPool::MySql(p) => schema_mysql(p).await,
    }
}

// ---------- helpers ----------

fn gen_id() -> String {
    // Sufficiently unique for local registry purposes (no external exposure)
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{:x}-{}", nanos, std::process::id())
}

fn rows_to_result_sqlite(rows: Vec<sqlx::sqlite::SqliteRow>, cap: usize) -> QueryResult {
    let mut columns: Vec<String> = vec![];
    let mut out: Vec<Vec<Value>> = vec![];

    for (idx, row) in rows.into_iter().enumerate() {
        if idx == 0 {
            columns = row
                .columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect();
        }
        if out.len() >= cap {
            break;
        }
        let mut rec = Vec::with_capacity(row.len());
        for i in 0..row.len() {
            // Try common types; fallback to string or null
            if let Ok(v) = row.try_get::<i64, _>(i) {
                rec.push(Value::from(v));
            } else if let Ok(v) = row.try_get::<f64, _>(i) {
                rec.push(Value::from(v));
            } else if let Ok(v) = row.try_get::<bool, _>(i) {
                rec.push(Value::from(v));
            } else if let Ok(v) = row.try_get::<String, _>(i) {
                rec.push(Value::from(v));
            } else if let Ok(v) = row.try_get::<Vec<u8>, _>(i) {
                rec.push(Value::from(STANDARD.encode(v)));
            } else {
                rec.push(Value::Null);
            }
        }
        out.push(rec);
    }

    let truncated = out.len() >= cap;
    QueryResult {
        columns,
        rows: out,
        truncated,
    }
}

fn rows_to_result_pg(rows: Vec<sqlx::postgres::PgRow>, cap: usize) -> QueryResult {
    let mut columns: Vec<String> = vec![];
    let mut out: Vec<Vec<Value>> = vec![];

    for (idx, row) in rows.into_iter().enumerate() {
        if idx == 0 {
            columns = row
                .columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect();
        }
        if out.len() >= cap {
            break;
        }
        let mut rec = Vec::with_capacity(row.len());
        for i in 0..row.len() {
            if let Ok(v) = row.try_get::<i64, _>(i) {
                rec.push(Value::from(v));
            } else if let Ok(v) = row.try_get::<f64, _>(i) {
                rec.push(Value::from(v));
            } else if let Ok(v) = row.try_get::<bool, _>(i) {
                rec.push(Value::from(v));
            } else if let Ok(v) = row.try_get::<String, _>(i) {
                rec.push(Value::from(v));
            } else if let Ok(v) = row.try_get::<Vec<u8>, _>(i) {
                rec.push(Value::from(STANDARD.encode(v)));
            } else {
                rec.push(Value::Null);
            }
        }
        out.push(rec);
    }

    let truncated = out.len() >= cap;
    QueryResult {
        columns,
        rows: out,
        truncated,
    }
}

fn rows_to_result_mysql(rows: Vec<sqlx::mysql::MySqlRow>, cap: usize) -> QueryResult {
    let mut columns: Vec<String> = vec![];
    let mut out: Vec<Vec<Value>> = vec![];

    for (idx, row) in rows.into_iter().enumerate() {
        if idx == 0 {
            columns = row
                .columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect();
        }
        if out.len() >= cap {
            break;
        }
        let mut rec = Vec::with_capacity(row.len());
        for i in 0..row.len() {
            if let Ok(v) = row.try_get::<i64, _>(i) {
                rec.push(Value::from(v));
            } else if let Ok(v) = row.try_get::<f64, _>(i) {
                rec.push(Value::from(v));
            } else if let Ok(v) = row.try_get::<bool, _>(i) {
                rec.push(Value::from(v));
            } else if let Ok(v) = row.try_get::<String, _>(i) {
                rec.push(Value::from(v));
            } else if let Ok(v) = row.try_get::<Vec<u8>, _>(i) {
                rec.push(Value::from(STANDARD.encode(v)));
            } else {
                rec.push(Value::Null);
            }
        }
        out.push(rec);
    }

    let truncated = out.len() >= cap;
    QueryResult {
        columns,
        rows: out,
        truncated,
    }
}

/// Execute SQL with bound parameters generated by SeaQuery.
pub async fn execute_sql_with_binds(
    pool: &DynPool,
    sql: &str,
    values: sea_query_binder::SqlxValues,
    limit: u32,
) -> anyhow::Result<QueryResult> {
    let cap = limit as usize;
    match pool {
        DynPool::Sqlite(p) => {
            let rows: Vec<sqlx::sqlite::SqliteRow> = sqlx::query_with(sql, values).fetch_all(p).await?;
            Ok(rows_to_result_sqlite(rows, cap))
        }
        DynPool::Postgres(p) => {
            let rows: Vec<sqlx::postgres::PgRow> = sqlx::query_with(sql, values).fetch_all(p).await?;
            Ok(rows_to_result_pg(rows, cap))
        }
        DynPool::MySql(p) => {
            let rows: Vec<sqlx::mysql::MySqlRow> = sqlx::query_with(sql, values).fetch_all(p).await?;
            Ok(rows_to_result_mysql(rows, cap))
        }
    }
}

// -------- schema discovery per dialect --------

async fn schema_sqlite(pool: &Pool<sqlx::Sqlite>) -> Result<Value> {
    // tables & views
    let tv = sqlx::query(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name;",
    )
    .fetch_all(pool)
    .await?;

    let mut tables = Vec::new();

    for row in tv {
        let name: String = row.try_get("name").unwrap_or_default();
        let ttype: String = row.try_get("type").unwrap_or_else(|_| "table".to_string());

        // PRAGMA table_info cannot be parameterized; safe here because name comes from sqlite_master
        let cols: Vec<_> = sqlx::query(&format!("PRAGMA table_info('{}');", name.replace("'", "''")))
            .fetch_all(pool)
            .await?
            .into_iter()
            .map(|r| {
                json!({
                    "name": r.try_get::<String, _>("name").unwrap_or_default(),
                    "data_type": r.try_get::<String, _>("type").unwrap_or_default(),
                    "not_null": r.try_get::<i64, _>("notnull").unwrap_or(0) == 1,
                    "default": r.try_get::<Option<String>, _>("dflt_value").unwrap_or(None),
                    "is_pk": r.try_get::<i64, _>("pk").unwrap_or(0) == 1
                })
            })
            .collect();

        let fks: Vec<_> = sqlx::query(&format!("PRAGMA foreign_key_list('{}');", name.replace("'", "''")))
            .fetch_all(pool)
            .await?
            .into_iter()
            .map(|r| {
                json!({
                    "from": r.try_get::<String, _>("from").unwrap_or_default(),
                    "to_table": r.try_get::<String, _>("table").unwrap_or_default(),
                    "to": r.try_get::<String, _>("to").unwrap_or_default(),
                    "on_update": r.try_get::<Option<String>, _>("on_update").unwrap_or(None),
                    "on_delete": r.try_get::<Option<String>, _>("on_delete").unwrap_or(None)
                })
            })
            .collect();

        tables.push(json!({
            "schema": "main",
            "name": name,
            "type": ttype,
            "columns": cols,
            "foreign_keys": fks
        }));
    }

    Ok(json!({
        "dialect": "sqlite",
        "schemas": ["main"],
        "tables": tables
    }))
}

async fn schema_postgres(pool: &Pool<sqlx::Postgres>) -> Result<Value> {
    let tv = sqlx::query(
        r#"
        SELECT table_schema, table_name, table_type
        FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog','information_schema')
        ORDER BY table_schema, table_name
        "#,
    )
    .fetch_all(pool)
    .await?;

    let mut tables = Vec::new();

    for row in tv {
        let schema: String = row.try_get("table_schema").unwrap_or_default();
        let name: String = row.try_get("table_name").unwrap_or_default();
        let ttype: String = row.try_get("table_type").unwrap_or_default();

        let cols = sqlx::query(
            r#"
            SELECT a.attname AS column_name,
                   t.typname AS data_type,
                   a.attnotnull AS not_null,
                   pg_get_expr(ad.adbin, ad.adrelid) AS default,
                   EXISTS (
                       SELECT 1 FROM pg_index i
                       WHERE i.indrelid = a.attrelid
                         AND a.attnum = ANY(i.indkey)
                         AND i.indisprimary
                   ) AS is_pk
            FROM pg_attribute a
            JOIN pg_class c ON c.oid = a.attrelid
            JOIN pg_type t ON t.oid = a.atttypid
            LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE a.attnum > 0 AND NOT a.attisdropped AND n.nspname = $1 AND c.relname = $2
            ORDER BY a.attnum
            "#,
        )
        .bind(&schema)
        .bind(&name)
        .fetch_all(pool)
        .await?;

        let cols: Vec<_> = cols
            .into_iter()
            .map(|r| {
                json!({
                    "name": r.try_get::<String, _>("column_name").unwrap_or_default(),
                    "data_type": r.try_get::<String, _>("data_type").unwrap_or_default(),
                    "not_null": r.try_get::<bool, _>("not_null").unwrap_or(false),
                    "default": r.try_get::<Option<String>, _>("default").unwrap_or(None),
                    "is_pk": r.try_get::<bool, _>("is_pk").unwrap_or(false)
                })
            })
            .collect();

        // Foreign keys (simplified)
        let fks = sqlx::query(
            r#"
            SELECT kcu.column_name AS "from",
                   ccu.table_schema AS ref_schema,
                   ccu.table_name AS to_table,
                   ccu.column_name AS "to"
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
              ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1 AND tc.table_name = $2
            "#,
        )
        .bind(&schema)
        .bind(&name)
        .fetch_all(pool)
        .await?;

        let fks: Vec<_> = fks
            .into_iter()
            .map(|r| {
                json!({
                    "from": r.try_get::<String, _>("from").unwrap_or_default(),
                    "ref_schema": r.try_get::<String, _>("ref_schema").unwrap_or_default(),
                    "to_table": r.try_get::<String, _>("to_table").unwrap_or_default(),
                    "to": r.try_get::<String, _>("to").unwrap_or_default(),
                })
            })
            .collect();

        tables.push(json!({
            "schema": schema,
            "name": name,
            "type": ttype,
            "columns": cols,
            "foreign_keys": fks
        }));
    }

    // collect distinct schema names
    let schemas: Vec<String> = tables
        .iter()
        .filter_map(|t| t.get("schema").and_then(|v| v.as_str()).map(|s| s.to_string()))
        .collect();

    Ok(json!({
        "dialect": "postgres",
        "schemas": schemas,
        "tables": tables
    }))
}

async fn schema_mysql(pool: &Pool<sqlx::MySql>) -> Result<Value> {
    let tv = sqlx::query(
        r#"
        SELECT table_schema, table_name, table_type
        FROM information_schema.tables
        WHERE table_schema NOT IN ('mysql','information_schema','performance_schema','sys')
        ORDER BY table_schema, table_name
        "#,
    )
    .fetch_all(pool)
    .await?;

    let mut tables = Vec::new();

    for row in tv {
        let schema: String = row.try_get("table_schema").unwrap_or_default();
        let name: String = row.try_get("table_name").unwrap_or_default();
        let ttype: String = row.try_get("table_type").unwrap_or_default();

        let cols = sqlx::query(
            r#"
            SELECT column_name, data_type, is_nullable, column_default, column_key
            FROM information_schema.columns
            WHERE table_schema = ? AND table_name = ?
            ORDER BY ordinal_position
            "#,
        )
        .bind(&schema)
        .bind(&name)
        .fetch_all(pool)
        .await?;

        let cols: Vec<_> = cols
            .into_iter()
            .map(|r| {
                let key: String = r.try_get::<String, _>("column_key").unwrap_or_default();
                json!({
                    "name": r.try_get::<String, _>("column_name").unwrap_or_default(),
                    "data_type": r.try_get::<String, _>("data_type").unwrap_or_default(),
                    "not_null": r.try_get::<String, _>("is_nullable").unwrap_or_else(|_| "YES".into()) == "NO",
                    "default": r.try_get::<Option<String>, _>("column_default").unwrap_or(None),
                    "is_pk": key == "PRI",
                })
            })
            .collect();

        let fks = sqlx::query(
            r#"
            SELECT column_name AS `from`,
                   referenced_table_schema AS ref_schema,
                   referenced_table_name AS to_table,
                   referenced_column_name AS `to`
            FROM information_schema.KEY_COLUMN_USAGE
            WHERE table_schema = ? AND table_name = ? AND referenced_table_name IS NOT NULL
            "#,
        )
        .bind(&schema)
        .bind(&name)
        .fetch_all(pool)
        .await?;

        let fks: Vec<_> = fks
            .into_iter()
            .map(|r| {
                json!({
                    "from": r.try_get::<String, _>("from").unwrap_or_default(),
                    "ref_schema": r.try_get::<Option<String>, _>("ref_schema").unwrap_or(None),
                    "to_table": r.try_get::<String, _>("to_table").unwrap_or_default(),
                    "to": r.try_get::<String, _>("to").unwrap_or_default(),
                })
            })
            .collect();

        tables.push(json!({
            "schema": schema,
            "name": name,
            "type": ttype,
            "columns": cols,
            "foreign_keys": fks
        }));
    }

    // collect distinct schema names
    let mut schemas: Vec<String> = tables
        .iter()
        .filter_map(|t| t.get("schema").and_then(|v| v.as_str()).map(|s| s.to_string()))
        .collect();
    schemas.sort();
    schemas.dedup();

    Ok(json!({
        "dialect": "mysql",
        "schemas": schemas,
        "tables": tables
    }))
}


#[cfg(test)]
mod it_sqlite {
    use super::*;
    use crate::db::builder::{build_select, FilterCond, SelectSpec};
    use crate::db::Dialect;

    /// Integration-style test for the SQLite path:
    /// build a query with SeaQuery, execute via `execute_sql_with_binds`,
    /// and assert the shaped result. Uses in-memory SQLite to remain hermetic.
    #[tokio::test]
    async fn select_via_builder_and_binds_sqlite() -> anyhow::Result<()> {
        // Prepare an in-memory database with a small fixture
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await?;

        sqlx::query(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, active INTEGER);",
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            "INSERT INTO users (name, active) VALUES ('alice', 1), ('bob', 0), ('adam', 1);",
        )
        .execute(&pool)
        .await?;

        let dyn_pool = DynPool::Sqlite(pool.clone());

        // Build a SELECT spec: only active users whose name starts with 'a', ordered by id
        let spec = SelectSpec {
            table: "users".into(),
            columns: vec!["id".into(), "name".into()],
            filters: vec![
                FilterCond { column: "active".into(), op: "=".into(), value: serde_json::json!(1) },
                FilterCond { column: "name".into(), op: "like".into(), value: serde_json::json!("a%") },
            ],
            sort: Some(("id".into(), true)),
            limit: Some(100),
            offset: Some(0),
        };

        let (sql, values) = build_select(&spec, Dialect::Sqlite);
        let result = execute_sql_with_binds(&dyn_pool, &sql, values, 1000).await?;

        // Expect two rows: alice(id=1) and adam(id=3), in ascending id order
        assert_eq!(result.columns, vec!["id".to_string(), "name".to_string()]);
        assert_eq!(result.rows.len(), 2);
        assert_eq!(result.rows[0][0], serde_json::json!(1));
        assert_eq!(result.rows[0][1], serde_json::json!("alice"));
        assert_eq!(result.rows[1][0], serde_json::json!(3));
        assert_eq!(result.rows[1][1], serde_json::json!("adam"));
        assert!(!result.truncated);
        Ok(())
    }
}