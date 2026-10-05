// Direct PostgreSQL data layer for on-prem deployment.
// Activated only when DATABASE_URL is set (see admin() in auth.server.ts);
// otherwise the app keeps using its managed cloud database.
// Implements the same subset of the Supabase query builder the app uses,
// so no caller code changes.
import { Pool, types as pgTypes } from "pg";

// Match cloud-database serialization: dates arrive as ISO strings, date-only
// columns stay plain "YYYY-MM-DD" strings (no timezone drift).
pgTypes.setTypeParser(1082, (v) => v); // date
pgTypes.setTypeParser(1114, (v) => v); // timestamp without time zone
pgTypes.setTypeParser(1184, (v) => new Date(v).toISOString()); // timestamptz
pgTypes.setTypeParser(1700, (v) => v); // numeric

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Columns whose value is a JSON array/object (jsonb), not a Postgres array. */
const JSONB_COLS = new Set(["people.assessed_skills", "roles.skills"]);

export type PgResult = {
  data: any;
  error: { message: string; code?: string | undefined } | null;
  count: number | null;
};

let pool: Pool | undefined;
function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    pool = new Pool({ connectionString: url, max: 5 });
  }
  return pool;
}

function ident(name: string, what: string) {
  if (!IDENT.test(name)) throw new Error(`Unsafe ${what}: ${name}`);
  return name;
}

function selectList(columns: string) {
  return columns
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => ident(c, "column"))
    .join(", ");
}

/** Serialize a JS value for a bind parameter, adding a cast when required. */
function serialize(table: string, column: string, value: unknown): { text: string; value: unknown } {
  if (value === null || value === undefined) return { text: "NULL", value: undefined };
  if (value instanceof Date) return { text: `$`, value: value.toISOString() };
  if (typeof value === "object") {
    if (Array.isArray(value)) {
      if (JSONB_COLS.has(`${table}.${column}`)) return { text: "$::jsonb", value: JSON.stringify(value) };
      return { text: "$", value };
    }
    return { text: "$::jsonb", value: JSON.stringify(value) };
  }
  return { text: "$", value };
}

type Filter = { m: string; args: unknown[] };

class Builder implements PromiseLike<PgResult> {
  private table: string;
  private op: "select" | "insert" | "update" | "delete" | "upsert";
  private filters: Filter[] = [];
  private orders: { col: string; opts?: { ascending?: boolean; nullsFirst?: boolean } }[] = [];
  private limitN?: number;
  private single?: "single" | "maybe";
  private columns = "*";
  private selectOpts?: { count?: string; head?: boolean };
  private payload?: unknown;
  private upsertOpts?: { onConflict?: string; ignoreDuplicates?: boolean };

  constructor(table: string, op: Builder["op"]) {
    this.table = table;
    this.op = op;
  }

  select(columns: string | unknown = "*", opts?: Builder["selectOpts"]) {
    if (this.op === "select") {
      this.columns = typeof columns === "string" ? columns : "*";
      this.selectOpts = opts;
    } else {
      this.columns = typeof columns === "string" ? columns : "*";
    }
    return this;
  }
  insert(payload: unknown) { this.op = "insert"; this.payload = payload; return this; }
  upsert(payload: unknown, opts?: Builder["upsertOpts"]) { this.op = "upsert"; this.payload = payload; this.upsertOpts = opts; return this; }
  update(payload: unknown) { this.op = "update"; this.payload = payload; return this; }
  delete() { this.op = "delete"; return this; }

  private f(m: string, args: unknown[]) { this.filters.push({ m, args }); return this; }
  eq(c: string, v: unknown) { return this.f("eq", [c, v]); }
  neq(c: string, v: unknown) { return this.f("neq", [c, v]); }
  gt(c: string, v: unknown) { return this.f("gt", [c, v]); }
  gte(c: string, v: unknown) { return this.f("gte", [c, v]); }
  lt(c: string, v: unknown) { return this.f("lt", [c, v]); }
  lte(c: string, v: unknown) { return this.f("lte", [c, v]); }
  in(c: string, v: readonly unknown[]) { return this.f("in", [c, v]); }
  is(c: string, v: unknown) { return this.f("is", [c, v]); }
  like(c: string, v: string) { return this.f("like", [c, v]); }
  ilike(c: string, v: string) { return this.f("ilike", [c, v]); }
  contains(c: string, v: unknown) { return this.f("contains", [c, v]); }
  not(c: string, op: string, v: unknown) { return this.f("not", [c, op, v]); }
  or(expr: string) { return this.f("or", [expr]); }
  match(obj: Record<string, unknown>) { return this.f("match", [obj]); }
  filter(c: string, op: string, v: unknown) { return this.f(op, [c, v]); }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) { this.orders.push({ col, opts }); return this; }
  limit(n: number) { this.limitN = n; return this; }
  single() { this.single = "single"; return this; }
  maybeSingle() { this.single = "maybe"; return this; }

  then<A, B>(
    onok?: ((v: PgResult) => A | PromiseLike<A>) | null,
    onerr?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    const run = this.exec().catch(
      (e: unknown): PgResult => ({
        data: null,
        error: { message: e instanceof Error ? e.message : String(e), code: (e as { code?: string })?.code },
        count: null,
      }),
    );
    return run.then(onok, onerr);
  }

  private async exec(): Promise<PgResult> {
    const db = getPool();
    const t = ident(this.table, "table");

    // Build WHERE clause.
    let where = "";
    const params: unknown[] = [];
    const addParam = (v: unknown): string => {
      params.push(v);
      return `$${params.length}`;
    };
    const cmpOp = (m: string) =>
      ({ eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "LIKE", ilike: "ILIKE" })[m];
    const conds: string[] = [];
    for (const fl of this.filters) {
      const [col] = fl.args as [string, ...unknown[]];
      const c = ident(col, "column");
      if (fl.m === "eq" || fl.m === "neq" || fl.m === "gt" || fl.m === "gte" || fl.m === "lt" || fl.m === "lte" || fl.m === "like" || fl.m === "ilike") {
        const v = fl.args[1];
        if (v === undefined) continue;
        if (v === null) { conds.push(fl.m === "eq" ? `${c} IS NULL` : `${c} IS NOT NULL`); continue; }
        const s = serialize(this.table, c, v);
        const ph = s.text === "$" ? addParam(s.value) : `${addParam(s.value)}${s.text.slice(1)}`;
        conds.push(`${c} ${cmpOp(fl.m)} ${ph}`);
      } else if (fl.m === "in") {
        const arr = (fl.args[1] ?? []) as unknown[];
        if (!arr.length) { conds.push("FALSE"); continue; }
        const ph = arr.map((v) => addParam(v)).join(", ");
        conds.push(`${c} IN (${ph})`);
      } else if (fl.m === "is") {
        conds.push(`${c} IS ${fl.args[1] === null ? "NULL" : String(fl.args[1])}`);
      } else if (fl.m === "contains") {
        const v = fl.args[1];
        const s = serialize(this.table, c, v);
        const ph = s.text === "$" ? addParam(s.value) : `${addParam(s.value)}${s.text.slice(1)}`;
        conds.push(`${c}::jsonb @> ${ph}`);
      } else if (fl.m === "not") {
        const op = fl.args[1] as string;
        const inner = cmpOp(op) ?? "=";
        const s = serialize(this.table, c, fl.args[2]);
        const ph = s.text === "$" ? addParam(s.value) : `${addParam(s.value)}${s.text.slice(1)}`;
        conds.push(`NOT (${c} ${inner} ${ph})`);
      } else if (fl.m === "match") {
        const obj = fl.args[0] as Record<string, unknown>;
        for (const [k, v] of Object.entries(obj)) {
          const key = ident(k, "column");
          const s = serialize(this.table, key, v);
          const ph = s.text === "$" ? addParam(s.value) : `${addParam(s.value)}${s.text.slice(1)}`;
          conds.push(`${key} = ${ph}`);
        }
      } else if (fl.m === "or") {
        const parts = String(fl.args[0]).split(",").map((p) => p.trim()).filter(Boolean);
        const ors: string[] = [];
        for (const p of parts) {
          const m = p.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.(eq|neq|gt|gte|lt|lte|like|ilike|is)\.(.+)$/);
          if (!m) throw new Error(`Unsupported or() expression: ${p}`);
          const key = ident(m[1], "column");
          const raw = m[3];
          if (m[2] === "is") { ors.push(`${key} IS ${raw === "null" ? "NULL" : raw.toUpperCase()}`); continue; }
          ors.push(`${key} ${cmpOp(m[2])} ${addParam(raw)}`);
        }
        if (ors.length) conds.push(`(${ors.join(" OR ")})`);
      }
    }
    if (conds.length) where = ` WHERE ${conds.join(" AND ")}`;

    const orderSql = this.orders.length
      ? ` ORDER BY ${this.orders
          .map(({ col, opts }) => {
            const c = ident(col, "column");
            const dir = opts?.ascending === false ? "DESC" : "ASC";
            const nulls = opts?.nullsFirst === true ? "NULLS FIRST" : opts?.nullsFirst === false ? "NULLS LAST" : "";
            return `${c} ${dir}${nulls ? " " + nulls : ""}`;
          })
          .join(", ")}`
      : "";

    // Read path.
    if (this.op === "select") {
      const cols = this.columns === "*" ? "*" : selectList(this.columns);
      const wantsCount = this.selectOpts?.count === "exact" || this.selectOpts?.count === "planned";
      let count: number | null = null;
      if (wantsCount) {
        const cRes = await db.query(`SELECT count(*)::int AS n FROM ${t}${where}`, params);
        count = cRes.rows[0]?.n ?? 0;
        if (this.selectOpts?.head) return { data: null, error: null, count };
      }
      const limitSql = this.limitN ? ` LIMIT ${Math.floor(this.limitN)}` : "";
      const res = await db.query(`SELECT ${cols} FROM ${t}${where}${orderSql}${limitSql}`, params);
      let data: any = res.rows;
      if (this.single === "single") {
        if (!data.length) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" }, count };
        data = data[0];
      } else if (this.single === "maybe") {
        if (data.length > 1) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" }, count };
        data = data[0] ?? null;
      }
      return { data, error: null, count };
    }

    // Write path.
    const returning = ` RETURNING ${this.columns === "*" ? "*" : selectList(this.columns)}`;
    if (this.op === "insert" || this.op === "upsert") {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).filter(
        (r) => r && typeof r === "object",
      ) as Record<string, unknown>[];
      if (!rows.length) return { data: [], error: null, count: null };
      const conflictCols = (this.upsertOpts?.onConflict ?? "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      const colSets: string[][] = [];
      const allParams: unknown[] = [];
      const valueRows: string[] = [];
      for (const row of rows) {
        const keys = Object.keys(row).filter((k) => row[k] !== undefined);
        colSets.push(keys);
        const placeholders = keys.map((k) => {
          ident(k, "column");
          const s = serialize(this.table, k, row[k]);
          if (s.text === "$") return addParamShared(allParams, s.value);
          return `${addParamShared(allParams, s.value)}${s.text.slice(1)}`;
        });
        valueRows.push(`(${placeholders.join(", ")})`);
      }
      const cols = colSets[0];
      if (colSets.some((k) => k.join(",") !== cols.join(","))) throw new Error("All inserted rows must have the same columns");
      const colsSql = cols.join(", ");
      let sql = `INSERT INTO ${t} (${colsSql}) VALUES ${valueRows.join(", ")}`;
      if (this.op === "upsert") {
        if (conflictCols.length) {
          const conflictSql = conflictCols.map((c) => ident(c, "column")).join(", ");
          if (this.upsertOpts?.ignoreDuplicates) sql += ` ON CONFLICT (${conflictSql}) DO NOTHING`;
          else {
            const updates = cols
              .filter((c) => !conflictCols.includes(c))
              .map((c) => `${c} = EXCLUDED.${c}`)
              .join(", ");
            sql += ` ON CONFLICT (${conflictSql}) DO UPDATE SET ${updates}`;
          }
        } else sql += ` ON CONFLICT DO NOTHING`;
      }
      const res = await db.query(sql + returning, allParams);
      let data: any = res.rows;
      if (this.single === "single" && data.length) data = data[0];
      else if (this.single === "maybe") data = data[0] ?? null;
      return { data, error: null, count: null };
    }

    if (this.op === "update") {
      const row = (this.payload ?? {}) as Record<string, unknown>;
      const keys = Object.keys(row).filter((k) => row[k] !== undefined);
      if (!keys.length) return { data: [], error: null, count: null };
      const sets = keys
        .map((k) => {
          ident(k, "column");
          const s = serialize(this.table, k, row[k]);
          return `${k} = ${s.text === "$" ? addParam(s.value) : `${addParam(s.value)}${s.text.slice(1)}`}`;
        })
        .join(", ");
      const res = await db.query(`UPDATE ${t} SET ${sets}${where}${returning}`, params);
      let data: any = res.rows;
      if (this.single === "maybe") data = data[0] ?? null;
      return { data, error: null, count: null };
    }

    // delete
    const res = await db.query(`DELETE FROM ${t}${where}${returning}`, params);
    return { data: res.rows, error: null, count: null };
  }
}

function addParamShared(arr: unknown[], v: unknown) {
  arr.push(v);
  return `$${arr.length}`;
}

/** Query-builder client with the same shape the app's server code already uses. */
export function pgAdmin() {
  return {
    from: (table: string) => new Builder(table, "select"),
  };
}
