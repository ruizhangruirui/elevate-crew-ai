import type { Dict } from "../i18n-types";

export const coreDict: Dict = {
  // ---- nav / shell ----
  "nav.index": { zh: "战略岗位视图", en: "Strategic Roles" },
  "nav.capability": { zh: "团队与文化发展", en: "Team & Culture" },
  "nav.org": { zh: "组织视图", en: "Org Structure" },
  "nav.people": { zh: "人员视图", en: "People" },
  "nav.actions": { zh: "待办中心", en: "Action Center" },
  "nav.settings": { zh: "系统设置", en: "Settings" },
  "shell.brand": { zh: "战略岗位与人才", en: "Talent Architecture" },
  "shell.brandSub": { zh: "Talent Architecture", en: "Strategic Roles & Talent" },
  "shell.signOut": { zh: "退出登录", en: "Sign out" },
  "shell.language": { zh: "语言", en: "Language" },

  // ---- common ----
  "common.loading": { zh: "加载中…", en: "Loading…" },
  "common.people": { zh: "人", en: "people" },
  "common.expandAll": { zh: "展开全部", en: "Expand all" },
  "common.collapse": { zh: "收起", en: "Collapse" },
  "common.chartView": { zh: "架构图", en: "Chart" },
  "common.listView": { zh: "列表", en: "List" },
  "common.candidate": { zh: "候选人", en: "Candidate" },
  "common.vacantSeat": { zh: "空缺席位", en: "Vacant seat" },

  // ---- org chart ----
  "chart.search": { zh: "搜人 / 团队 / 岗位", en: "Search people / team / role" },
  "chart.tree": { zh: "树状", en: "Tree" },
  "chart.compact": { zh: "紧凑", en: "Compact" },
  "chart.wholeOrg": { zh: "全组织", en: "Whole org" },
  "chart.focusHint": { zh: "双击节点可聚焦到该分支", en: "Double-click a node to focus on it" },

  // ---- org view ----
  "org.title": { zh: "组织视图", en: "Org Structure" },
  "org.subtitle": {
    zh: "系统设置里维护的 Lab / Team 结构，在这里逐层展开：团队下挂着岗位（含空缺席位），岗位下挂着人。",
    en: "The Lab / Team structure maintained in Settings, expanded layer by layer: teams hold roles (including vacant seats), roles hold people.",
  },
  "org.metaDesc": {
    zh: "从 Lab 到 Team 到人，逐层展开组织结构，点开成员查看岗位、技能与能力承载详情。",
    en: "Expand the organization from Lab to Team to person, and open any member for role, skill and capability details.",
  },
  "org.stat.nodes": { zh: "组织节点", en: "Org nodes" },
  "org.stat.assigned": { zh: "已归属成员", en: "Assigned members" },
  "org.stat.unassigned": { zh: "未归属成员", en: "Unassigned members" },
  "org.aiDiagnosis": { zh: "AI 诊断", en: "AI diagnosis" },
  "org.onboard": { zh: "在岗", en: "Onboard" },
  "org.target": { zh: "编制", en: "Target" },
  "org.avgLevel": { zh: "平均职级", en: "Avg. level" },
  "org.directions": { zh: "承担方向", en: "Directions" },
  "org.viewCapability": { zh: "查看该团队能力体检", en: "View capability check" },
  "org.roleProfile": { zh: "岗位画像", en: "Role profile" },
  "org.noSeats": { zh: "暂无席位。", en: "No seats yet." },
  "org.emptyNode": {
    zh: "该节点下暂无子团队或成员。",
    en: "No sub-teams or members under this node.",
  },
  "org.emptyTree": {
    zh: "还没有组织结构，请先在「系统设置 → 组织管理」中创建 Lab 与 Team。",
    en: "No org structure yet. Create Labs and Teams in Settings → Organization first.",
  },
  "org.unplacedRoles": { zh: "未挂载到团队的岗位", en: "Roles not attached to a team" },
  "org.unplacedRolesHint": {
    zh: "这些岗位还没有在岗人员、也未指定团队，指定后会出现在组织树对应团队下（含空缺席位）。",
    en: "These roles have no onboard members and no team yet. Once assigned they appear under that team in the tree, with vacant seats.",
  },
  "org.attachToTeam": { zh: "挂到团队", en: "Attach to team" },
  "org.unassignedTitle": { zh: "未归属成员", en: "Unassigned members" },
  "org.unassignedHint": {
    zh: "为他们指定所属 Lab / Team，组织树就会自动关联。",
    en: "Assign them to a Lab / Team and the tree will link them automatically.",
  },
  "org.selectTeam": { zh: "选择所属团队", en: "Select a team" },
  "org.noStrategicRole": { zh: "未匹配战略岗位", en: "No strategic role" },
  "org.roleAttached": { zh: "岗位归属已更新", en: "Role placement updated" },
  "org.personAssigned": { zh: "归属已更新", en: "Assignment updated" },
  "importance.core": { zh: "核心", en: "Core" },
  "importance.key": { zh: "关键", en: "Key" },
  "importance.standard": { zh: "一般", en: "Standard" },
  "importance.peripheral": { zh: "边缘", en: "Peripheral" },
  "importance.label": { zh: "重要性", en: "Importance" },
  "importance.auto": { zh: "自动推导", en: "Auto (derived)" },
  "importance.autoHint": {
    zh: "自动：领导职务或高职级视为核心，外包/实习/访问学者视为边缘",
    en: "Auto: leadership or senior level counts as core; outsourced/intern/visiting counts as peripheral",
  },
  "importance.isLeader": { zh: "担任领导职务", en: "Holds a leadership position" },
  "importance.leaderBadge": { zh: "领导", en: "Leader" },
  "common.yes": { zh: "是", en: "Yes" },
  "common.no": { zh: "否", en: "No" },

  // ---- unified interaction rules ----
  "ui.save": { zh: "保存", en: "Save" },
  "ui.saving": { zh: "保存中…", en: "Saving…" },
  "ui.cancel": { zh: "取消", en: "Cancel" },
  "ui.saveHint": {
    zh: "点「保存」后才会写入，取消则丢弃本次修改。",
    en: "Nothing is written until you press Save; Cancel discards these changes.",
  },
  "ui.undo": { zh: "撤销", en: "Undo" },
  "ui.restore": { zh: "恢复", en: "Restore" },
  "ui.restored": { zh: "已恢复", en: "Restored" },
  "ui.archiveBin": { zh: "已归档", en: "Archived" },
  "ui.archiveBinHint": {
    zh: "归档不是删除：这里的方向与岗位随时可以恢复，恢复后重新计入覆盖统计。",
    en: "Archiving is not deleting: directions and roles here can be restored anytime and will count toward coverage again.",
  },
  "ui.archiveBinEmpty": { zh: "还没有归档内容。", en: "Nothing archived yet." },
  "ui.archivedDirections": { zh: "已归档方向", en: "Archived directions" },
  "ui.archivedRoles": { zh: "已归档岗位", en: "Archived roles" },
  "ui.undoHint": { zh: "可在提示中撤销，或到「已归档」里恢复。", en: "Undo from the toast, or restore later from Archived." },
};

