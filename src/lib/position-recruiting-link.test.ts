import { describe, it, expect } from "vitest";
import { toOnboardByPosition } from "./position-recruiting-link";

const positions = [{ id: "p1", title: "Data Scientist" }];
const roles = [
  { id: "p1", title: "Data Scientist" },
  { id: "r1", title: "Data Scientist", recruiting_only: true },
  { id: "r2", title: "Data Scientist II", recruiting_only: true },
];

describe("toOnboardByPosition", () => {
  it("includes to-onboard candidates from a recruiting role with the exact same name", () => {
    const m = toOnboardByPosition(positions, roles, [{ id: "c1", role_id: "r1", name: "A", outcome: "to_onboard" }]);
    expect(m.get("p1")?.map((c) => c.id)).toEqual(["c1"]);
  });
  it("ignores roles whose name differs", () => {
    const m = toOnboardByPosition(positions, roles, [{ id: "c2", role_id: "r2", name: "B", outcome: "to_onboard" }]);
    expect(m.has("p1")).toBe(false);
  });
  it("ignores candidates not in to onboard", () => {
    const m = toOnboardByPosition(positions, roles, [{ id: "c3", role_id: "r1", name: "C", outcome: "offer" }]);
    expect(m.has("p1")).toBe(false);
  });
});
