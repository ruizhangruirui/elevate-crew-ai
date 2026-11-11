import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert/strict";

import {
  buildEmployees,
  buildManagers,
  buildOrganization,
  createRateLimiter,
  extractIntegrationKey,
  filterSince,
  nextCursor,
  paginate,
  parsePagination,
  verifyIntegrationKey,
} from "./presence-api.server";

// Synthetic fixtures only — no real employee data.
const nodes = [
  { id: "lab-1", parent_id: null, name: "Synthetic Lab", type: "Lab", archived: false, updated_at: "2026-01-01T00:00:00Z" },
  { id: "team-1", parent_id: "lab-1", name: "Synthetic Team", type: "Team", archived: false, updated_at: "2026-01-02T00:00:00Z" },
  { id: "team-old", parent_id: "lab-1", name: "Archived Team", type: "Team", archived: true, updated_at: "2026-01-03T00:00:00Z" },
];

const people = [
  {
    id: "p-director",
    name: "Fake Director",
    org_node_id: "lab-1",
    supervisor_id: null,
    is_leader: true,
    archived: false,
    status: "onboard",
    company_email: "director@example.test",
    updated_at: "2026-02-01T00:00:00Z",
    // Confidential fields that must never appear in responses:
    performance: "exceeds",
    attrition_risk: "low",
    personal_email: "secret@personal.test",
    address: "1 Nowhere St",
    assessed_skills: [{ skill: "X", level: "Expert" }],
  },
  {
    id: "p-lead",
    name: "Fake Lead",
    org_node_id: "team-1",
    supervisor_id: null,
    is_leader: true,
    archived: false,
    status: "onboard",
    company_email: "lead@example.test",
    updated_at: "2026-02-02T00:00:00Z",
  },
  {
    id: "p-member",
    name: "Fake Member",
    org_node_id: "team-1",
    supervisor_id: null,
    is_leader: false,
    archived: false,
    status: "onboard",
    company_email: null,
    updated_at: "2026-02-03T00:00:00Z",
  },
  {
    id: "p-explicit",
    name: "Fake Explicit Report",
    org_node_id: "team-1",
    supervisor_id: "p-director",
    is_leader: false,
    archived: false,
    status: "onboard",
    company_email: "explicit@example.test",
    updated_at: "2026-02-04T00:00:00Z",
  },
  {
    id: "p-left",
    name: "Fake Departed",
    org_node_id: "team-1",
    supervisor_id: null,
    is_leader: false,
    archived: true,
    status: "left",
    company_email: "gone@example.test",
    updated_at: "2026-03-01T00:00:00Z",
  },
];

describe("integration key verification", () => {
  it("fails closed when the secret is not configured", () => {
    strictEqual(verifyIntegrationKey("anything", undefined), false);
  });
  it("rejects missing and wrong keys", () => {
    strictEqual(verifyIntegrationKey(null, "configured-key"), false);
    strictEqual(verifyIntegrationKey("wrong", "configured-key"), false);
    strictEqual(verifyIntegrationKey("configured-key-longer", "configured-key"), false);
  });
  it("accepts the exact configured key", () => {
    strictEqual(verifyIntegrationKey("configured-key", "configured-key"), true);
  });
  it("extracts the key from header or Bearer token", () => {
    const h = new Request("https://x.test", { headers: { "x-presence-key": "k1" } });
    strictEqual(extractIntegrationKey(h), "k1");
    const b = new Request("https://x.test", { headers: { authorization: "Bearer k2" } });
    strictEqual(extractIntegrationKey(b), "k2");
    const none = new Request("https://x.test");
    strictEqual(extractIntegrationKey(none), null);
  });
});

describe("employee projection allowlist", () => {
  it("exposes only allowlisted fields and never confidential HR data", () => {
    const result = buildEmployees(people, nodes);
    const director = result.find((e) => e.id === "p-director")!;
    deepStrictEqual(Object.keys(director).sort(), [
      "archived",
      "company_email",
      "id",
      "is_leader",
      "name",
      "org_node_id",
      "status",
      "supervisor_id",
      "updated_at",
    ]);
    const serialized = JSON.stringify(result);
    for (const forbidden of ["performance", "attrition_risk", "personal_email", "address", "assessed_skills", "exceeds", "secret@personal.test"]) {
      strictEqual(serialized.includes(forbidden), false, `leaked: ${forbidden}`);
    }
  });
  it("keeps archived employees visible with their status", () => {
    const departed = buildEmployees(people, nodes).find((e) => e.id === "p-left")!;
    strictEqual(departed.archived, true);
    strictEqual(departed.status, "left");
  });
});

describe("supervisor resolution", () => {
  const result = buildEmployees(people, nodes);
  it("infers the team lead for a plain member", () => {
    strictEqual(result.find((e) => e.id === "p-member")!.supervisor_id, "p-lead");
  });
  it("walks up to the lab director for a team lead", () => {
    strictEqual(result.find((e) => e.id === "p-lead")!.supervisor_id, "p-director");
  });
  it("honours an explicit supervisor override", () => {
    strictEqual(result.find((e) => e.id === "p-explicit")!.supervisor_id, "p-director");
  });
});

describe("organization projection", () => {
  it("maps node type and active flag, preserving hierarchy", () => {
    const org = buildOrganization(nodes);
    deepStrictEqual(Object.keys(org[0]!).sort(), ["id", "is_active", "name", "node_type", "parent_id", "updated_at"]);
    const team = org.find((n) => n.id === "team-1")!;
    strictEqual(team.parent_id, "lab-1");
    strictEqual(team.node_type, "Team");
    strictEqual(team.is_active, true);
    strictEqual(org.find((n) => n.id === "team-old")!.is_active, false);
  });
});

describe("manager view", () => {
  const managers = buildManagers(people, nodes);
  it("lists leaders with their nodes", () => {
    const director = managers.find((m) => m.manager_id === "p-director")!;
    deepStrictEqual(director.node_ids, ["lab-1"]);
    const lead = managers.find((m) => m.manager_id === "p-lead")!;
    deepStrictEqual(lead.node_ids, ["team-1"]);
  });
  it("distinguishes explicit from inferred reports and excludes departed people", () => {
    const director = managers.find((m) => m.manager_id === "p-director")!;
    deepStrictEqual(
      director.direct_reports.find((r) => r.person_id === "p-explicit"),
      { person_id: "p-explicit", relationship: "explicit" },
    );
    deepStrictEqual(
      director.direct_reports.find((r) => r.person_id === "p-lead"),
      { person_id: "p-lead", relationship: "inferred" },
    );
    const lead = managers.find((m) => m.manager_id === "p-lead")!;
    strictEqual(lead.direct_reports.some((r) => r.person_id === "p-left"), false);
  });
});

describe("pagination", () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ id: i }));
  it("slices pages and reports the next offset", () => {
    deepStrictEqual(paginate(items, 5, 0), { page: items.slice(0, 5), total: 12, next_offset: 5 });
    deepStrictEqual(paginate(items, 5, 10), { page: items.slice(10), total: 12, next_offset: null });
  });
  it("parses and clamps query params", () => {
    deepStrictEqual(parsePagination(new URL("https://x.test?limit=5000&offset=-3")), { limit: 1000, offset: 0 });
    deepStrictEqual(parsePagination(new URL("https://x.test")), { limit: 500, offset: 0 });
  });
});

describe("incremental synchronization", () => {
  const rows = [
    { id: "a", updated_at: "2026-01-01T00:00:00Z" },
    { id: "b", updated_at: "2026-05-01T00:00:00Z" },
    { id: "c", updated_at: null },
  ];
  it("filters rows changed after the cursor, keeping untimestamped rows", () => {
    deepStrictEqual(
      filterSince(rows, "2026-02-01T00:00:00Z").map((r) => r.id),
      ["b", "c"],
    );
  });
  it("returns everything without a cursor or with an invalid one", () => {
    strictEqual(filterSince(rows, null).length, 3);
    strictEqual(filterSince(rows, "not-a-date").length, 3);
  });
  it("advances the cursor to the newest returned timestamp", () => {
    strictEqual(nextCursor(rows, "2026-01-01T00:00:00Z"), "2026-05-01T00:00:00.000Z");
  });
});

describe("rate limiter", () => {
  it("allows up to the limit within a window, then rejects", () => {
    let t = 1000;
    const limiter = createRateLimiter(2, 60_000, () => t);
    strictEqual(limiter.allow("ip-1"), true);
    strictEqual(limiter.allow("ip-1"), true);
    strictEqual(limiter.allow("ip-1"), false);
    strictEqual(limiter.allow("ip-2"), true);
    t += 61_000;
    strictEqual(limiter.allow("ip-1"), true);
  });
});
