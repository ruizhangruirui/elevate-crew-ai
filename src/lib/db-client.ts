// Browser-side query builder with the same shape as the subset of the
// Supabase client the app uses. Every query is executed by the `dbQuery`
// server function, which checks the signed-in user's session and role.
import { dbQuery, type DbResult, type DbSpec } from "./db.functions";

type Filter = DbSpec["filters"][number];

class Query implements PromiseLike<DbResult> {
  private spec: DbSpec;
  constructor(table: string) {
    this.spec = { table: table as DbSpec["table"], op: "select", filters: [], order: [] };
  }
  select(columns = "*", opts?: DbSpec["selectOpts"]) {
    if (this.spec.op === "select") {
      this.spec.columns = columns;
      this.spec.selectOpts = opts;
    } else this.spec.returning = columns;
    return this;
  }
  insert(payload: unknown) {
    this.spec.op = "insert";
    this.spec.payload = payload;
    return this;
  }
  upsert(payload: unknown, opts?: DbSpec["upsertOpts"]) {
    this.spec.op = "upsert";
    this.spec.payload = payload;
    this.spec.upsertOpts = opts;
    return this;
  }
  update(payload: unknown) {
    this.spec.op = "update";
    this.spec.payload = payload;
    return this;
  }
  delete() {
    this.spec.op = "delete";
    return this;
  }
  private f(m: Filter["m"], args: unknown[]) {
    this.spec.filters.push({ m, args });
    return this;
  }
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
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.spec.order.push({ col, opts });
    return this;
  }
  limit(n: number) {
    this.spec.limit = n;
    return this;
  }
  single() {
    this.spec.single = "single";
    return this;
  }
  maybeSingle() {
    this.spec.single = "maybe";
    return this;
  }
  then<A = DbResult, B = never>(
    onok?: ((v: DbResult) => A | PromiseLike<A>) | null,
    onerr?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    const run = (dbQuery({ data: this.spec }) as Promise<DbResult>).catch(
      (e: unknown): DbResult => ({
        data: null,
        error: { message: e instanceof Error ? e.message : String(e) },
        count: null,
      }),
    );
    return run.then(onok, onerr);
  }
}

export const db = {
  from: (table: string) => new Query(table),
};
