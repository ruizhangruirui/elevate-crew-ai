import type { Dict } from "../i18n-types";

export const growthDict: Dict = {
  "nav.growth": { zh: "绩效与成长", en: "Performance & Growth" },
  "growth.title": { zh: "绩效与成长", en: "Performance & Growth" },
  "growth.subtitle": {
    zh: "全员绩效评估进度、人才九宫格、晋升与奖项成长轨迹，点击任何人可进入个人页面继续维护。",
    en: "Review progress, the talent grid, and promotion / award growth across the org. Click anyone to open their profile.",
  },
  "growth.metaDesc": {
    zh: "查看组织绩效评估覆盖率、绩效分布、人才九宫格与近 12 个月的晋升奖项记录。",
    en: "Review coverage, rating distribution, the 9-box talent grid and the last 12 months of promotions and awards.",
  },

  "growth.stat.coverage": { zh: "评估覆盖率", en: "Review coverage" },
  "growth.stat.exceeds": { zh: "超出预期", en: "Exceeds" },
  "growth.stat.below": { zh: "低于预期", en: "Below" },
  "growth.stat.promotions": { zh: "近 12 月晋升", en: "Promotions (12m)" },
  "growth.stat.awards": { zh: "近 12 月奖项", en: "Awards (12m)" },
  "growth.stat.readyNow": { zh: "可立即接任", en: "Ready now" },

  "growth.grid.title": { zh: "人才九宫格", en: "Talent grid" },
  "growth.grid.hint": {
    zh: "纵轴为最近一次绩效，横轴为继任准备度；只统计两项都已评估的人。",
    en: "Rows are the latest performance rating, columns are succession readiness. Only people assessed on both appear here.",
  },
  "growth.grid.axisPerf": { zh: "绩效", en: "Performance" },
  "growth.grid.axisReadiness": { zh: "准备度", en: "Readiness" },
  "growth.grid.empty": { zh: "—", en: "—" },
  "growth.grid.more": { zh: "还有 {n} 人", en: "+{n} more" },

  "growth.timeline.title": { zh: "成长轨迹", en: "Growth timeline" },
  "growth.timeline.empty": { zh: "暂无晋升 / 奖项记录。", en: "No promotion or award records yet." },
  "growth.reviews.title": { zh: "最近绩效记录", en: "Recent reviews" },
  "growth.reviews.empty": { zh: "暂无绩效记录。", en: "No performance records yet." },
  "growth.gap.title": { zh: "尚未评估", en: "Not yet reviewed" },
  "growth.gap.hint": {
    zh: "这些成员还没有任何绩效记录，建议尽快安排评估。",
    en: "These members have no performance record yet — schedule a review.",
  },
  "growth.gap.none": { zh: "所有成员都已有绩效记录。", en: "Everyone has a performance record." },

  // person page card
  "growth.card.title": { zh: "绩效与成长", en: "Performance & Growth" },
  "growth.card.latest": { zh: "最近绩效", en: "Latest rating" },
  "growth.card.reviews": { zh: "评估次数", en: "Reviews" },
  "growth.card.promotions": { zh: "晋升", en: "Promotions" },
  "growth.card.awards": { zh: "奖项 / 认证", en: "Awards / certs" },
  "growth.card.lastPromotion": { zh: "最近一次晋升", en: "Last promotion" },
  "growth.card.gridPos": { zh: "九宫格位置", en: "Talent grid" },
  "growth.card.none": { zh: "未评估", en: "Not assessed" },
  "growth.card.viewAll": { zh: "查看全组织绩效与成长", en: "View org-wide growth" },
  // review entry
  "growth.review.title": { zh: "记录绩效评估", en: "Record a performance review" },
  "growth.review.hint": {
    zh: "选择成员并填写本次考核结论，保存后会写入该成员的绩效记录与操作日志。",
    en: "Pick a member and record this review. It is saved to their performance records and audit log.",
  },
  "growth.review.person": { zh: "被评估人", en: "Person" },
  "growth.review.pickPerson": { zh: "请选择成员", en: "Select a member" },
  "growth.review.new": { zh: "发起评估", en: "New review" },
  "growth.review.quick": { zh: "评估", en: "Review" },
};
