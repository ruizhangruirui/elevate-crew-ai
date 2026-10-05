// Direct PostgreSQL data layer for on-prem deployment.
// Activated only when DATABASE_URL is set (see admin() in auth.server.ts);
// otherwise the app keeps using its managed cloud database.
// Implements the same subset of the Supabase query builder the app uses,
// so no caller code changes.
import { Pool, types as pgTypes } from "pg";

// Match cloud-database serialization: timestamps arrive as ISO strings,
// date-only columns stay plain "YYYY-MM-DD" strings (no timezone drift).
pgTypes.setTypeParser(1082, (v: string) => v); // date
pgTypes.setTypeParser(1114, (v: string) => v); // timestamp without time zone
pgTypes.setTypeParser(1184, (v: string) => new Date(v).toISOString()); // timestamptz
pgTypes.setTypeParser(1700, (v: string) => v); // numeric

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
    const url = process.env["DATABASE_URL"];
    if (!url) throw new Error("DATABASE_URL is not set");
    // Internal deployments usually run plain local PostgreSQL; SSL only when
    // the connection string explicitly asks for it (sslmode=require or higher).
    const wantsSsl = /sslmode=(require|verify-ca|verify-full)/.test(url);
    pool = new Pool({ connectionString: url, max: 5, ssl: wantsSsl ? { rejectUnauthorized: false } : false });
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
  if (value instanceof Date) return { text: "$", value: value.toISOString() };
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
type OrderOpts = { ascending?: boolean; nullsFirst?: boolean } | undefined;
type CountOpts = { count?: "exact" | "planned" | "estimated"; head?: boolean } | undefined;
type UpsertOpts = { onConflict?: string; ignoreDuplicates?: boolean } | undefined;

const CMP_OPS: Record<string, string> = {
  eq: "=",
  neq: "<>",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  like: "LIKE",
  ilike: "ILIKE",
};

function addParam(arr: unknown[], v: unknown) {
  arr.push(v);
  return `$${arr.length}`;
}

class Builder implements PromiseLike<PgResult> {
  private table: string;
  private op: "select" | "insert" | "update" | "delete" | "upsert";
  private filters: Filter[] = [];
  private orders: { col: string; opts?: OrderOpts }[] = [];
  private limitN?: number;
  private singleMode?: "single" | "maybe";
  private columns = "*";
  private selectOpts?: CountOpts;
  private payload?: unknown;
  private upsertOpts?: UpsertOpts;

  constructor(table: string, op: Builder["op"]) {
    this.table = table;
    this.op = op;
  }

  select(columns: string | unknown = "*", opts?: CountOpts) {
    if (this.op === "select") {
      this.columns = typeof columns === "string" ? columns : "*";
      this.selectOpts = opts;
    } else {
      this.columns = typeof columns === "string" ? columns : "*";
    }
    return this;
  }
  insert(payload: unknown) { this.op = "insert"; this.payload = payload; return this; }
  upsert(payload: unknown, opts?: UpsertOpts) { this.op = "upsert"; this.payload = payload; this.upsertOpts = opts; return this; }
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
  order(col: string, opts?: OrderOpts) { this.orders.push({ col, opts }); return this; }
  limit(n: number) { this.limitN = n; return this; }
  single() { this.singleMode = "single"; return this; }
  maybeSingle() { this.singleMode = "maybe"; return this; }

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
    const params: unknown[] = [];
    const ph = (table: string, col: string, v: unknown): string => {
      if (v === null || v === undefined) return "NULL";
      const s = serialize(table, col, v);
      return s.text === "$" ? addParam(params, s.value) : `${addParam(params, s.value)}${s.text.slice(1)}`;
    };
    const conds: string[] = [];
    for (const fl of this.filters) {
      const [col] = fl.args as [string, ...unknown[]];
      // "or"/"match" carry expressions/objects rather than a plain column name.
      const c = fl.m === "or" || fl.m === "match" ? "" : ident(col, "column");
      if (CMP_OPS[fl.m]) {
        const v = fl.args[1];
        if (v === undefined) continue;
        if (v === null) {
          conds.push(fl.m === "eq" ? `${c} IS NULL` : `${c} IS NOT NULL`);
        } else {
          conds.push(`${c} ${CMP_OPS[fl.m]} ${ph(this.table, c, v)}`);
        }
      } else if (fl.m === "in") {
        const arr = (fl.args[1] ?? []) as unknown[];
        if (!arr.length) conds.push("FALSE");
        else conds.push(`${c} IN (${arr.map((v) => addParam(params, v)).join(", ")})`);
      } else if (fl.m === "is") {
        conds.push(`${c} IS ${fl.args[1] === null ? "NULL" : String(fl.args[1]).toUpperCase()}`);
      } else if (fl.m === "contains") {
        // text[] columns become JSON via array_to_json; jsonb columns compare directly.
        const jsonParam = JSON.stringify(fl.args[1] ?? null);
        if (JSONB_COLS.has(`${this.table}.${col}`)) conds.push(`${c} @> ${addParam(params, jsonParam)}::jsonb`);
        else conds.push(`array_to_json(${c})::jsonb @> ${addParam(params, jsonParam)}::jsonb`);
      } else if (fl.m === "not") {
        const op = fl.args[1] as string;
        conds.push(`NOT (${c} ${CMP_OPS[op] ?? "="} ${ph(this.table, c, fl.args[2])})`);
      } else if (fl.m === "match") {
        const obj = fl.args[0] as Record<string, unknown>;
        for (const [k, v] of Object.entries(obj)) {
          conds.push(`${ident(k, "column")} = ${ph(this.table, k, v)}`);
        }
      } else if (fl.m === "or") {
        const parts = String(fl.args[0]).split(",").map((p) => p.trim()).filter(Boolean);
        const ors: string[] = [];
        for (const p of parts) {
          const m = p.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.(eq|neq|gt|gte|lt|lte|like|ilike|is)\.(.+)$/);
          if (!m || !m[1] || !m[2] || !m[3]) throw new Error(`Unsupported or() expression: ${p}`);
          const key = ident(m[1], "column");
          if (m[2] === "is") {
            ors.push(`${key} IS ${m[3] === "null" ? "NULL" : m[3].toUpperCase()}`);
          } else {
            ors.push(`${key} ${CMP_OPS[m[2]]} ${addParam(params, m[3])}`);
          }
        }
        if (ors.length) conds.push(`(${ors.join(" OR ")})`);
      }
    }
    const where = conds.length ? ` WHERE ${conds.join(" AND ")}` : "";

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
      if (this.singleMode === "single") {
        if (!data.length) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" }, count };
        data = data[0];
      } else if (this.singleMode === "maybe") {
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
      const writeParams: unknown[] = [];
      const addW = (v: unknown) => {
        writeParams.push(v);
        return `$${writeParams.length}`;
      };
      const phW = (col: string, v: unknown): string => {
        if (v === null || v === undefined) return "NULL";
        const s = serialize(this.table, col, v);
        return s.text === "$" ? addW(s.value) : `${addW(s.value)}${s.text.slice(1)}`;
      };
      const colSets: string[][] = [];
      const valueRows: string[] = [];
      for (const row of rows) {
        const keys = Object.keys(row).filter((k) => row[k] !== undefined);
        colSets.push(keys);
        const placeholders = keys.map((k) => {
          ident(k, "column");
          return phW(k, row[k]);
        });
        valueRows.push(`(${placeholders.join(", ")})`);
      }
      const cols = colSets[0] ?? [];
      if (!cols.length || colSets.some((k) => k.join(",") !== cols.join(",")))
        throw new Error("All inserted rows must have the same columns");
      let sql = `INSERT INTO ${t} (${cols.join(", ")}) VALUES ${valueRows.join(", ")}`;
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
        } else {
          sql += ` ON CONFLICT DO NOTHING`;
        }
      }
      try {
        return await this.finishWrite(db, sql, writeParams);
      } catch (e) {
        // Cloud uses expression unique indexes (e.g. COALESCE over a nullable key)
        // that plain `ON CONFLICT (cols)` cannot match. Fall back to a manual,
        // NULL-safe upsert using IS NOT DISTINCT FROM.
        if (this.op !== "upsert" || !conflictCols.length || (e as { code?: string })?.code !== "42P10") throw e;
        return this.manualUpsert(db, rows, cols);
      }
    }

    if (this.op === "update") {
      const row = (this.payload ?? {}) as Record<string, unknown>;
      const keys = Object.keys(row).filter((k) => row[k] !== undefined);
      if (!keys.length) return { data: [], error: null, count: null };
      const sets = keys.map((k) => `${ident(k, "column")} = ${ph(this.table, k, row[k])}`).join(", ");
      const res = await db.query(`UPDATE ${t} SET ${sets}${where}${returning}`, params);
      let data: any = res.rows;
      if (this.singleMode === "maybe") data = data[0] ?? null;
      return { data, error: null, count: null };
    }

    // delete
    const res = await db.query(`DELETE FROM ${t}${where}${returning}`, params);
    return { data: res.rows, error: null, count: null };
  }

  private applySingle(data: any[]): any {
    if (this.singleMode === "single") return data.length ? data[0] : { error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" }, data: null, count: null };
    if (this.singleMode === "maybe") return data[0] ?? null;
    return data;
  }

  private serializeParam(col: string, v: unknown): string {
    const s = serialize(this.table, col, v);
    this.mParams!.push(s.text === "$" ? s.value : JSON.stringify(v));
    return `$${this.mParams!.length}${s.text.slice(1)}`;
  }

  private mParams: unknown[] | null = null;

  private ndfWhere(row: Record<string, unknown>, cols: string[]): string {
    return cols
      .map((c) => {
        ident(c, "column");
        const v = row[c];
        return v === null || v === undefined ? `${c} IS NULL` : `${c} IS NOT DISTINCT FROM ${this.serializeParam(c, v)}`;
      })
      .join(" AND ");
  }

  /** Fallback upsert: NULL-safe match via IS NOT DISTINCT FROM, then UPDATE or INSERT. */
  private async manualUpsert(db: any, rows: Record<string, unknown>[], _cols: string[]): Promise<PgResult> {
    const conflictCols = (this.upsertOpts?.onConflict ?? "").split(",").map((c) => c.trim()).filter(Boolean);
    const t = ident(this.table, "table");
    const data: any[] = [];
    for (const row of rows) {
      this.mParams = [];
      const ndf = this.ndfWhere(row, conflictCols);
      const params = this.mParams;
      const ex = await db.query(`SELECT EXISTS(SELECT 1 FROM ${t} WHERE ${ndf}) AS found`, params);
      if (ex.rows[0]?.found) {
        if (this.upsertOpts?.ignoreDuplicates) continue;
        const updCols = Object.keys(row).filter((k) => row[k] !== undefined && !conflictCols.includes(k));
        if (!updCols.length) continue;
        this.mParams = [];
        const ndf2 = this.ndfWhere(row, conflictCols);
        const sets = updCols.map((k) => `${ident(k, "column")} = ${this.serializeParam(k, row[k])}`).join(", ");
        const res = await db.query(`UPDATE ${t} SET ${sets} WHERE ${ndf2}${returningOf(this)}`, params!);
        data.push(...res.rows);
      } else {
        this.mParams = [];
        const keys = Object.keys(row).filter((k) => row[k] !== undefined);
        const values = keys.map((k) => {
          ident(k, "column");
          return this.serializeParam(k, row[k]);
        });
        const res = await db.query(`INSERT INTO ${t} (${keys.join(", ")}) VALUES (${values.join(", ")})${returningOf(this)}`, this.mParams);
        data.push(...res.rows);
      }
    }
    return { data: this.applySingle(data), error: null, count: null };
  }
}

function returningOf(b: Builder): string {
  const cols = (b as unknown as { columns: string }).columns;
  return ` RETURNING ${cols === "*" ? "*" : selectList(cols)}`;
}

/** Query-builder client with the same call surface the app's server code already uses. */
export function pgAdmin() {
  return {
    from: (table: string) => new Builder(table, "select"),
  };
}
