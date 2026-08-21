import type { Dict } from "../i18n-types";

export const capabilityDict: Dict = {
  "cap.title": { zh: "团队与文化发展", en: "Team & Culture Development" },
  "cap.subtitle": {
    zh: "同时看三件事：团队当前状态、能力覆盖与缺口，以及文化 / 活动建设有没有真正发生。",
    en: "Track three things together: current team situation, capability coverage and gaps, and whether culture-building activity is actually happening.",
  },
  "cap.loading": { zh: "加载中…", en: "Loading…" },
  "cap.tab.health": { zh: "能力与缺口", en: "Capability Gaps" },
  "cap.tab.building": { zh: "团队 / 文化建设", en: "Team / Culture" },
  "cap.tab.trend": { zh: "进展追踪", en: "Progress" },
  "cap.scopeLabel": { zh: "范围", en: "Scope" },
  "cap.scopeAll": { zh: "全组织", en: "Whole Org" },
  "cap.scopeNotePrefix": { zh: "仅统计", en: "Only counting roles held by onboard staff within" },
  "cap.scopeNoteSuffix": { zh: "及其下级团队在岗人员所承担的岗位", en: "and its sub-teams" },

  "cap.health.title": { zh: "体检结论", en: "Health Summary" },
  "cap.health.defaultDirection": { zh: "本方向", en: "This direction" },
  "cap.health.summary1": { zh: "的岗位共要求", en: "'s roles require" },
  "cap.health.summary2": { zh: "项能力。其中", en: "capabilities in total. Of these," },
  "cap.health.summary3": { zh: "项是", en: "are caused by" },
  "cap.health.summaryStrong": { zh: "岗位还没招到人", en: "the role not yet being filled" },
  "cap.health.summary4": {
    zh: "造成的（招到人就解决）；真正需要现有团队补的是",
    en: "(solved once hired); what the current team actually needs to cover is",
  },
  "cap.health.summary5": { zh: "项；已经站稳", en: "; and already solid on" },
  "cap.health.summary6": { zh: "项。", en: "." },

  "cap.legend.vacancy": { zh: "等招聘", en: "Awaiting hire" },
  "cap.legend.gap": { zh: "人在能力不在", en: "Staffed but lacking" },
  "cap.legend.short": { zh: "人手不足", en: "Understaffed" },
  "cap.legend.covered": { zh: "已覆盖", en: "Covered" },

  "cap.dir.capCount": { zh: "项能力", en: "capabilities" },
  "cap.dir.needCover": { zh: "项要现有团队补", en: "need the current team to cover" },

  "cap.vacancy.title": { zh: "因为岗位还没到岗", en: "Because the role isn't filled yet" },
  "cap.vacancy.desc": {
    zh: "这些能力目前挂在空缺岗位上，是同一个原因造成的，不必逐条焦虑——推进招聘即可。",
    en: "These capabilities currently sit on vacant roles and share the same root cause — no need to worry about each one, just push forward on hiring.",
  },

  "cap.group.gapTitle": {
    zh: "人在，但这项能力没人扛",
    en: "Staffed, but no one covers this capability",
  },
  "cap.group.gapDesc": {
    zh: "岗位上有人，却没有人被评估具备这项能力——这是培养或引进要解决的",
    en: "The role is staffed, but no one has been assessed as having this capability — this needs development or hiring to fix",
  },
  "cap.group.singleTitle": { zh: "只靠 1 人", en: "Relies on 1 person" },
  "cap.group.singleDesc": {
    zh: "他一走，这项能力就断了",
    en: "If they leave, this capability is lost",
  },
  "cap.group.thinTitle": { zh: "人手偏少", en: "Understaffed" },
  "cap.group.thinDesc": {
    zh: "有人承载，但少于岗位编制需求",
    en: "Covered, but fewer people than the role's headcount requires",
  },
  "cap.group.coveredLabel": { zh: "已覆盖", en: "Covered" },
  "cap.group.items": { zh: "项", en: "items" },
  "cap.group.collapse": { zh: "收起", en: "Collapse" },
  "cap.group.expandPrefix": { zh: "展开其余", en: "Show" },
  "cap.group.expandSuffix": { zh: "项（重要度较低）", en: "more (lower priority)" },
  "cap.group.noProfile": {
    zh: "这个方向的岗位还没有填写画像信息，先去「战略岗位视图」补齐或用 AI 生成。",
    en: "This direction's roles don't have profile info yet — fill it in under \"Strategic Roles View\" or generate it with AI.",
  },

  "cap.footer.info": {
    zh: "能力项由岗位画像自动汇总（近义写法已合并），承载人来自任岗关系；「近期有建设」来自组织建设里记录的技术分享 / 培训 / 复盘 / 跨团队交流。岗位画像一改，这里就跟着变。",
    en: 'Capabilities are auto-aggregated from role profiles (similar wordings merged); carriers come from role assignments. "Recently built" comes from tech shares / training / retros / cross-team exchanges logged in Org Building. Any change to a role profile updates this view automatically.',
  },

  "cap.vacancyRow.prefix": { zh: "岗位「", en: 'Role "' },
  "cap.vacancyRow.suffix": { zh: "」尚未到岗", en: '" not yet filled' },
  "cap.vacancyRow.impactPrefix": { zh: "影响", en: "Affects" },
  "cap.vacancyRow.impactSuffix": { zh: "项能力", en: "capabilities" },
  "cap.vacancyRow.actionTitlePrefix": { zh: "推进「", en: 'Advance hiring for "' },
  "cap.vacancyRow.actionTitleSuffix": { zh: "」岗位招聘", en: '"' },
  "cap.vacancyRow.detailPrefix": { zh: "该岗位空缺影响", en: "This vacancy affects" },
  "cap.vacancyRow.detailMid": { zh: "项能力：", en: "capabilities:" },
  "cap.vacancyRow.actionLabel": { zh: "转为招聘待办", en: "Convert to hiring to-do" },

  "cap.kind.domain": { zh: "专业领域", en: "Domain" },
  "cap.kind.knowledge": { zh: "关键知识", en: "Key Knowledge" },
  "cap.kind.skill": { zh: "技能", en: "Skill" },
  "cap.kind.leadership": { zh: "领导力", en: "Leadership" },

  "cap.status.blank": { zh: "无人承载", en: "Uncovered" },

  "cap.caprow.merged": { zh: "已合并：", en: "Merged: " },
  "cap.caprow.built": { zh: "近期有建设", en: "Recently built" },
  "cap.caprow.times": { zh: "次", en: "x" },
  "cap.caprow.noCarrier": { zh: "暂无人选", en: "No one yet" },
  "cap.caprow.from": { zh: "来自", en: "From" },
  "cap.caprow.nextStep": { zh: "下一步：", en: "Next step: " },
  "cap.caprow.detail1": { zh: "能力「", en: 'Capability "' },
  "cap.caprow.detail2": { zh: "」当前状态：", en: '" current status: ' },
  "cap.caprow.detail3": { zh: "。来自岗位", en: ". From role(s)" },
  "cap.caprow.detail4": { zh: "；现有承载人：", en: "; current carriers: " },
  "cap.caprow.detail5": { zh: "。", en: "." },
  "cap.common.none": { zh: "无", en: "None" },

  "cap.suggestion.vacancy": {
    zh: "招到人即可解决，跟进招聘",
    en: "Resolved once hired; follow up on recruiting",
  },
  "cap.suggestion.blank": {
    zh: "现有人员没有这项能力：安排培训或外部引入",
    en: "No one currently has this capability: arrange training or bring in outside talent",
  },
  "cap.suggestion.single": {
    zh: "指定第二承载人，并安排一次内部技术分享",
    en: "Designate a second carrier and schedule an internal tech share",
  },
  "cap.suggestion.thin": { zh: "补充编制或交叉培养", en: "Add headcount or cross-train" },
  "cap.suggestion.depthGap": {
    zh: "深度不足：需要专家级培养或引进",
    en: "Insufficient depth: needs expert-level development or hiring",
  },
  "cap.suggestion.default": {
    zh: "保持现状，定期复核",
    en: "Maintain current state, review periodically",
  },

  "cap.tile.recentActivities": { zh: "近 90 天活动", en: "Activities (90d)" },
  "cap.tile.participation": { zh: "参与覆盖率", en: "Participation Rate" },
  "cap.tile.avgParticipation": { zh: "人均参与", en: "Avg per Person" },
  "cap.tile.dormant": { zh: "90 天未参与", en: "Inactive (90d)" },
  "cap.unit.session": { zh: "场", en: "" },
  "cap.unit.percent": { zh: "%", en: "%" },
  "cap.unit.times": { zh: "次", en: "" },
  "cap.unit.people": { zh: "人", en: "" },
  "cap.unit.minutes": { zh: "分钟", en: "min" },
  "cap.unit.periods": { zh: "期", en: "" },

  "cap.structure.title": { zh: "活动结构", en: "Activity Mix" },
  "cap.structure.desc": {
    zh: "氛围类（团建）和能力类（分享 / 培训）都需要，只有一种说明组织建设是偏的。",
    en: "You need both morale-building (team building) and capability-building (shares/training) activities; having only one means org building is skewed.",
  },
  "cap.structure.empty": {
    zh: "近 90 天还没有活动记录。",
    en: "No activities recorded in the last 90 days.",
  },

  "cap.vibe.title": { zh: "氛围信号", en: "Engagement Signals" },
  "cap.vibe.desc": {
    zh: "谁在参与，谁被落下了。",
    en: "Who's participating, and who's being left out.",
  },
  "cap.vibe.empty": { zh: "暂无参与记录。", en: "No participation records yet." },
  "cap.vibe.dormantTitle": {
    zh: "90 天内没参加过任何活动",
    en: "No activity participation in 90 days",
  },

  "cap.suggestBuild.title": { zh: "建议安排的建设动作", en: "Suggested Building Actions" },
  "cap.suggestBuild.desc": {
    zh: "以下能力目前只靠 1 个人，安排一次内部分享是成本最低的扩散方式。",
    en: "These capabilities currently rely on just one person; an internal share is the lowest-cost way to spread the knowledge.",
  },
  "cap.suggestBuild.carriedPrefix": { zh: "仅", en: "Only" },
  "cap.suggestBuild.carriedSuffix": { zh: "承载", en: "cover this" },
  "cap.suggestBuild.action": { zh: "安排分享", en: "Schedule a share" },

  "cap.records.title": { zh: "活动记录", en: "Activity Log" },
  "cap.records.add": { zh: "记录活动", en: "Log Activity" },
  "cap.records.empty": {
    zh: "还没有记录。把团建、技术分享、例会、培训记下来，组织建设才看得见。",
    en: "No records yet. Log team buildings, tech shares, meetings, and training so org building becomes visible.",
  },
  "cap.records.deleteTitle": { zh: "删除这条活动记录？", en: "Delete this activity record?" },
  "cap.records.deleteDesc": {
    zh: "删除后，这场活动的参与人记录也会一并移除，且无法恢复。",
    en: "Deleting will also remove this activity's participant records, and this cannot be undone.",
  },
  "cap.records.deleteConfirm": { zh: "确认删除", en: "Confirm Delete" },
  "cap.records.deleteToast": { zh: "已删除活动记录", en: "Activity record deleted" },
  "cap.records.hostPrefix": { zh: "组织者", en: "Host" },
  "cap.records.joinedPrefix": { zh: "参与", en: "Attended by" },
  "cap.records.joinedMid": { zh: "人：", en: ": " },
  "cap.records.capabilitiesPrefix": { zh: "能力：", en: "Capabilities: " },
  "cap.records.notes": { zh: "纪要", en: "Notes" },

  "cap.activityKind.team_building": { zh: "团建", en: "Team Building" },
  "cap.activityKind.tech_share": { zh: "技术分享", en: "Tech Share" },
  "cap.activityKind.meeting": { zh: "例会 / 评审", en: "Meeting / Review" },
  "cap.activityKind.training": { zh: "培训", en: "Training" },
  "cap.activityKind.retro": { zh: "复盘", en: "Retro" },
  "cap.activityKind.cross_team": { zh: "跨团队交流", en: "Cross-team Exchange" },
  "cap.activityKind.recruiting": { zh: "招聘宣讲", en: "Recruiting Talk" },

  "cap.trend.title": { zh: "组织能力趋势", en: "Capability Trend" },
  "cap.trend.desc": {
    zh: "系统里的数据都是「当前快照」。每周（或每次盘点后）记一次，就能看到覆盖率、在岗人数与建设活动的变化曲线。",
    en: 'Data in the system is always a "current snapshot". Record one each week (or after each review) to see how coverage rate, headcount, and building activities change over time.',
  },
  "cap.trend.save": { zh: "记录本期快照", en: "Record Snapshot" },
  "cap.trend.saveToast": { zh: "已记录本期快照", en: "Snapshot recorded" },
  "cap.trend.coverageRate": { zh: "能力覆盖率", en: "Coverage Rate" },
  "cap.trend.onboard": { zh: "在岗人数", en: "Onboard Headcount" },
  "cap.trend.blank": { zh: "无人承载", en: "Uncovered" },
  "cap.trend.activities90d": { zh: "90 天活动", en: "Activities (90d)" },
  "cap.trend.curveTitle": { zh: "覆盖率曲线", en: "Coverage Curve" },
  "cap.trend.curveAriaLabel": { zh: "能力覆盖率趋势", en: "Capability coverage trend" },
  "cap.trend.periodMid": { zh: "，共", en: ", " },
  "cap.trend.periodSuffix": { zh: "期", en: "periods total" },
  "cap.trend.needTwo": {
    zh: "至少记录 2 期快照后，这里会显示趋势曲线。",
    en: "Record at least 2 snapshots to see the trend curve here.",
  },
  "cap.trend.sinceFirst": { zh: "自首期", en: "since first period" },

  "cap.table.date": { zh: "日期", en: "Date" },
  "cap.table.coverageRate": { zh: "覆盖率", en: "Coverage Rate" },
  "cap.table.blank": { zh: "无人承载", en: "Uncovered" },
  "cap.table.single": { zh: "只靠 1 人", en: "Single-covered" },
  "cap.table.onboardVsTarget": { zh: "在岗 / 编制", en: "Onboard / Target" },
  "cap.table.activities90d": { zh: "90 天活动", en: "Activities (90d)" },

  "cap.status.single": { zh: "只靠 1 人", en: "Relies on 1 person" },
  "cap.status.thin": { zh: "人手偏少", en: "Understaffed" },
  "cap.status.covered": { zh: "已覆盖", en: "Covered" },

  "cap.statusHint.blank": {
    zh: "岗位要求该能力，但目前没有任何在岗人员承载",
    en: "The role requires this capability, but no onboard staff currently cover it",
  },
  "cap.statusHint.single": {
    zh: "仅 1 人承载，人一走能力即失守",
    en: "Only 1 person covers this; if they leave, the capability is lost",
  },
  "cap.statusHint.thin": {
    zh: "承载人数少于岗位编制需求",
    en: "Fewer carriers than the role's headcount requires",
  },
  "cap.statusHint.covered": {
    zh: "有足够人员承载该能力",
    en: "Enough people cover this capability",
  },

  "cap.activityKindHint.team_building": { zh: "增进氛围与信任", en: "Build morale and trust" },
  "cap.activityKindHint.tech_share": {
    zh: "能力扩散，降低单点风险",
    en: "Spread capability, reduce single-point risk",
  },
  "cap.activityKindHint.meeting": { zh: "对齐目标与进展", en: "Align on goals and progress" },
  "cap.activityKindHint.training": {
    zh: "定向补齐能力缺口",
    en: "Targeted closing of capability gaps",
  },
  "cap.activityKindHint.retro": { zh: "沉淀经验", en: "Capture lessons learned" },
  "cap.activityKindHint.cross_team": { zh: "打通外部资源", en: "Connect external resources" },
  "cap.activityKindHint.recruiting": { zh: "补齐空缺岗位", en: "Fill vacant roles" },

  "orgtree.missingField.role": { zh: "未匹配岗位", en: "No role matched" },
  "orgtree.missingField.node": { zh: "未归属团队", en: "No team assigned" },
  "orgtree.missingField.level": { zh: "缺职级", en: "Missing level" },
  "orgtree.missingField.performance": { zh: "缺绩效", en: "Missing performance" },
  "orgtree.missingField.readiness": { zh: "缺 Readiness", en: "Missing readiness" },
  "orgtree.missingField.skills": { zh: "缺技能评估", en: "Missing skill assessment" },
  "orgtree.missingField.tenure": { zh: "缺司龄", en: "Missing tenure" },
};
