import { describe, expect, it } from "bun:test";
import { normTitle } from "./teamtailor.server";

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
