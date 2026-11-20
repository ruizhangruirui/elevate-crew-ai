import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, rejects } from "node:assert/strict";
import type { AppUser, admin } from "./auth.server";
import { roleAnalysisScope } from "./role-scope.server";

function database() {
  const tables: Record<string, Record<string, unknown>[]> = {
    people: [{ id: "me", name: "Manager", company_email: "manager@example.test", archived: false, role_id: null }],
    roles: [
      { id: "own-role", org_node_id: "own-lab", archived: false, visible_to_person_ids: [] },
      { id: "shared-role", org_node_id: "other-lab", archived: false, visible_to_person_ids: ["me"] },
      { id: "private-role", org_node_id: "other-lab", archived: false, visible_to_person_ids: [] },
    ],
  };
  return { from(table: string) {
    let rows = tables[table] ?? [];
    const query = {
      select() { return query; },
      eq(column: string, value: unknown) { rows = rows.filter((row) => row[column] === value); return query; },
      in(column: string, values: unknown[]) { rows = rows.filter((row) => values.includes(row[column])); return query; },
      then(resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) { return Promise.resolve(resolve({ data: rows, error: null })); },
    };
    return query;
  } } as unknown as Awaited<ReturnType<typeof admin>>;
}

const user: AppUser = { id: "manager-user", email: "manager@example.test", name: "Manager", role: "manager", scope_node_ids: ["own-lab"], status: "active", must_change_password: false };
const scope = { nodeIds: new Set(["own-lab"]), personIds: new Set(["me"]) };

describe("AI analysis shares position permissions", () => {
  it("rejects a manager's out-of-scope position", async () => {
    await rejects(roleAnalysisScope(database(), user, "private-role", async () => scope), /outside your scope/);
  });
  it("sharing a position does not expose the other Lab's employee assessments", async () => {
    const result = await roleAnalysisScope(database(), user, "shared-role", async () => scope);
    deepStrictEqual([...(result?.personIds ?? [])], ["me"]);
  });
  it("keeps Owner-level access unrestricted", async () => {
    strictEqual(await roleAnalysisScope(database(), { ...user, role: "owner" }, "private-role"), null);
  });
});