import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { overviewCandidates, teamForRole } from "./recruiting-overview";

const nodes = [
  { id: "lab", parent_id: null, type: "Lab" },
  { id: "a", parent_id: "lab", type: "Team" },
  { id: "b", parent_id: "lab", type: "Team" },
];
const roles = [{ id: "ra", org_node_id: "a" }, { id: "rb", org_node_id: "b" }, { id: "rl", org_node_id: "lab" }];
const candidates = [
  { id: "1", role_id: "ra", outcome: "offer" },
  { id: "2", role_id: "rb", outcome: "to_onboard" },
  { id: "3", role_id: "ra", outcome: "active" },
  { id: "4", role_id: "hidden", outcome: "offer" },
  { id: "5", role_id: "rl", outcome: "offer" },
];
describe("Cross-role recruiting overview", () => {
  it("combines Offered and To onboard candidates across roles", () => {
    deepStrictEqual(overviewCandidates(candidates, roles, nodes).map((c) => c.id), ["1", "2", "5"]);
  });
  it("filters candidates by their role's Team", () => {
    deepStrictEqual(overviewCandidates(candidates, roles, nodes, "b").map((c) => c.id), ["2"]);
    strictEqual(teamForRole("lab", nodes), null);
  });
  it("supports independent Offered and To onboard views", () => {
    deepStrictEqual(overviewCandidates(candidates, roles, nodes, "all", "offer").map((c) => c.id), ["1", "5"]);
    deepStrictEqual(overviewCandidates(candidates, roles, nodes, "all", "to_onboard").map((c) => c.id), ["2"]);
  });
  it("never includes candidates whose roles are outside the supplied scope", () => {
    deepStrictEqual(overviewCandidates(candidates, roles.filter((r) => r.id === "ra"), nodes).map((c) => c.id), ["1"]);
  });
});