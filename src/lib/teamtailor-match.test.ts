import { describe, it } from "node:test";
import { strictEqual, notStrictEqual, deepStrictEqual } from "node:assert/strict";
import { normTitle } from "./teamtailor.server";
import { matchJobs } from "./teamtailor-match";

const expect = (v: string) => ({
  toBe: (o: string) => strictEqual(v, o),
  not: { toBe: (o: string) => notStrictEqual(v, o) },
});

describe("direct TeamTailor matching", () => {
  const roles = [{ id: "active-role", title: "Research Engineer", job_title: "AI Engineer" }];
  it("automatically matches a maintained recruiting job title", () => {
    const matches = matchJobs(roles, [], { jobs: [{ id: "tt-active", title: "AI engineer" }], applications: [], capped: false });
    strictEqual(matches[0]?.roleId, "active-role");
    strictEqual(matches[0]?.status, "title");
  });
  it("skips old unmatched supplier jobs without blocking matched jobs", () => {
    const matches = matchJobs(roles, [], { jobs: [{ id: "tt-old", title: "Old Position" }, { id: "tt-active", title: "AI Engineer" }], applications: [], capped: false });
    deepStrictEqual(matches.filter((job) => job.roleId).map((job) => job.ttJobId), ["tt-active"]);
    strictEqual(matches[0]?.roleId, null);
  });
  it("does not revive a saved mapping to an archived recruiting position", () => {
    const matches = matchJobs(roles, [{ tt_job_id: "tt-old", role_id: "archived-role" }], { jobs: [{ id: "tt-old", title: "Old Position" }], applications: [], capped: false });
    strictEqual(matches[0]?.roleId, null);
  });
  it("skips ambiguous titles instead of assigning candidates arbitrarily", () => {
    const matches = matchJobs([...roles, { id: "second-role", title: "AI Engineer", job_title: null }], [], { jobs: [{ id: "tt-active", title: "AI Engineer" }], applications: [], capped: false });
    strictEqual(matches[0]?.roleId, null);
    strictEqual(matches[0]?.status, "ambiguous");
  });
});

describe("normTitle (TeamTailor job ↔ position matching)", () => {
  it("matches titles that differ only by case and whitespace", () => {
    expect(normTitle("HR Specialist")).toBe(normTitle("hr  specialist"));
  });

  it("matches titles with non-breaking spaces and unicode dashes", () => {
    expect(normTitle("Memory Systems Technical Lead")).toBe(normTitle("Memory Systems Technical Lead"));
    expect(normTitle("AI Compiler 架构专家")).toBe(normTitle("AI Compiler 架构专家"));
  });

  it("ignores dash and slash punctuation differences", () => {
    expect(normTitle("IT-Specialist")).toBe(normTitle("IT Specialist"));
  });

  it("keeps parenthetical suffixes significant — matched manually, not automatically", () => {
    expect(normTitle("HR Specialist (m/f/d)")).not.toBe(normTitle("HR Specialist"));
  });

  it("does not equate genuinely different titles", () => {
    expect(normTitle("HR Specialist")).not.toBe(normTitle("HRBP"));
  });
});
