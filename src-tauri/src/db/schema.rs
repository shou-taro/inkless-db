use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Pool, Row};

use super::{Dialect, DynPool};

/// A column definition in a table or view.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnDef {
    pub name: String,
    pub data_type: String,
    pub not_null: bool,
    pub default: Option<String>,
    pub is_pk: bool,
}

/// A foreign key constraint between tables.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForeignKeyDef {
    pub from: String,
    pub ref_schema: Option<String>,
    pub to_table: String,
    pub to: String,
}

/// A table or view definition with columns and foreign keys.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableDef {
    pub schema: String,
    pub name: String,
    pub type_: String,
    pub columns: Vec<ColumnDef>,
    pub foreign_keys: Vec<ForeignKeyDef>,
}

/// Top-level schema info for a database.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseSchema {
    pub dialect: String,
    pub schemas: Vec<String>,
    pub tables: Vec<TableDef>,
}

/// Retrieve schema for any supported dialect.
pub async fn inspect_schema(pool: &DynPool) -> Result<DatabaseSchema> {
    match pool {
        DynPool::Sqlite(p) => inspect_sqlite(p).await,
        DynPool::Postgres(p) => inspect_postgres(p).await,
        DynPool::MySql(p) => inspect_mysql(p).await,
    }
}

async fn inspect_sqlite(pool: &Pool<sqlx::Sqlite>) -> Result<DatabaseSchema> {
    let tv = sqlx::query(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name;"
    )
    .fetch_all(pool)
    .await?;

    let mut tables = Vec::new();
    for row in tv {
        let name: String = row.try_get("name")?;
        let type_: String = row.try_get("type")?;

        let cols_rows = sqlx::query(&format!("PRAGMA table_info('{}');", name.replace("'", "''")))
            .fetch_all(pool)
            .await?;
        let columns = cols_rows
            .into_iter()
            .map(|r| ColumnDef {
                name: r.try_get::<String, _>("name").unwrap_or_default(),
                data_type: r.try_get::<String, _>("type").unwrap_or_default(),
                not_null: r.try_get::<i64, _>("notnull").unwrap_or(0) == 1,
                default: r.try_get::<Option<String>, _>("dflt_value").unwrap_or(None),
                is_pk: r.try_get::<i64, _>("pk").unwrap_or(0) == 1,
            })
            .collect();

        let fk_rows = sqlx::query(&format!("PRAGMA foreign_key_list('{}');", name.replace("'", "''")))
            .fetch_all(pool)
            .await?;
        let foreign_keys = fk_rows
            .into_iter()
            .map(|r| ForeignKeyDef {
                from: r.try_get::<String, _>("from").unwrap_or_default(),
                ref_schema: None,
                to_table: r.try_get::<String, _>("table").unwrap_or_default(),
                to: r.try_get::<String, _>("to").unwrap_or_default(),
            })
            .collect();

        tables.push(TableDef {
            schema: "main".into(),
            name,
            type_,
            columns,
            foreign_keys,
        });
    }

    Ok(DatabaseSchema {
        dialect: "sqlite".into(),
        schemas: vec!["main".into()],
        tables,
    })
}

async fn inspect_postgres(pool: &Pool<sqlx::Postgres>) -> Result<DatabaseSchema> {
    let tv = sqlx::query(
        r#"
        SELECT table_schema, table_name, table_type
        FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog','information_schema')
        ORDER BY table_schema, table_name
        "#
    )
    .fetch_all(pool)
    .await?;

    let mut tables = Vec::new();
    for row in tv {
        let schema: String = row.try_get("table_schema")?;
        let name: String = row.try_get("table_name")?;
        let type_: String = row.try_get("table_type")?;

        let cols_rows = sqlx::query(
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
            "#
        )
        .bind(&schema)
        .bind(&name)
        .fetch_all(pool)
        .await?;
        let columns = cols_rows
            .into_iter()
            .map(|r| ColumnDef {
                name: r.try_get::<String, _>("column_name").unwrap_or_default(),
                data_type: r.try_get::<String, _>("data_type").unwrap_or_default(),
                not_null: r.try_get::<bool, _>("not_null").unwrap_or(false),
                default: r.try_get::<Option<String>, _>("default").unwrap_or(None),
                is_pk: r.try_get::<bool, _>("is_pk").unwrap_or(false),
            })
            .collect();

        let fk_rows = sqlx::query(
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
            "#
        )
        .bind(&schema)
        .bind(&name)
        .fetch_all(pool)
        .await?;
        let foreign_keys = fk_rows
            .into_iter()
            .map(|r| ForeignKeyDef {
                from: r.try_get::<String, _>("from").unwrap_or_default(),
                ref_schema: Some(r.try_get::<String, _>("ref_schema").unwrap_or_default()),
                to_table: r.try_get::<String, _>("to_table").unwrap_or_default(),
                to: r.try_get::<String, _>("to").unwrap_or_default(),
            })
            .collect();

        tables.push(TableDef {
            schema,
            name,
            type_,
            columns,
            foreign_keys,
        });
    }

    let schemas: Vec<String> = tables.iter().map(|t| t.schema.clone()).collect();

    Ok(DatabaseSchema {
        dialect: "postgres".into(),
        schemas,
        tables,
    })
}

async fn inspect_mysql(pool: &Pool<sqlx::MySql>) -> Result<DatabaseSchema> {
    let tv = sqlx::query(
        r#"
        SELECT table_schema, table_name, table_type
        FROM information_schema.tables
        WHERE table_schema NOT IN ('mysql','information_schema','performance_schema','sys')
        ORDER BY table_schema, table_name
        "#
    )
    .fetch_all(pool)
    .await?;

    let mut tables = Vec::new();
    for row in tv {
        let schema: String = row.try_get("table_schema")?;
        let name: String = row.try_get("table_name")?;
        let type_: String = row.try_get("table_type")?;

        let cols_rows = sqlx::query(
            r#"
            SELECT column_name, data_type, is_nullable, column_default, column_key
            FROM information_schema.columns
            WHERE table_schema = ? AND table_name = ?
            ORDER BY ordinal_position
            "#
        )
        .bind(&schema)
        .bind(&name)
        .fetch_all(pool)
        .await?;
        let columns = cols_rows
            .into_iter()
            .map(|r| {
                let key: String = r.try_get("column_key").unwrap_or_default();
                ColumnDef {
                    name: r.try_get::<String, _>("column_name").unwrap_or_default(),
                    data_type: r.try_get::<String, _>("data_type").unwrap_or_default(),
                    not_null: r.try_get::<String, _>("is_nullable").unwrap_or("YES".into()) == "NO",
                    default: r.try_get::<Option<String>, _>("column_default").unwrap_or(None),
                    is_pk: key == "PRI",
                }
            })
            .collect();

        let fk_rows = sqlx::query(
            r#"
            SELECT column_name AS `from`,
                   referenced_table_schema AS ref_schema,
                   referenced_table_name AS to_table,
                   referenced_column_name AS `to`
            FROM information_schema.KEY_COLUMN_USAGE
            WHERE table_schema = ? AND table_name = ? AND referenced_table_name IS NOT NULL
            "#
        )
        .bind(&schema)
        .bind(&name)
        .fetch_all(pool)
        .await?;
        let foreign_keys = fk_rows
            .into_iter()
            .map(|r| ForeignKeyDef {
                from: r.try_get::<String, _>("from").unwrap_or_default(),
                ref_schema: r.try_get::<Option<String>, _>("ref_schema").unwrap_or(None),
                to_table: r.try_get::<String, _>("to_table").unwrap_or_default(),
                to: r.try_get::<String, _>("to").unwrap_or_default(),
            })
            .collect();

        tables.push(TableDef {
            schema,
            name,
            type_,
            columns,
            foreign_keys,
        });
    }

    let mut schemas: Vec<String> = tables.iter().map(|t| t.schema.clone()).collect();
    schemas.sort();
    schemas.dedup();

    Ok(DatabaseSchema {
        dialect: "mysql".into(),
        schemas,
        tables,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::DynPool;
    use sqlx::Executor;

    /// Verifies that `inspect_schema` works for an in-memory SQLite database.
    #[tokio::test]
    async fn inspect_sqlite_schema_basic() -> anyhow::Result<()> {
        // Create an in-memory SQLite pool
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await?;

        // Create a sample table with a foreign key
        pool.execute(
            r#"
            CREATE TABLE parent (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL
            );
            "#,
        )
        .await?;

        pool.execute(
            r#"
            CREATE TABLE child (
                id INTEGER PRIMARY KEY,
                parent_id INTEGER NOT NULL,
                FOREIGN KEY (parent_id) REFERENCES parent(id)
            );
            "#,
        )
        .await?;

        let dyn_pool = DynPool::Sqlite(pool.clone());
        let schema = inspect_schema(&dyn_pool).await?;

        assert_eq!(schema.dialect, "sqlite");
        assert!(schema.tables.iter().any(|t| t.name == "parent"));
        assert!(schema.tables.iter().any(|t| t.name == "child"));

        // Check foreign key relationship in child table
        let child_table = schema.tables.iter().find(|t| t.name == "child").unwrap();
        assert_eq!(child_table.foreign_keys.len(), 1);
        assert_eq!(child_table.foreign_keys[0].to_table, "parent");
        Ok(())
    }
}
