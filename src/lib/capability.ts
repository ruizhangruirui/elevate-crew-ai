import type { Direction, Person, Role, Skill } from "./talent";

/**
 * L0 组织能力层：完全由现有岗位画像（专业领域 / 关键知识 / 技能 / 领导力）
 * 与人员任岗关系派生，不需要任何额外的人工维护。
 */

export type CapabilityKind = "domain" | "knowledge" | "skill" | "leadership";

export const kindLabel: Record<CapabilityKind, string> = {
  domain: "专业领域",
  knowledge: "关键知识",
  skill: "技能",
  leadership: "领导力",
};

export type CapabilityStatus = "blank" | "single" | "thin" | "covered";

export const statusMeta: Record<
  CapabilityStatus,
  { label: string; tone: "ok" | "warn" | "danger" | "muted"; hint: string }
> = {
  blank: {
    label: "无人承载",
    tone: "danger",
    hint: "岗位要求该能力，但目前没有任何在岗人员承载",
  },
  single: { label: "只靠 1 人", tone: "warn", hint: "仅 1 人承载，人一走能力即失守" },
  thin: { label: "人手偏少", tone: "warn", hint: "承载人数少于岗位编制需求" },
  covered: { label: "已覆盖", tone: "ok", hint: "有足够人员承载该能力" },
};

const LEVEL_RANK: Record<string, number> = { proficient: 1, advanced: 2, expert: 3 };

export function levelRank(level?: string | null) {
  return LEVEL_RANK[String(level ?? "").trim().toLowerCase()] ?? 0;
}

export function normalizeKey(raw: string) {
  return raw
    .toLowerCase()
    .replace(/[（）()【】\[\]{}・·,，。.、/\\|:：;；'"“”‘’!！?？\-_+~*#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type CapabilityCarrier = {
  person: Person;
  /** 该人员的评估技能里是否明确记录了这项能力 */
  assessed: boolean;
  assessedLevel: string | null;
};

/** 缺口根因：岗位还没人到岗 vs 人在但能力不在 */
export type CapabilityRootCause = "vacancy" | "gap" | "none";

export type Capability = {
  key: string;
  label: string;
  kind: CapabilityKind;
  directionIds: string[];
  roleIds: string[];
  roleTitles: string[];
  /** 合并进来的近义写法 */
  aliases: string[];
  /** 要求的最高熟练度（仅技能类有值） */
  requiredLevel: string | null;
  /** 承载该能力的岗位编制总数 */
  targetSeats: number;
  carriers: CapabilityCarrier[];
  status: CapabilityStatus;
  /** 多个岗位重复要求同一能力 */
  overlap: boolean;
  /** 要求 Expert，但无人被评估到该等级 */
  depthGap: boolean;
  rootCause: CapabilityRootCause;
  /** 造成 vacancy 的空缺岗位 */
  vacantRoleIds: string[];
  /** 重要度权重，用于排序与折叠低信号条目 */
  priority: number;
  /** 下一步建议 */
  suggestion: string;
};

type Bucket = {
  key: string;
  label: string;
  kind: CapabilityKind;
  directionIds: Set<string>;
  roles: Role[];
  requiredRank: number;
  requiredLevel: string | null;
  aliases: Set<string>;
};

function itemsOfRole(role: Role): { label: string; kind: CapabilityKind; level?: string }[] {
  const out: { label: string; kind: CapabilityKind; level?: string }[] = [];
  for (const d of role.domains ?? []) out.push({ label: d, kind: "domain" });
  for (const k of role.knowledge ?? []) out.push({ label: k, kind: "knowledge" });
  for (const l of role.leadership ?? []) out.push({ label: l, kind: "leadership" });
  for (const s of (role.skills ?? []) as Skill[]) {
    if (s?.skill) out.push({ label: s.skill, kind: "skill", level: s.level });
  }
  return out.filter((i) => normalizeKey(i.label).length > 0);
}

function matchAssessed(person: Person, capKey: string) {
  const list = (person.assessed_skills ?? []) as Skill[];
  for (const s of list) {
    if (!s?.skill) continue;
    const k = normalizeKey(s.skill);
    if (k === capKey || k.includes(capKey) || capKey.includes(k)) {
      return { assessed: true, assessedLevel: s.level ?? null };
    }
  }
  return { assessed: false, assessedLevel: null };
}

const CRITICALITY_WEIGHT: Record<string, number> = {
  strategic_critical: 3,
  critical: 2,
  important: 1,
};

/** 近义合并：同类型下，若一个写法包含另一个（如「NPU 架构」/「NPU 架构设计」），归并到较短的那个 */
function canonicalKeyFor(buckets: Map<string, Bucket>, kind: CapabilityKind, norm: string) {
  for (const b of buckets.values()) {
    if (b.kind !== kind) continue;
    const other = b.key.slice(kind.length + 1);
    if (other === norm) return b.key;
    if (norm.length >= 3 && other.length >= 3 && (other.includes(norm) || norm.includes(other))) {
      return b.key;
    }
  }
  return null;
}

export function buildCapabilities(roles: Role[], people: Person[]): Capability[] {
  const buckets = new Map<string, Bucket>();

  for (const role of roles) {
    for (const item of itemsOfRole(role)) {
      const norm = normalizeKey(item.label);
      const existingKey = canonicalKeyFor(buckets, item.kind, norm);
      const key = existingKey ?? `${item.kind}:${norm}`;
      let b = buckets.get(key);
      if (!b) {
        b = {
          key,
          label: item.label.trim(),
          kind: item.kind,
          directionIds: new Set(),
          roles: [],
          requiredRank: 0,
          requiredLevel: null,
          aliases: new Set(),
        };
        buckets.set(key, b);
      }
      if (normalizeKey(b.label) !== norm) b.aliases.add(item.label.trim());
      // 保留更短的写法作为主名
      if (item.label.trim().length < b.label.length) {
        b.aliases.add(b.label);
        b.label = item.label.trim();
        b.aliases.delete(b.label);
      }
      b.directionIds.add(role.direction_id);
      if (!b.roles.some((r) => r.id === role.id)) b.roles.push(role);
      const rank = levelRank(item.level);
      if (rank > b.requiredRank) {
        b.requiredRank = rank;
        b.requiredLevel = item.level ?? null;
      }
    }
  }

  const onboard = people.filter((p) => p.status === "onboard");

  return [...buckets.values()]
    .map<Capability>((b) => {
      const roleIds = b.roles.map((r) => r.id);
      const targetSeats = b.roles.reduce((n, r) => n + r.target_count, 0);
      const capKey = b.key.split(":").slice(1).join(":");

      const carriers = onboard
        .filter((p) => p.role_id && roleIds.includes(p.role_id))
        .map<CapabilityCarrier>((p) => ({ person: p, ...matchAssessed(p, capKey) }));

      const status: CapabilityStatus =
        carriers.length === 0
          ? "blank"
          : carriers.length === 1
            ? "single"
            : carriers.length < targetSeats
              ? "thin"
              : "covered";

      const depthGap =
        b.requiredRank >= 3 &&
        carriers.length > 0 &&
        !carriers.some((c) => levelRank(c.assessedLevel) >= 3);

      const vacantRoles = b.roles.filter(
        (r) => !onboard.some((p) => p.role_id === r.id),
      );
      const rootCause: CapabilityRootCause =
        status !== "blank" ? "none" : vacantRoles.length === b.roles.length ? "vacancy" : "gap";

      const critWeight = Math.max(
        1,
        ...b.roles.map((r) => CRITICALITY_WEIGHT[r.criticality] ?? 1),
      );
      const statusWeight =
        status === "blank" ? 3 : status === "single" ? 2 : status === "thin" ? 1 : 0;
      const priority =
        critWeight * 3 + statusWeight * 2 + b.requiredRank + Math.min(b.roles.length, 3);

      const suggestion =
        rootCause === "vacancy"
          ? "招到人即可解决，跟进招聘"
          : status === "blank"
            ? "现有人员没有这项能力：安排培训或外部引入"
            : status === "single"
              ? "指定第二承载人，并安排一次内部技术分享"
              : status === "thin"
                ? "补充编制或交叉培养"
                : depthGap
                  ? "深度不足：需要专家级培养或引进"
                  : "保持现状，定期复核";

      return {
        key: b.key,
        label: b.label,
        kind: b.kind,
        directionIds: [...b.directionIds],
        roleIds,
        roleTitles: b.roles.map((r) => r.title),
        aliases: [...b.aliases],
        requiredLevel: b.requiredLevel,
        targetSeats,
        carriers,
        status,
        overlap: b.roles.length >= 3,
        depthGap,
        rootCause,
        vacantRoleIds: vacantRoles.map((r) => r.id),
        priority,
        suggestion,
      };
    })
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        a.kind.localeCompare(b.kind) ||
        a.label.localeCompare(b.label, "zh"),
    );
}

export type CapabilityHealth = {
  total: number;
  covered: number;
  blank: number;
  single: number;
  thin: number;
  depthGaps: number;
  overlaps: number;
  shared: number;
  coverageRate: number;
  /** 靠招聘解决的（岗位空缺导致） */
  vacancyDriven: number;
  /** 人在、能力不在，需要现有团队补齐 */
  realGaps: number;
};

export function capabilityHealth(caps: Capability[]): CapabilityHealth {
  const total = caps.length;
  const covered = caps.filter((c) => c.status === "covered").length;
  return {
    total,
    covered,
    blank: caps.filter((c) => c.status === "blank").length,
    single: caps.filter((c) => c.status === "single").length,
    thin: caps.filter((c) => c.status === "thin").length,
    depthGaps: caps.filter((c) => c.depthGap).length,
    overlaps: caps.filter((c) => c.overlap).length,
    shared: caps.filter((c) => c.directionIds.length >= 2).length,
    coverageRate: total === 0 ? 0 : Math.round((covered / total) * 100),
    vacancyDriven: caps.filter((c) => c.rootCause === "vacancy").length,
    realGaps: caps.filter((c) => c.rootCause === "gap" || c.status === "single" || c.status === "thin")
      .length,
  };
}

/** 把「岗位空缺导致」的能力按空缺岗位收敛成根因卡片 */
export type VacancyCluster = {
  role: Role;
  caps: Capability[];
};

export function vacancyClusters(caps: Capability[], roles: Role[]): VacancyCluster[] {
  const map = new Map<string, Capability[]>();
  for (const c of caps) {
    if (c.rootCause !== "vacancy") continue;
    for (const rid of c.vacantRoleIds) {
      const list = map.get(rid) ?? [];
      list.push(c);
      map.set(rid, list);
    }
  }
  return [...map.entries()]
    .map(([rid, list]) => ({ role: roles.find((r) => r.id === rid)!, caps: list }))
    .filter((c) => Boolean(c.role))
    .sort((a, b) => b.caps.length - a.caps.length);
}

export type DirectionCapabilityStat = {
  direction: Direction;
  total: number;
  blank: number;
  single: number;
  coverageRate: number;
};

export function directionStats(
  directions: Direction[],
  caps: Capability[],
): DirectionCapabilityStat[] {
  return directions.map((direction) => {
    const list = caps.filter((c) => c.directionIds.includes(direction.id));
    const covered = list.filter((c) => c.status === "covered").length;
    return {
      direction,
      total: list.length,
      blank: list.filter((c) => c.status === "blank").length,
      single: list.filter((c) => c.status === "single").length,
      coverageRate: list.length === 0 ? 0 : Math.round((covered / list.length) * 100),
    };
  });
}