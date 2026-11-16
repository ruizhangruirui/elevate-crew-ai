import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert/strict";
import { allowsFixedTerm, daysUntil, durationLabel, fixedTermFields, monthsBetween, roleExpected } from "./contract";

describe("role expectation by contract", () => {
  it("interns and leased staff are never flagged as role-less", () => {
    strictEqual(roleExpected("Intern"), false);
    strictEqual(roleExpected("Leased via Hays"), false);
    strictEqual(roleExpected("Leased via Connect 44"), false);
    strictEqual(roleExpected("Employee"), true);
    strictEqual(roleExpected("Consultant"), true);
    strictEqual(roleExpected(null), true);
    strictEqual(roleExpected(undefined), true);
  });
});

describe("fixed-term contracts", () => {
  it("only leased staff and interns can be fixed-term", () => {
    strictEqual(allowsFixedTerm("Leased via Hays"), true);
    strictEqual(allowsFixedTerm("Leased via Connect 44"), true);
    strictEqual(allowsFixedTerm("Intern"), true);
    strictEqual(allowsFixedTerm("Employee"), false);
    strictEqual(allowsFixedTerm("Consultant"), false);
  });
  it("employees never keep an end date", () => {
    deepStrictEqual(fixedTermFields("Employee", true, "2027-01-31"), { fixed_term: false, contract_end_on: null });
  });
  it("a fixed-term contract requires an end date", () => {
    deepStrictEqual(fixedTermFields("Intern", true, null), { error: "cm.err.endDate" });
    deepStrictEqual(fixedTermFields("Intern", true, "2027-01-31"), { fixed_term: true, contract_end_on: "2027-01-31" });
  });
  it("counts days until the end date", () => {
    strictEqual(daysUntil("2026-11-20", new Date(2026, 10, 10)), 10);
    strictEqual(daysUntil("2026-11-01", new Date(2026, 10, 10)), -9);
  });
});

describe("contract duration", () => {
  it("counts whole months between start and end dates", () => {
    strictEqual(monthsBetween("2026-01-05", "2026-07-04"), 5);
    strictEqual(monthsBetween("2026-01-05", "2026-07-05"), 6);
    strictEqual(monthsBetween("2026-01-05", "2027-07-05"), 18);
    strictEqual(monthsBetween("2026-01-05", null), null);
    strictEqual(monthsBetween(null, "2027-07-05"), null);
  });
  it("labels durations as months, years, or years and months", () => {
    const zh = (k: string) => ({ "cm.dur.ym": "{y} 年 {m} 个月", "cm.dur.y": "{y} 年", "cm.dur.m": "{m} 个月" })[k] ?? k;
    const en = (k: string) => ({ "cm.dur.ym": "{y}y {m}m", "cm.dur.y": "{y}y", "cm.dur.m": "{m}m" })[k] ?? k;
    strictEqual(durationLabel(zh, 6), "6 个月");
    strictEqual(durationLabel(zh, 12), "1 年");
    strictEqual(durationLabel(zh, 18), "1 年 6 个月");
    strictEqual(durationLabel(en, 6), "6m");
    strictEqual(durationLabel(en, 12), "1y");
    strictEqual(durationLabel(en, 18), "1y 6m");
    strictEqual(durationLabel(en, null), "—");
  });
});
