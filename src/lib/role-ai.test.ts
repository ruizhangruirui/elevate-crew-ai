import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert/strict";
import { roleAiInput, fitCandidates } from "./role-ai";

describe("Job Description AI inputs", () => {
  it("uses the current unsaved description", () => {
    const data = roleAiInput.parse({ roleId: "00000000-0000-4000-8000-000000000001", draft: { title: "Researcher", description: "Develop network protocols", level_min: 1, level_max: 3 } });
    strictEqual(data.draft?.description, "Develop network protocols");
  });
  it("rejects an empty description draft", () => {
    strictEqual(roleAiInput.safeParse({ roleId: "00000000-0000-4000-8000-000000000001", draft: { title: "Researcher", description: "   ", level_min: 1, level_max: 3 } }).success, false);
  });
  it("analyzes only active non-archived employees", () => {
    deepStrictEqual(fitCandidates([
      { id: "active", status: "onboard", archived: false },
      { id: "archived", status: "onboard", archived: true },
      { id: "left", status: "left", archived: false },
      { id: "candidate", status: "candidate", archived: false },
    ]).map((person) => person.id), ["active"]);
  });
});