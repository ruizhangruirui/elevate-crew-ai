# Growth & Development / Team & Performance 调整方案

## 目标结构

- 左侧 **Team & Culture Development** 改为 **Growth & Development（成长与发展）**。
- 左侧 **Performance & Growth** 改为 **Team & Performance（团队与绩效）**。
- 保持现有页面路径不变，避免已有链接失效。

## Growth & Development

- 新增“团队成果”区域，用来记录团队专利、论文、组织贡献等成果。
- 每条成果支持：成果类型、标题、日期、所属 Lab / Team、贡献人员、链接与备注。
- 成果类型不写死；在 Settings → Talent Configuration 中维护，默认提供 Patent、Publication、Team Contribution。
- 保留现有 Capability 内容，但改成中性“Capability”展示，不再出现 Gap、风险和缺口建议语言。
- 继续支持当前页面内按 Lab / Team 范围筛选。

## Team & Performance

- 保留现有绩效评估、成长记录和评估覆盖情况。
- 将原 Team & Culture 中的“团队 / 文化建设”活动记录移到这里。
- 将原“入离职追踪”及可调时间范围、离职原因分析移到这里。
- 页面内分为 Team & Culture、Joins & Exits、Performance 三个清晰区域，避免混排。

## Settings 与权限

- 新增 Team Achievement Types 配置组，由 Settings 中现有配置机制维护。
- 团队成果遵循现有权限范围：Owner / HR 可看全组织；Manager 只看和维护自己 Lab / Team 范围内的成果；Recruiter 不可访问。
- 所有新增、编辑、删除继续经过应用服务器权限检查，并记录操作时间与操作人。

## 技术说明

- 新增可迁移的 `team_achievements` 数据表，包含明确授权和访问限制；同时兼容公司内网 PostgreSQL 与当前回退数据层。
- 复用现有活动、参与人员和组织范围数据，不复制 Team & Culture 或 Joins & Exits 数据。
- 更新中英文导航、页面标题、标签和页面描述；英文统一使用 **Growth & Development** 与 **Team & Performance**。
- 完成后检查桌面和当前窄屏布局，并验证新增成果、配置类型、范围过滤和模块迁移后的主要流程。
