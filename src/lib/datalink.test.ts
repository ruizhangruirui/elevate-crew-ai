import { describe, it } from "node:test";
import { strictEqual } from "node:assert/strict";
import { datalinkStep, isDatalinkStage, needsDatalink } from "./datalink";

describe("datalink", () => {
  it("prompts only after offer accepted", () => {
    strictEqual(needsDatalink("offer_accepted"), true);
    strictEqual(needsDatalink("offer"), false);
    strictEqual(needsDatalink("to_onboard"), true);
    strictEqual(needsDatalink("active"), false);
  });
  it("orders stages: HRD after Lab director, completed last", () => {
    strictEqual(datalinkStep("hrd"), datalinkStep("lab_director") + 1);
    strictEqual(datalinkStep("completed"), 6);
    strictEqual(datalinkStep(null), -1);
  });
  it("rejects unknown stages", () => strictEqual(isDatalinkStage("foo"), false));
});
