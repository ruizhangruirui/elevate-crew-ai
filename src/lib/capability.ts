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
    label: "结构性空白",
    tone: "danger",
    hint: "岗位要求该能力，但目前没有任何在岗人员承载",
  },
  single: { label: "单点风险", tone: "warn", hint: "仅 1 人承载，人一走能力即失守" },
  thin: { label: "偏薄", tone: "warn", hint: "承载人数少于岗位编制需求" },
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

export type Capability = {
  key: string;
  label: string;
  kind: CapabilityKind;
  directionIds: string[];
  roleIds: string[];
  roleTitles: string[];
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
};

type Bucket = {
  key: string;
  label: string;
  kind: CapabilityKind;
  directionIds: Set<string>;
  roles: Role[];
  requiredRank: number;
  requiredLevel: string | null;
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

export function buildCapabilities(roles: Role[], people: Person[]): Capability[] {
  const buckets = new Map<string, Bucket>();

  for (const role of roles) {
    for (const item of itemsOfRole(role)) {
      const key = `${item.kind}:${normalizeKey(item.label)}`;
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
        };
        buckets.set(key, b);
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

      return {
        key: b.key,
        label: b.label,
        kind: b.kind,
        directionIds: [...b.directionIds],
        roleIds,
        roleTitles: b.roles.map((r) => r.title),
        requiredLevel: b.requiredLevel,
        targetSeats,
        carriers,
        status,
        overlap: b.roles.length >= 3,
        depthGap,
      };
    })
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label, "zh"));
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
  };
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