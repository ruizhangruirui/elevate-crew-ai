import { describe, expect, test } from "bun:test";
import { organizationParents } from "./org-hierarchy";

describe("Lab and Team hierarchy", () => {
  test("a Lab can remain the parent of several Teams", () => {
    const lab = { id: "lab-a", parent_id: "org", type: "Lab", archived: false };
    const nodes = [lab,
      { id: "team-1", parent_id: lab.id, type: "Team", archived: false },
      { id: "team-2", parent_id: lab.id, type: "Team", archived: false },
      { id: "team-3", parent_id: lab.id, type: "Team", archived: false }];
    expect(organizationParents(nodes, "Team")).toEqual([lab]);
    expect(organizationParents(nodes, "Team", "team-2")).toEqual([lab]);
  });
});