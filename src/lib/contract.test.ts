import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert/strict";
import { allowsFixedTerm, daysUntil, fixedTermFields, roleExpected } from "./contract";

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
