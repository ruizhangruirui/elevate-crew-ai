import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert/strict";
import { APP_ROLES, isOwnerRole, roleAllowed } from "./app-roles";

describe("HR Director permission equivalence", () => {
  it("registers HR Director as a distinct role", () => {
    deepStrictEqual(APP_ROLES, ["owner", "hr_director", "hr", "manager", "recruiter"]);
  });
  it("grants the same Owner-level data and UI permissions", () => {
    strictEqual(isOwnerRole("hr_director"), true);
    strictEqual(isOwnerRole("owner"), true);
    for (const role of ["hr", "manager", "recruiter", undefined, null, "unknown"])
      strictEqual(isOwnerRole(role), false);
  });
  it("allows HR Director through Owner-only user management and bulk imports", () => {
    strictEqual(roleAllowed("hr_director", ["owner"]), true);
    for (const role of ["hr", "manager", "recruiter"] as const)
      strictEqual(roleAllowed(role, ["owner"]), false);
  });
  it("grants identical access for every server role allowlist", () => {
    for (let mask = 0; mask < 1 << APP_ROLES.length; mask++) {
      const allowed = APP_ROLES.filter((_, i) => mask & (1 << i));
      strictEqual(roleAllowed("hr_director", allowed), roleAllowed("owner", allowed));
    }
  });
  it("preserves existing restricted-role allowlists", () => {
    strictEqual(roleAllowed("hr_director", ["hr", "recruiter"]), false);
    strictEqual(roleAllowed("hr", ["hr", "recruiter"]), true);
    strictEqual(roleAllowed("manager", ["owner", "hr", "recruiter"]), false);
  });
});