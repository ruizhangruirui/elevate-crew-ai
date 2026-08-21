import type { Dict } from "../i18n-types";

export const lifecycleDict: Dict = {
  "lc.reason.voluntary": { zh: "主动离职", en: "Voluntary resignation" },
  "lc.reason.termination": { zh: "公司解除（Termination）", en: "Termination" },
  "lc.reason.internship_end": { zh: "实习结束", en: "Internship ended" },
  "lc.reason.contract_end": { zh: "合同到期", en: "Contract ended" },
  "lc.reason.transfer_out": { zh: "转出到其他团队", en: "Transferred out" },
  "lc.reason.other": { zh: "其他", en: "Other" },
  "lc.reason.new_hire": { zh: "新入职", en: "New hire" },
  "lc.reason.candidate_converted": { zh: "候选人转正式入职", en: "Candidate converted" },
  "lc.reason.transfer_in": { zh: "从其他团队转入", en: "Transferred in" },
  "lc.reason.rehire": { zh: "回聘 / 恢复在岗", en: "Rehire / restored" },
  "lc.reason.initial_import": { zh: "系统初始导入", en: "Initial import" },

  "lc.archive.action": { zh: "离职归档", en: "Archive (exit)" },
  "lc.archive.title": { zh: "登记离职并归档「{name}」", en: "Log exit and archive “{name}”" },
  "lc.archive.desc": {
    zh: "离职后该人员将从名单与组织树中移除，但入离职记录、绩效与评估历史会完整保留，可在「已归档人员」里查看或恢复。",
    en: "The person leaves the active roster and org tree, while lifecycle, performance and assessment history are kept. You can review or restore them under Archived people.",
  },
  "lc.archive.reason": { zh: "离职原因", en: "Exit reason" },
  "lc.archive.detail": { zh: "离职详情", en: "Exit details" },
  "lc.archive.detailPlaceholder": {
    zh: "例如：转去做博士研究 / 绩效未达标 / 实习期 6 个月结束…",
    en: "e.g. leaving for a PhD / performance below bar / 6-month internship ended…",
  },
  "lc.archive.date": { zh: "最后工作日", en: "Last working day" },
  "lc.archive.confirm": { zh: "确认离职归档", en: "Confirm exit" },
  "lc.archive.done": { zh: "已登记离职并归档", en: "Exit logged and archived" },

  "lc.join.done": { zh: "已登记入职", en: "Onboarding logged" },
  "lc.join.date": { zh: "入职日期", en: "Join date" },

  "lc.archived.title": { zh: "已归档人员", en: "Archived people" },
  "lc.archived.count": { zh: "人", en: "" },
  "lc.archived.show": { zh: "查看已归档", en: "Show archived" },
  "lc.archived.hide": { zh: "收起", en: "Hide" },
  "lc.archived.empty": { zh: "暂无已归档人员。", en: "No archived people." },
  "lc.archived.restore": { zh: "恢复在岗", en: "Restore" },
  "lc.archived.restored": { zh: "已恢复在岗", en: "Restored to onboard" },
  "lc.archived.purge": { zh: "彻底删除", en: "Delete permanently" },
  "lc.archived.purgeTitle": { zh: "彻底删除「{name}」的所有数据？", en: "Permanently delete all data for “{name}”?" },
  "lc.archived.purgeDesc": {
    zh: "包含入离职记录、绩效、技能评估与 AI 匹配记录，删除后无法恢复。通常建议保留归档以便统计。",
    en: "Includes lifecycle, performance, skill assessment and AI matching records. This cannot be undone; keeping the archive is usually recommended for analytics.",
  },

  "lc.flow.title": { zh: "人员流动", en: "Headcount Flow" },
  "lc.flow.desc": {
    zh: "基于入职 / 离职登记统计。新增人员或候选人转为在岗时自动记入职，离职归档时记离职。",
    en: "Based on join / exit records. Adding a person or converting a candidate logs a join; archiving logs an exit.",
  },
  "lc.flow.joins90": { zh: "90 天入职", en: "Joins (90d)" },
  "lc.flow.exits90": { zh: "90 天离职", en: "Exits (90d)" },
  "lc.flow.net90": { zh: "90 天净增", en: "Net (90d)" },
  "lc.flow.byMonth": { zh: "近 6 个月", en: "Last 6 months" },
  "lc.flow.month": { zh: "月份", en: "Month" },
  "lc.flow.joins": { zh: "入职", en: "Joins" },
  "lc.flow.exits": { zh: "离职", en: "Exits" },
  "lc.flow.reasons": { zh: "离职原因分布", en: "Exit reasons" },
  "lc.flow.recent": { zh: "最近异动", en: "Recent movements" },
  "lc.flow.empty": { zh: "暂无入离职记录。", en: "No lifecycle records yet." },
  "lc.flow.eventJoin": { zh: "入职", en: "Joined" },
  "lc.flow.eventExit": { zh: "离职", en: "Left" },

  "lc.person.title": { zh: "入离职记录", en: "Lifecycle" },
  "lc.person.empty": { zh: "暂无入离职记录。", en: "No lifecycle records." },
};
