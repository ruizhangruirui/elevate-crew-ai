import { describe, it } from "node:test";
import { strictEqual } from "node:assert/strict";
import { missingRoleOwners, missingRoleOwnersOnUpdate } from "./role-owners";

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
  it("accepts a position kept out of Recruiting without owners", () => {
    strictEqual(missingRoleOwners({ title: "X", recruiting_archived: true }), false);
  });
  it("checks every row in a batch insert", () => {
    strictEqual(missingRoleOwners([
      { recruiter_person_id: "p1", supervisor_person_id: "p2" },
      { recruiter_person_id: null, supervisor_person_id: "p2" },
    ]), true);
  });
});

describe("Re-entering Recruiting via update", () => {
  const targets = [{ recruiter_person_id: "r1", supervisor_person_id: "s1" }];
  it("accepts an update that keeps existing owners", () => {
    strictEqual(missingRoleOwnersOnUpdate({ recruiting_archived: false }, targets), false);
  });
  it("accepts an update that sets both owners", () => {
    strictEqual(missingRoleOwnersOnUpdate({ recruiting_archived: false, recruiter_person_id: "r2", supervisor_person_id: "s2" }, [{ recruiter_person_id: null, supervisor_person_id: null }]), false);
  });
  it("flags an update whose target lacks an existing recruiter", () => {
    strictEqual(missingRoleOwnersOnUpdate({ recruiting_archived: false }, [{ recruiter_person_id: null, supervisor_person_id: "s1" }]), true);
  });
  it("flags an update whose payload clears the supervisor", () => {
    strictEqual(missingRoleOwnersOnUpdate({ recruiting_archived: false, supervisor_person_id: null }, targets), true);
  });
});
