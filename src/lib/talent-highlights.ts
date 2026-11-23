import type { TalentRow } from "./talent-pool";

// Pinned edition, not a live ranking. QS World University Rankings (overall):
// https://www.topuniversities.com/world-university-rankings/2026
export const QS_EDITION = 2026;
const TOP_20 = [
  ["MIT", "Massachusetts Institute of Technology", "麻省理工学院"],
  ["Imperial College London", "伦敦帝国理工学院", "帝国理工学院"],
  ["Stanford University", "斯坦福大学"],
  ["University of Oxford", "Oxford University", "牛津大学"],
  ["Harvard University", "哈佛大学"],
  ["University of Cambridge", "Cambridge University", "剑桥大学"],
  ["ETH Zurich", "ETH Zürich", "苏黎世联邦理工学院"],
  ["National University of Singapore", "NUS", "新加坡国立大学"],
  ["University College London", "UCL", "伦敦大学学院"],
  ["California Institute of Technology", "Caltech", "加州理工学院"],
  ["University of Hong Kong", "HKU", "香港大学"],
  ["Nanyang Technological University", "NTU Singapore", "南洋理工大学"],
  ["University of Chicago", "芝加哥大学"],
  ["Peking University", "北京大学"],
  ["University of Pennsylvania", "UPenn", "宾夕法尼亚大学"],
  ["Cornell University", "康奈尔大学"],
  ["Tsinghua University", "清华大学"],
  ["University of California, Berkeley", "University of California Berkeley", "UC Berkeley", "加州大学伯克利分校"],
  ["University of Melbourne", "墨尔本大学"],
  ["University of New South Wales", "UNSW", "新南威尔士大学"],
] as const;

export type TalentHighlight = { kind: "phd" | "phd_candidate" | "qs"; institution?: string; evidence: string; source: "profile" | "ai" };
const doctorate = /\bph\.?\s*d\.?\b|\bdoctorate\b|\bdoctoral\b|\bdoctor of philosophy\b|博士/i;
const studying = /\b(?:candidate|student|pursuing|in progress|ongoing)\b|在读|攻读|博士生/i;
const education = /\b(?:ph\.?\s*d\.?|doctorate|doctoral|bachelor|master|bsc|msc|mba|degree|graduate|graduated|alumn\w*|studied|education)\b|博士|硕士|本科|学士|毕业|就读|教育背景/i;
const negative = /\b(?:no|not|without|lacks?|seeking|requires?|required)\b|没有|无博士|未取得|未获得|不具备|要求|招聘|希望/i;

function mentions(text: string, alias: string) {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(/^[\x00-\x7F]+$/.test(alias) ? `(?<![a-z])${escaped}(?![a-z])` : escaped, "i").test(text);
}

/** Presentation-only signals; never alter scoring, category or hiring decisions. */
export function talentHighlights(t: Pick<TalentRow, "headline" | "tags" | "ai_summary">): TalentHighlight[] {
  const highlights: TalentHighlight[] = [];
  const texts: { text: string; source: "profile" | "ai" }[] = [
    { text: t.headline ?? "", source: "profile" },
    ...t.tags.map((text) => ({ text, source: "profile" as const })),
    { text: t.ai_summary ?? "", source: "ai" },
  ];
  for (const { text, source } of texts) {
    // Do not split Ph.D. abbreviations; keep evidence local to a sentence/line.
    const sentences = text.replace(/ph\.\s*d\./gi, "PhD").split(/[。;；\n]|(?<=[.!?])\s+(?=[A-Z])/);
    for (const evidence of sentences) {
      if (negative.test(evidence)) continue;
      if (doctorate.test(evidence) && !highlights.some((h) => h.kind === "phd" || h.kind === "phd_candidate")) {
        highlights.push({ kind: studying.test(evidence) ? "phd_candidate" : "phd", evidence: evidence.trim(), source });
      }
      if (!education.test(evidence)) continue;
      for (const aliases of TOP_20) {
        const institution = aliases[0];
        if (aliases.some((alias) => mentions(evidence, alias)) && !highlights.some((h) => h.institution === institution)) {
          highlights.push({ kind: "qs", institution, evidence: evidence.trim(), source });
        }
      }
    }
  }
  return highlights;
}