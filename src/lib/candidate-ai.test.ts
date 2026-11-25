import { describe, it } from "node:test";
import { strictEqual } from "node:assert/strict";
import { candidateOverall } from "./candidate-ai";

describe("candidateOverall", () => {
  it("weighs JD fit 40% and each background dimension 15%", () => {
    strictEqual(candidateOverall({ jd_fit: 100, education: 0, experience: 0, skills: 0, publications: 0 }), 40);
    strictEqual(candidateOverall({ jd_fit: 80, education: 60, experience: 70, skills: 90, publications: 20 }), 68);
  });
});
