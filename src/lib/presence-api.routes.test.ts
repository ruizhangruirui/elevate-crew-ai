// Route-level integration tests for the Presence Board read-only API.
// Exercises the full HTTP path of respondPresence (auth → rate limit → load
// → allowlist projection → snapshot/pagination → response) with an injected
// synthetic data loader. No real employee data, no real database.
import { afterEach, beforeEach, describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import {
  buildEmployees,
  buildManagers,
  buildOrganization,
  createRateLimiter,
  loadPresenceRows,
  presenceVersion,
  respondPresence,
  PRESENCE_KEY_HEADER,
  type PresenceDeps,
} from "./presence-api.server";

const TEST_KEY = "phase1-1-synthetic-test-key";

// --- Synthetic fixtures (no real people) -----------------------------------

const NODES = [
  { id: "lab-1", parent_id: null, name: "Synthetic Lab", type: "lab", archived: false, updated_at: "2026-01-01T00:00:00.000Z" },
  { id: "team-1", parent_id: "lab-1", name: "Synthetic Team", type: "team", archived: false, updated_at: "2026-01-02T00:00:00.000Z" },
  { id: "team-old", parent_id: "lab-1", name: "Archived Team", type: "team", archived: true, updated_at: "2026-01-03T00:00:00.000Z" },
];

const PEOPLE = [
  // Team lead of team-1 (inferred supervisor for team members)
  { id: "p-lead", name: "Lead Person", org_node_id: "team-1", supervisor_id: null, is_leader: true, archived: false, status: "active", company_email: "lead@example.test", updated_at: "2026-02-01T00:00:00.000Z" },
  // Member with inferred supervisor (the team lead)
  { id: "p-member", name: "Member Person", org_node_id: "team-1", supervisor_id: null, is_leader: false, archived: false, status: "active", company_email: "member@example.test", updated_at: "2026-02-02T00:00:00.000Z" },
  // Member with explicit supervisor override pointing at the lead
  { id: "p-explicit", name: "Explicit Person", org_node_id: null, supervisor_id: "p-lead", is_leader: false, archived: false, status: "active", company_email: null, updated_at: "2026-02-03T00:00:00.000Z" },
  // Archived employee — must remain visible with archived=true
  { id: "p-archived", name: "Archived Person", org_node_id: "team-1", supervisor_id: null, is_leader: false, archived: true, status: "left", company_email: "old@example.test", updated_at: "2026-02-04T00:00:00.000Z" },
];

function makeDeps(overrides?: Partial<PresenceDeps>): PresenceDeps {
  return {
    loadRows: async () => ({ people: PEOPLE, nodes: NODES }),
    limiter: createRateLimiter(120, 60_000),
    ...overrides,
  };
}

// respondPresence passes the combined rows object; adapt the builders.
type Rows = { people: any[]; nodes: any[] };
const employeesBuild = (rows: Rows) => buildEmployees(rows.people, rows.nodes);
const orgBuild = (rows: Rows) => buildOrganization(rows.nodes);
const managersBuild = (rows: Rows) => buildManagers(rows.people, rows.nodes).map((m) => ({ ...m, updated_at: null }));

function req(path: string, key?: string): Request {
  const headers = new Headers({ "x-forwarded-for": `test-${Math.random()}` });
  if (key) headers.set(PRESENCE_KEY_HEADER, key);
  return new Request(`http://localhost${path}`, { headers });
}

async function json(res: Response) {
  return (await res.json()) as any;
}

beforeEach(() => {
  process.env["PRESENCE_API_KEY"] = TEST_KEY;
});

afterEach(() => {
  delete process.env["PRESENCE_API_KEY"];
});

describe("presence route handler — authentication", () => {
  it("rejects a missing API key with 401", async () => {
    const res = await respondPresence(req("/api/integrations/presence/employees"), "employees", employeesBuild, undefined, makeDeps());
    strictEqual(res.status, 401);
    ok(/invalid/i.test((await json(res)).error));
  });

  it("rejects an incorrect API key with 401", async () => {
    const res = await respondPresence(req("/api/integrations/presence/employees", "wrong-key"), "employees", employeesBuild, undefined, makeDeps());
    strictEqual(res.status, 401);
  });

  it("fails closed with 503 when the integration is not configured", async () => {
    delete process.env["PRESENCE_API_KEY"];
    const res = await respondPresence(req("/api/integrations/presence/employees", TEST_KEY), "employees", employeesBuild, undefined, makeDeps());
    strictEqual(res.status, 503);
  });

  it("accepts a valid API key and returns 200", async () => {
    const res = await respondPresence(req("/api/integrations/presence/employees", TEST_KEY), "employees", employeesBuild, undefined, makeDeps());
    strictEqual(res.status, 200);
    const body = await json(res);
    strictEqual(body.data.length, PEOPLE.length);
    strictEqual(body.sync_mode, "full-snapshot");
  });

  it("enforces rate limiting with 429", async () => {
    const deps = makeDeps({ limiter: createRateLimiter(2, 60_000) });
    const fixed = new Headers({ "x-forwarded-for": "fixed-ip", [PRESENCE_KEY_HEADER]: TEST_KEY });
    const mk = () => new Request("http://localhost/api/integrations/presence/employees", { headers: fixed });
    strictEqual((await respondPresence(mk(), "employees", employeesBuild, undefined, deps)).status, 200);
    strictEqual((await respondPresence(mk(), "employees", employeesBuild, undefined, deps)).status, 200);
    strictEqual((await respondPresence(mk(), "employees", employeesBuild, undefined, deps)).status, 429);
  });
});

describe("presence route handler — response shape", () => {
  it("returns exactly the allowlisted employee fields, nothing else", async () => {
    const res = await respondPresence(req("/api/integrations/presence/employees", TEST_KEY), "employees", employeesBuild, undefined, makeDeps());
    const body = await json(res);
    const expected = ["id", "name", "org_node_id", "supervisor_id", "is_leader", "archived", "status", "company_email", "updated_at"].sort();
    for (const row of body.data) {
      deepStrictEqual(Object.keys(row).sort(), expected);
    }
  });

  it("returns exactly the allowlisted organization fields", async () => {
    const res = await respondPresence(req("/api/integrations/presence/organization", TEST_KEY), "organization", orgBuild, undefined, makeDeps());
    const body = await json(res);
    const expected = ["id", "parent_id", "name", "node_type", "is_active", "updated_at"].sort();
    for (const row of body.data) {
      deepStrictEqual(Object.keys(row).sort(), expected);
    }
  });

  it("includes archived employees with archived=true", async () => {
    const res = await respondPresence(req("/api/integrations/presence/employees", TEST_KEY), "employees", employeesBuild, undefined, makeDeps());
    const body = await json(res);
    const archived = body.data.find((e: any) => e.id === "p-archived");
    ok(archived);
    strictEqual(archived.archived, true);
    strictEqual(archived.status, "left");
  });

  it("marks archived org nodes as inactive", async () => {
    const res = await respondPresence(req("/api/integrations/presence/organization", TEST_KEY), "organization", orgBuild, undefined, makeDeps());
    const body = await json(res);
    const old = body.data.find((n: any) => n.id === "team-old");
    strictEqual(old.is_active, false);
  });
});

describe("presence route handler — manager relationships", () => {
  it("resolves inferred and explicit supervisors like the main app", async () => {
    const res = await respondPresence(req("/api/integrations/presence/employees", TEST_KEY), "employees", employeesBuild, undefined, makeDeps());
    const body = await json(res);
    const member = body.data.find((e: any) => e.id === "p-member");
    const explicit = body.data.find((e: any) => e.id === "p-explicit");
    strictEqual(member.supervisor_id, "p-lead"); // inferred from team leadership
    strictEqual(explicit.supervisor_id, "p-lead"); // explicit override
  });

  it("reflects a manager change when the supervisor override moves", async () => {
    const moved = PEOPLE.map((p) => (p.id === "p-explicit" ? { ...p, supervisor_id: "p-member" } : p));
    const deps = makeDeps({ loadRows: async () => ({ people: moved, nodes: NODES }) });
    const res = await respondPresence(req("/api/integrations/presence/managers", TEST_KEY), "managers", managersBuild, undefined, deps);
    const body = await json(res);
    const newManager = body.data.find((m: any) => m.manager_id === "p-member");
    deepStrictEqual(
      newManager.direct_reports.find((d: any) => d.person_id === "p-explicit"),
      { person_id: "p-explicit", relationship: "explicit" },
    );
    const oldManager = body.data.find((m: any) => m.manager_id === "p-lead");
    strictEqual(oldManager.direct_reports.some((d: any) => d.person_id === "p-explicit"), false);
  });
});

describe("presence route handler — pagination and snapshots", () => {
  it("paginates deterministically without skips or duplicates", async () => {
    const deps = makeDeps();
    const seen = new Set<string>();
    let offset: number | null = 0;
    let snapshotId: string | null = null;
    while (offset !== null) {
      const asOf = snapshotId ? `&as_of=${encodeURIComponent(snapshotId)}` : "";
      const res = await respondPresence(
        req(`/api/integrations/presence/employees?limit=2&offset=${offset}${asOf}`, TEST_KEY),
        "employees",
        employeesBuild,
        undefined,
        deps,
      );
      const body = await json(res);
      strictEqual(res.status, 200);
      if (!snapshotId) snapshotId = body.snapshot.id;
      strictEqual(body.snapshot.id, snapshotId); // stable across pages
      for (const row of body.data) {
        strictEqual(seen.has(row.id), false); // no duplicates
        seen.add(row.id);
      }
      offset = body.page.next_offset;
    }
    strictEqual(seen.size, PEOPLE.length); // nothing skipped
  });

  it("rejects concurrent inserts instead of silently shifting pages", async () => {
    const deps = makeDeps();
    const page1 = await json(await respondPresence(req("/api/integrations/presence/employees?limit=2", TEST_KEY), "employees", employeesBuild, undefined, deps));
    const asOf: string = page1.snapshot.id;
    // Simulate a concurrent write: a new employee appears mid-snapshot.
    const grown = [...PEOPLE, { id: "p-new", name: "New Person", org_node_id: "team-1", supervisor_id: null, is_leader: false, archived: false, status: "active", company_email: null, updated_at: new Date(Date.now() + 60_000).toISOString() }];
    const deps2 = makeDeps({ loadRows: async () => ({ people: grown, nodes: NODES }) });
    const res = await respondPresence(req(`/api/integrations/presence/employees?limit=2&offset=2&as_of=${encodeURIComponent(asOf)}`, TEST_KEY), "employees", employeesBuild, undefined, deps2);
    strictEqual(res.status, 409);
    strictEqual((await json(res)).data, undefined);
  });

  it("rejects malformed as_of instead of silently starting a new version", async () => {
    const res = await respondPresence(req("/api/integrations/presence/employees?as_of=not-a-date", TEST_KEY), "employees", employeesBuild, undefined, makeDeps());
    const body = await json(res);
    strictEqual(res.status, 400);
    strictEqual(body.restart_required, true);
    strictEqual(body.data, undefined);
  });

  // Updating an ALREADY RETURNED employee used to shrink the result and skip
  // p-lead on page 2. Updating a not-yet-returned employee also lost that row.
  for (const id of ["p-archived", "p-member"]) {
    it(`rejects an existing employee update between pages (${id}) and restarts completely`, async () => {
      let current = PEOPLE.map((p) => ({ ...p }));
      const deps = makeDeps({ loadRows: async () => ({ people: current, nodes: NODES }) });
      const first = await json(await respondPresence(req("/api/integrations/presence/employees?limit=2", TEST_KEY), "employees", employeesBuild, undefined, deps));
      current = current.map((p) => p.id === id ? { ...p, name: "Updated synthetic name", updated_at: new Date(Date.now() + 60_000).toISOString() } : p);
      const res = await respondPresence(req(`/api/integrations/presence/employees?limit=2&offset=2&as_of=${first.snapshot.id}`, TEST_KEY), "employees", employeesBuild, undefined, deps);
      strictEqual(res.status, 409);
      const failure = await json(res);
      strictEqual(failure.data, undefined);
      strictEqual(failure.restart_required, true);
      // Restart includes every employee, even a timestamp ahead of the server clock.
      const restarted = await json(await respondPresence(req("/api/integrations/presence/employees?limit=2", TEST_KEY), "employees", employeesBuild, undefined, deps));
      const last = await json(await respondPresence(req(`/api/integrations/presence/employees?limit=2&offset=2&as_of=${restarted.snapshot.id}`, TEST_KEY), "employees", employeesBuild, undefined, deps));
      deepStrictEqual([...restarted.data, ...last.data].map((p: any) => p.id), ["p-archived", "p-explicit", "p-lead", "p-member"]);
      strictEqual([...restarted.data, ...last.data].find((p: any) => p.id === id).name, "Updated synthetic name");
    });
  }

  const mutations: { name: string; change: (rows: Rows) => Rows }[] = [
    { name: "employee archive", change: (r) => ({ ...r, people: r.people.map((p) => p.id === "p-member" ? { ...p, archived: true, status: "left" } : p) }) },
    { name: "physical deletion", change: (r) => ({ ...r, people: r.people.filter((p) => p.id !== "p-archived") }) },
    { name: "leader reassignment without member timestamp changes", change: (r) => ({ ...r, people: r.people.map((p) => ({ ...p, is_leader: p.id === "p-member" })) }) },
    { name: "explicit supervisor change", change: (r) => ({ ...r, people: r.people.map((p) => p.id === "p-explicit" ? { ...p, supervisor_id: "p-member" } : p) }) },
    { name: "organization parent change", change: (r) => ({ ...r, nodes: r.nodes.map((n) => n.id === "team-1" ? { ...n, parent_id: null } : n) }) },
    { name: "organization archive", change: (r) => ({ ...r, nodes: r.nodes.map((n) => n.id === "team-1" ? { ...n, archived: true } : n) }) },
    { name: "organization insert", change: (r) => ({ ...r, nodes: [...r.nodes, { ...NODES[0], id: "lab-new" }] }) },
  ];
  for (const mutation of mutations) {
    it(`invalidates every endpoint after ${mutation.name}`, async () => {
      const original = { people: PEOPLE, nodes: NODES };
      const first = await json(await respondPresence(req("/api/integrations/presence/employees?limit=2", TEST_KEY), "employees", employeesBuild, undefined, makeDeps()));
      const deps = makeDeps({ loadRows: async () => mutation.change(original) });
      for (const [endpoint, builder, opts] of [
        ["employees", employeesBuild, undefined], ["organization", orgBuild, undefined],
        ["managers", managersBuild, undefined], ["changes", employeesBuild, { incremental: true }],
      ] as const) {
        const response = await respondPresence(req(`/api/integrations/presence/${endpoint}?as_of=${first.snapshot.id}`, TEST_KEY), endpoint, builder, opts, deps);
        strictEqual(response.status, 409);
        strictEqual((await json(response)).data, undefined);
      }
    });
  }

  it("requires a version for nonzero offsets", async () => {
    const response = await respondPresence(req("/api/integrations/presence/employees?offset=2", TEST_KEY), "employees", employeesBuild, undefined, makeDeps());
    strictEqual(response.status, 400);
  });

  it("uses one version across employees, organization, managers and changes", async () => {
    const deps = makeDeps();
    const first = await json(await respondPresence(req("/api/integrations/presence/employees", TEST_KEY), "employees", employeesBuild, undefined, deps));
    for (const [endpoint, builder, opts] of [
      ["organization", orgBuild, undefined], ["managers", managersBuild, undefined],
      ["changes", employeesBuild, { incremental: true }],
    ] as const) {
      const res = await respondPresence(req(`/api/integrations/presence/${endpoint}?as_of=${first.snapshot.id}`, TEST_KEY), endpoint, builder, opts, deps);
      strictEqual(res.status, 200);
      strictEqual((await json(res)).snapshot.id, first.snapshot.id);
    }
  });

  it("canonicalizes source order and field order across adapters", async () => {
    const original = { people: PEOPLE, nodes: NODES };
    const reversed = { people: [...PEOPLE].reverse().map((p) => Object.fromEntries(Object.entries(p).reverse())), nodes: [...NODES].reverse() };
    strictEqual(await presenceVersion(original), await presenceVersion(reversed as Rows));
  });

  it("withholds incremental cursor until the last version-checked page", async () => {
    const deps = makeDeps();
    const first = await json(await respondPresence(req("/api/integrations/presence/changes?limit=2&since=2026-01-01", TEST_KEY), "changes", employeesBuild, { incremental: true }, deps));
    strictEqual(first.cursor, undefined);
    const last = await json(await respondPresence(req(`/api/integrations/presence/changes?limit=2&offset=2&since=2026-01-01&as_of=${first.snapshot.id}`, TEST_KEY), "changes", employeesBuild, { incremental: true }, deps));
    strictEqual(last.cursor, "2026-02-04T00:00:00.000Z");
  });

  it("sorts employees by id for deterministic snapshots", async () => {
    const res = await respondPresence(req("/api/integrations/presence/employees", TEST_KEY), "employees", employeesBuild, undefined, makeDeps());
    const body = await json(res);
    const ids = body.data.map((r: any) => r.id);
    deepStrictEqual(ids, [...ids].sort((a, b) => a.localeCompare(b)));
  });
});

describe("presence single-statement source loader", () => {
  it("loads over 1000 employees via one aggregate row and one SELECT", async () => {
    const people = Array.from({ length: 1501 }, (_, i) => ({ ...PEOPLE[0], id: `synthetic-${i}` }));
    const calls: string[] = [];
    const rows = await loadPresenceRows({ from: (table) => {
      calls.push(table);
      return { select: async (columns: string) => {
        calls.push(columns);
        return { data: [{ people, nodes: NODES }], error: null };
      } };
    } });
    deepStrictEqual(calls, ["presence_source_rows", "people,nodes"]);
    strictEqual(rows.people.length, 1501);
    deepStrictEqual(rows.nodes, NODES);
  });

  it("fails closed if the source view is missing without separate-read fallback", async () => {
    let calls = 0;
    const deps = makeDeps({ loadRows: () => loadPresenceRows({ from: () => {
      calls++;
      return { select: async () => ({ data: null, error: { message: "missing source view" } }) };
    } }) });
    const res = await respondPresence(req("/api/integrations/presence/employees", TEST_KEY), "employees", employeesBuild, undefined, deps);
    strictEqual(res.status, 500);
    strictEqual(calls, 1);
    strictEqual((await json(res)).data, undefined);
  });
});

describe("presence route handler — failure handling", () => {
  it("returns 500 and no data when the database read fails", async () => {
    const deps = makeDeps({ loadRows: async () => { throw new Error("connection refused"); } });
    const res = await respondPresence(req("/api/integrations/presence/employees", TEST_KEY), "employees", employeesBuild, undefined, deps);
    strictEqual(res.status, 500);
    const body = await json(res);
    strictEqual(body.data, undefined);
    strictEqual(body.error, "Internal error"); // no internal detail leaked
  });
});
