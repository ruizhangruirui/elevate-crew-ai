import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { QS_EDITION, talentHighlights } from "./talent-highlights";

const signals = (headline: string, ai_summary = "") => talentHighlights({ headline, ai_summary, tags: [] });
describe("talent educational highlights", () => {
  it("recognizes PhD and Ph.D. without tagging other doctor titles", () => {
    strictEqual(signals("Ph.D. in robotics")[0]?.kind, "phd");
    strictEqual(signals("博士，机器学习")[0]?.kind, "phd");
    deepStrictEqual(signals("Dr. Smith, medical practitioner"), []);
    deepStrictEqual(signals("No PhD; seeking a doctoral graduate"), []);
  });
  it("distinguishes ongoing doctoral study", () => {
    strictEqual(signals("PhD candidate at MIT")[0]?.kind, "phd_candidate");
    strictEqual(signals("清华大学博士在读")[0]?.kind, "phd_candidate");
  });
  it("highlights top 20 institutions using the pinned overall QS edition", () => {
    strictEqual(QS_EDITION, 2026);
    strictEqual(signals("MSc, University of New South Wales").some((h) => h.kind === "qs"), true);
    strictEqual(signals("硕士毕业于北京大学").some((h) => h.kind === "qs"), true);
    strictEqual(signals("MSc at University of Toronto").some((h) => h.kind === "qs"), false);
  });
  it("does not treat university employers, partial names or another campus as education", () => {
    deepStrictEqual(signals("Engineer at MIT"), []);
    deepStrictEqual(signals("MSc at MITech"), []);
    deepStrictEqual(signals("MSc at NTU"), []);
    strictEqual(signals("MSc at NTU Singapore").some((h) => h.kind === "qs"), true);
    deepStrictEqual(signals("MSc at University of California, Los Angeles"), []);
  });
  it("deduplicates and preserves AI attribution", () => {
    const result = signals("PhD at ETH Zurich", "PhD graduate of ETH Zurich");
    strictEqual(result.filter((h) => h.kind === "qs").length, 1);
    strictEqual(result[0]?.source, "profile");
    strictEqual(signals("Engineer", "博士毕业于清华大学")[0]?.source, "ai");
  });
});