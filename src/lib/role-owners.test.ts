import { describe, it } from "node:test";
import { strictEqual } from "node:assert/strict";
import { missingRoleOwners } from "./role-owners";

describe("Hiring position owners", () => {
  it("flags a new position without a recruiter", () => {
    strictEqual(missingRoleOwners({ title: "X", supervisor_person_id: "p1" }), true);
  });
  it("flags a new position without a supervisor", () => {
    strictEqual(missingRoleOwners({ title: "X", recruiter_person_id: "p1" }), true);
  });
  it("accepts a position with both owners", () => {
    strictEqual(missingRoleOwners({ title: "X", recruiter_person_id: "p1", supervisor_person_id: "p2" }), false);
  });
  it("checks every row in a batch insert", () => {
    strictEqual(missingRoleOwners([
      { recruiter_person_id: "p1", supervisor_person_id: "p2" },
      { recruiter_person_id: null, supervisor_person_id: "p2" },
    ]), true);
  });
});
