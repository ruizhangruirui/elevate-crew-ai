import { describe, it } from "node:test";
import { strictEqual } from "node:assert/strict";
import { recruitingRoleStatus } from "./recruiting-role-status";

describe("Recruiting role status", () => {
  it("shows To onboard instead of Open with one awaiting candidate", () => {
    strictEqual(recruitingRoleStatus(1, 1), "to_onboard");
  });
  it("shows Filled after onboarding fills the vacancy", () => {
    strictEqual(recruitingRoleStatus(0, 0), "filled");
  });
  it("keeps unfilled vacancies Open when there is no awaiting candidate", () => {
    strictEqual(recruitingRoleStatus(1, 0), "open");
  });
});