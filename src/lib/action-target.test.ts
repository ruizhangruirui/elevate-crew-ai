import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { actionTarget } from "./action-target";
import type { ActionItem } from "./actions";

const action: ActionItem = {
  id: "task-1", title: "Review", detail: null, source_kind: "manual", source_key: null,
  role_id: null, person_id: null, org_node_id: null, owner: null, due_on: null,
  priority: "normal", status: "todo", completed_at: null, created_at: "", updated_at: "",
};

describe("actionTarget", () => {
  it("opens the exact position awaiting approval", () => {
    deepStrictEqual(actionTarget({ ...action, source_kind: "position_approval", source_key: "position-7" }),
      { kind: "position", id: "position-7" });
  });
  it("keeps reference and HR review actions on the exact letter", () => {
    for (const source_kind of ["reference", "reference_review"]) {
      deepStrictEqual(actionTarget({ ...action, source_kind, source_key: "letter-3", person_id: "person-2" }),
        { kind: "reference", id: "letter-3" });
    }
  });
  it("links a role action to its position", () => {
    deepStrictEqual(actionTarget({ ...action, role_id: "role-4" }), { kind: "position", id: "role-4" });
  });
  it("links a person action to that person's profile", () => {
    deepStrictEqual(actionTarget({ ...action, person_id: "person-2" }), { kind: "person", id: "person-2" });
  });
  it("does not invent a link for a standalone action", () => {
    strictEqual(actionTarget(action), null);
  });
});