import { describe, it as test } from "node:test";
import assert from "node:assert/strict";
import { isDueForOnboarding } from "./candidate-autohire";

const due = (outcome: string, onboarding_on: string | null) => isDueForOnboarding({ outcome, onboarding_on }, "2026-11-04");
describe("isDueForOnboarding", () => {
  test("due on the start date itself", () => assert.equal(due("to_onboard", "2026-11-04"), true));
  test("not due before the start date", () => assert.equal(due("to_onboard", "2026-11-05"), false));
  test("not due without a start date", () => assert.equal(due("to_onboard", null), false));
  test("only To onboard candidates move", () => assert.equal(due("offer", "2026-11-01"), false));
});
