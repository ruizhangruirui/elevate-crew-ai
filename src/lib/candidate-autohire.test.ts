import { describe, expect, test } from "bun:test";
import { isDueForOnboarding } from "./candidate-autohire";

describe("isDueForOnboarding", () => {
  test("due on the start date itself", () => expect(isDueForOnboarding({ outcome: "to_onboard", onboarding_on: "2026-11-04" }, "2026-11-04")).toBe(true));
  test("not due before the start date", () => expect(isDueForOnboarding({ outcome: "to_onboard", onboarding_on: "2026-11-05" }, "2026-11-04")).toBe(false));
  test("not due without a start date", () => expect(isDueForOnboarding({ outcome: "to_onboard", onboarding_on: null }, "2026-11-04")).toBe(false));
  test("only To onboard candidates move", () => expect(isDueForOnboarding({ outcome: "offer", onboarding_on: "2026-11-01" }, "2026-11-04")).toBe(false));
});
