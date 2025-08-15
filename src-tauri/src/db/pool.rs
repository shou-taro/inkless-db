use std::time::Duration;

use anyhow::Result;
use sqlx::{Pool, Row};

use super::{Dialect, Driver, DynPool};

/// Generic pool tuning options used across all drivers.
#[derive(Debug, Clone)]
pub struct PoolOptions {
    pub max_connections: u32,
    /// Timeout when waiting to acquire a connection from the pool.
    pub acquire_timeout_ms: u64,
    /// Optional idle timeout for connections in the pool.
    pub idle_timeout_ms: Option<u64>,
}

impl Default for PoolOptions {
    fn default() -> Self {
        Self {
            max_connections: 5,
            acquire_timeout_ms: 10_000, // 10s
            idle_timeout_ms: Some(300_000), // 5min
        }
    }
}

/// Create a `DynPool` for the given driver and URL. The URL should be in the
/// standard form for each driver:
/// - SQLite:  `sqlite:///absolute/path/to.db?mode=rwc`  または  `sqlite::memory:`
/// - Postgres:`postgres://user:pass@host:5432/dbname` （sslmodeはURLで指定可）
/// - MySQL:   `mysql://user:pass@host:3306/dbname`
pub async fn create_pool(driver: Driver, url: &str, opts: Option<PoolOptions>) -> Result<DynPool> {
    let opts = opts.unwrap_or_default();
    let acquire = Duration::from_millis(opts.acquire_timeout_ms);
    let idle = opts.idle_timeout_ms.map(Duration::from_millis);

    let pool = match driver {
        Driver::Sqlite => {
            let mut builder = sqlx::sqlite::SqlitePoolOptions::new();
            builder = builder.max_connections(opts.max_connections).acquire_timeout(acquire);
            if let Some(idle) = idle { builder = builder.idle_timeout(idle); }
            let p = builder.connect(url).await?;
            DynPool::Sqlite(p)
        }
        Driver::Postgres => {
            let mut builder = sqlx::postgres::PgPoolOptions::new();
            builder = builder.max_connections(opts.max_connections).acquire_timeout(acquire);
            if let Some(idle) = idle { builder = builder.idle_timeout(idle); }
            let p = builder.connect(url).await?;
            DynPool::Postgres(p)
        }
        Driver::MySql => {
            let mut builder = sqlx::mysql::MySqlPoolOptions::new();
            builder = builder.max_connections(opts.max_connections).acquire_timeout(acquire);
            if let Some(idle) = idle { builder = builder.idle_timeout(idle); }
            let p = builder.connect(url).await?;
            DynPool::MySql(p)
        }
    };

    Ok(pool)
}

/// Quick health check for a pool. Useful after (re)connecting and in a connection manager.
pub async fn ping(pool: &DynPool) -> Result<()> {
    match pool {
        DynPool::Sqlite(p) => {
            let _ = sqlx::query("SELECT 1 as one").fetch_one(p).await?;
        }
        DynPool::Postgres(p) => {
            let _ = sqlx::query("SELECT 1 as one").fetch_one(p).await?;
        }
        DynPool::MySql(p) => {
            let _ = sqlx::query("SELECT 1 as one").fetch_one(p).await?;
        }
    }
    Ok(())
}

/// Get the dialect for the given pool (helper passthrough).
pub fn dialect_of(pool: &DynPool) -> Dialect { pool.dialect() }

/// Convenience helpers for building URLs from components. These are optional
/// and can be replaced by direct URL strings from the UI.
pub mod url {
    pub fn sqlite_file(path: &str) -> String {
        // Ensure absolute paths are prefixed properly. sqlx/sqlite accepts `sqlite://`.
        format!("sqlite://{}", path)
    }
    pub fn sqlite_memory() -> String { "sqlite::memory:".to_string() }

    pub fn postgres(host: &str, port: u16, db: &str, user: &str, pass: &str) -> String {
        format!("postgres://{}:{}@{}:{}/{}", user, pass, host, port, db)
    }

    pub fn mysql(host: &str, port: u16, db: &str, user: &str, pass: &str) -> String {
        format!("mysql://{}:{}@{}:{}/{}", user, pass, host, port, db)
    }
}