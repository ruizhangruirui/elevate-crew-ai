import { describe, it } from "node:test";
import { strictEqual, throws } from "node:assert/strict";
import { onboardingDate } from "./candidate-onboarding";

describe("Recruiting planned start date", () => {
  it("can store and revise a To onboard candidate's start date", () => {
    let candidate = { outcome: "to_onboard", onboarding_on: onboardingDate("2026-11-13") };
    strictEqual(candidate.onboarding_on, "2026-11-13");
    candidate = { ...candidate, onboarding_on: onboardingDate("2026-12-01") };
    strictEqual(candidate.onboarding_on, "2026-12-01");
    strictEqual(candidate.outcome, "to_onboard");
  });
  it("allows an unknown start date to remain empty", () => {
    strictEqual(onboardingDate(""), null);
  });
  it("rejects invalid calendar dates", () => {
    throws(() => onboardingDate("2026-02-30"));
  });
});