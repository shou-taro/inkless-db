use sea_query::{
    Alias, Expr, Order, Query, PostgresQueryBuilder, MysqlQueryBuilder, SqliteQueryBuilder,
    SimpleExpr,
};
use sea_query_binder::{SqlxBinder, SqlxValues};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

use super::Dialect;

/// Specification for SELECT built from UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectSpec {
    pub table: String,
    pub columns: Vec<String>,
    pub filters: Vec<FilterCond>,
    pub sort: Option<(String, bool)>, // (col, asc)
    pub limit: Option<u64>,
    pub offset: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterCond {
    pub column: String,
    pub op: String,           // "=", "!=", ">", ">=", "<", "<=", "like", "not_like", "is_null", "is_not_null", "in", "not_in"
    pub value: JsonValue,     // numbers/strings/bools/arrays/null
}

// ---- helpers ----

fn json_to_simple(val: &JsonValue) -> SimpleExpr {
    match val {
        JsonValue::Null => Expr::val(Option::<i32>::None).into(),
        JsonValue::Bool(b) => Expr::val(*b).into(),
        JsonValue::Number(n) => {
            if let Some(i) = n.as_i64() { Expr::val(i).into() }
            else if let Some(u) = n.as_u64() { Expr::val(u as i64).into() } // sqlxはi64で受けやすい
            else if let Some(f) = n.as_f64() { Expr::val(f).into() }
            else { Expr::val(Option::<i32>::None).into() }
        }
        JsonValue::String(s) => Expr::val(s.as_str()).into(),
        JsonValue::Array(_) | JsonValue::Object(_) => {
            // 複合は基本的にWHEREの in/not_in 等で個別処理、単体ではJSON文字列として渡す
            Expr::val(val.to_string()).into()
        }
    }
}

fn json_array_to_simples(vals: &JsonValue) -> Vec<SimpleExpr> {
    match vals {
        JsonValue::Array(arr) => arr.iter().map(json_to_simple).collect(),
        other => vec![json_to_simple(other)],
    }
}

// ---- builders ----

pub fn build_select(spec: &SelectSpec, dialect: Dialect) -> (String, SqlxValues) {
    let mut stmt = Query::select();

    // columns
    if spec.columns.is_empty() {
        stmt.expr(Expr::cust("*"));
    } else {
        for c in &spec.columns {
            stmt.column((Alias::new(&spec.table), Alias::new(c)));
        }
    }

    stmt.from(Alias::new(&spec.table));

    // filters
    for cond in &spec.filters {
        let col = Expr::col((Alias::new(&spec.table), Alias::new(&cond.column)));
        let expr = match cond.op.as_str() {
            "="  => col.eq(json_to_simple(&cond.value)),
            "!=" => col.ne(json_to_simple(&cond.value)),
            ">"  => col.gt(json_to_simple(&cond.value)),
            ">=" => col.gte(json_to_simple(&cond.value)),
            "<"  => col.lt(json_to_simple(&cond.value)),
            "<=" => col.lte(json_to_simple(&cond.value)),
            "like" => col.like(cond.value.as_str().unwrap_or_default()),
            "not_like" => col.not_like(cond.value.as_str().unwrap_or_default()),
            "is_null" => col.is_null(),
            "is_not_null" => col.is_not_null(),
            "in" => col.is_in(json_array_to_simples(&cond.value)),
            "not_in" => col.is_not_in(json_array_to_simples(&cond.value)),
            _ => col.eq(json_to_simple(&cond.value)),
        };
        stmt.and_where(expr);
    }

    // sort
    if let Some((col, asc)) = &spec.sort {
        stmt.order_by(
            (Alias::new(&spec.table), Alias::new(col)),
            if *asc { Order::Asc } else { Order::Desc },
        );
    }

    if let Some(lim) = spec.limit { stmt.limit(lim); }
    if let Some(off) = spec.offset { stmt.offset(off); }

    match dialect {
        Dialect::Postgres => stmt.build_sqlx(PostgresQueryBuilder),
        Dialect::MySql    => stmt.build_sqlx(MysqlQueryBuilder),
        Dialect::Sqlite   => stmt.build_sqlx(SqliteQueryBuilder),
    }
}

// ---------- INSERT / UPDATE / DELETE ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsertSpec {
    pub table: String,
    pub values: Vec<(String, JsonValue)>, // column -> value
}

pub fn build_insert(spec: &InsertSpec, dialect: Dialect) -> (String, SqlxValues) {
    let mut stmt = sea_query::Query::insert();
    stmt.into_table(Alias::new(&spec.table));

    let cols: Vec<_> = spec.values.iter().map(|(c, _)| Alias::new(c)).collect();
    let vals: Vec<SimpleExpr> = spec.values.iter().map(|(_, v)| json_to_simple(v)).collect();

    stmt.columns(cols).values_panic(vals);

    match dialect {
        Dialect::Postgres => stmt.build_sqlx(PostgresQueryBuilder),
        Dialect::MySql    => stmt.build_sqlx(MysqlQueryBuilder),
        Dialect::Sqlite   => stmt.build_sqlx(SqliteQueryBuilder),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateSpec {
    pub table: String,
    pub values: Vec<(String, JsonValue)>, // column -> value
    pub filters: Vec<FilterCond>,
}

pub fn build_update(spec: &UpdateSpec, dialect: Dialect) -> (String, SqlxValues) {
    let mut stmt = sea_query::Query::update();
    stmt.table(Alias::new(&spec.table));

    for (c, v) in &spec.values {
        stmt.value(Alias::new(c), json_to_simple(v));
    }

    for cond in &spec.filters {
        let col = Expr::col((Alias::new(&spec.table), Alias::new(&cond.column)));
        let expr = match cond.op.as_str() {
            "="  => col.eq(json_to_simple(&cond.value)),
            "!=" => col.ne(json_to_simple(&cond.value)),
            _    => col.eq(json_to_simple(&cond.value)),
        };
        stmt.and_where(expr);
    }

    match dialect {
        Dialect::Postgres => stmt.build_sqlx(PostgresQueryBuilder),
        Dialect::MySql    => stmt.build_sqlx(MysqlQueryBuilder),
        Dialect::Sqlite   => stmt.build_sqlx(SqliteQueryBuilder),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteSpec {
    pub table: String,
    pub filters: Vec<FilterCond>,
}

pub fn build_delete(spec: &DeleteSpec, dialect: Dialect) -> (String, SqlxValues) {
    let mut stmt = sea_query::Query::delete();
    stmt.from_table(Alias::new(&spec.table));

    for cond in &spec.filters {
        let col = Expr::col((Alias::new(&spec.table), Alias::new(&cond.column)));
        let expr = match cond.op.as_str() {
            "="  => col.eq(json_to_simple(&cond.value)),
            "!=" => col.ne(json_to_simple(&cond.value)),
            _    => col.eq(json_to_simple(&cond.value)),
        };
        stmt.and_where(expr);
    }

    match dialect {
        Dialect::Postgres => stmt.build_sqlx(PostgresQueryBuilder),
        Dialect::MySql    => stmt.build_sqlx(MysqlQueryBuilder),
        Dialect::Sqlite   => stmt.build_sqlx(SqliteQueryBuilder),
    }
}