import { describe, it, expect } from "vitest";
import { labOf, hrNodes } from "./people-scope";
const nodes = [
  { id: "c", name: "VNRC", type: "Research Center", parent_id: null },
  { id: "lab", name: "Network Lab", type: "Lab", parent_id: "c" },
  { id: "t", name: "Compiler Team", type: "Team", parent_id: "lab" },
  { id: "p", name: "Platform", type: "Team", parent_id: "c" },
  { id: "hr", name: "HR Team", type: "Team", parent_id: "p" },
];
describe("people scope", () => {
  it("finds the lab of a team", () => expect(labOf(nodes, "t")).toBe("lab"));
  it("recruiters come only from the HR team", () => expect([...hrNodes(nodes)]).toEqual(["hr"]));
});
