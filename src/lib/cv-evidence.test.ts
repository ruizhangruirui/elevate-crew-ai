import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyNames, verifyPaired, appearsInCv } from "./cv-evidence";

const cv = "Education\nPhD in Robotics, ETH Zürich, 2018-2022\nExperience\nResearch Engineer at Robert Bosch GmbH";

test("keeps schools and companies present in the CV", () => {
  assert.deepEqual(verifyPaired(["PhD · ETH Zurich"], cv), ["PhD · ETH Zurich"]);
  assert.equal(appearsInCv("Bosch", cv), true);
});

test("drops invented schools and employers", () => {
  assert.deepEqual(verifyPaired(["MSc · Stanford University"], cv), []);
  assert.deepEqual(verifyNames(["Google", "Robert Bosch GmbH"], cv), ["Robert Bosch GmbH"]);
});
