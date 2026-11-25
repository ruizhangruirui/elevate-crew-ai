import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert/strict";
import { needsOfferApproval, pickPath, mapFields, datalinkPhase, fillPath } from "./datalink";

describe("offer approval link", () => {
  it("shows for Offer", () => strictEqual(needsOfferApproval("offer"), true));
  it("hides once offer accepted", () => strictEqual(needsOfferApproval("offer_accepted"), false));
  it("hides for active candidates", () => strictEqual(needsOfferApproval("active"), false));
});

describe("datalink helpers", () => {
  it("reads nested response ids", () => strictEqual(pickPath({ data: { id: "A1" } }, "data.id"), "A1"));
  it("returns undefined for missing paths", () => strictEqual(pickPath({ data: null }, "data.id"), undefined));
  it("renames mapped fields only", () =>
    deepStrictEqual(mapFields({ job_title: "X", workload: "100" }, { job_title: "jobName" }), {
      jobName: "X",
      workload: "100",
    }));
  it("maps rejected status", () => strictEqual(datalinkPhase("已驳回"), "rejected"));
  it("maps approved status", () => strictEqual(datalinkPhase("APPROVED"), "approved"));
  it("maps in-progress status", () => strictEqual(datalinkPhase("审批中"), "pending"));
  it("fills id into path", () => strictEqual(fillPath("/api/task/{id}", "a b"), "/api/task/a%20b"));
});
