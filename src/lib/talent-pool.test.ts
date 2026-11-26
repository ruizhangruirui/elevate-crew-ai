import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert/strict";
import { talentSyncLookup, clampScore, sanitizeMatches } from "./talent-pool";

it("all-candidate sync never merges different TeamTailor IDs sharing an email", () => {
  const row = { teamtailor_candidate_id: "tt-one", email: "shared@example.test" };
  const lookup = talentSyncLookup([row]);
  strictEqual(lookup("tt-one", row.email), row);
  strictEqual(lookup("tt-two", row.email), undefined);
});

it("all-candidate sync can reuse a manual record only for one supplier identity", () => {
  const row = { teamtailor_candidate_id: null, email: "shared@example.test" };
  const lookup = talentSyncLookup([row]);
  strictEqual(lookup("tt-one", "SHARED@example.test"), row);
  strictEqual(lookup("tt-two", row.email), undefined);
});

describe("talent pool AI output", () => {
  it("clamps scores to 0-100", () => {
    strictEqual(clampScore(140), 100);
    strictEqual(clampScore(-3), 0);
    strictEqual(clampScore("x"), 0);
  });
  it("drops matches for positions that were not offered (e.g. out of scope)", () => {
    const out = sanitizeMatches(
      [
        { role_id: "a", role_title: "?", fit_score: 60, reason: "" },
        { role_id: "hidden", role_title: "Secret", fit_score: 99, reason: "" },
      ],
      [{ id: "a", title: "ML Engineer" }],
    );
    deepStrictEqual(out, [{ role_id: "a", role_title: "ML Engineer", fit_score: 60, reason: "" }]);
  });
});
