import { supabase } from "@/integrations/supabase/client";
import type { Direction, Person, Role } from "./talent";
import { buildCapabilities } from "./capability";

export type OrgNode = {
  id: string;
  parent_id: string | null;
  name: string;
  type: string;
  mission: string | null;
  archived: boolean;
  sort_order: number;
};

export async function fetchOrgNodes() {
  const { data, error } = await supabase.from("org_nodes").select("*").order("sort_order");
  if (error) throw error;
  return (data ?? []).filter((n) => !n.archived) as OrgNode[];
}

export function childrenMap(nodes: OrgNode[]) {
  const map = new Map<string, OrgNode[]>();
  for (const n of nodes) {
    const key = n.parent_id ?? "__root";
    map.set(key, [...(map.get(key) ?? []), n]);
  }
  return map;
}

/** 含自身的所有后代节点 id */
export function subtreeIds(nodes: OrgNode[], id: string): string[] {
  const kids = childrenMap(nodes);
  const out: string[] = [];
  const walk = (nid: string) => {
    out.push(nid);
    for (const c of kids.get(nid) ?? []) walk(c.id);
  };
  walk(id);
  return out;
}

export function peopleInSubtree(people: Person[], nodes: OrgNode[], id: string) {
  const ids = new Set(subtreeIds(nodes, id));
  return people.filter((p) => p.org_node_id && ids.has(p.org_node_id));
}

export type NodeStats = {
  headcount: number;
  onboard: number;
  targetSeats: number;
  avgLevel: number | null;
  directions: Direction[];
  soleCarriers: number;
  coverageRate: number;
  unassessed: number;
};

export type StructureStats = Pick<
  NodeStats,
  "headcount" | "onboard" | "targetSeats" | "avgLevel" | "directions"
>;

/** 只算结构指标（人数/编制/职级/方向），能力类指标交给能力视图 */
export function structureStats(
  nodeId: string,
  nodes: OrgNode[],
  people: Person[],
  roles: Role[],
  directions: Direction[],
): StructureStats {
  const members = peopleInSubtree(people, nodes, nodeId);
  const onboard = members.filter((p) => p.status === "onboard");
  const roleIds = [...new Set(onboard.map((p) => p.role_id).filter(Boolean) as string[])];
  const scopedRoles = roles.filter((r) => roleIds.includes(r.id));
  const levels = onboard.map((p) => p.level).filter((l): l is number => l != null);
  const dirIds = [...new Set(scopedRoles.map((r) => r.direction_id))];

  return {
    headcount: members.length,
    onboard: onboard.length,
    targetSeats: scopedRoles.reduce((n, r) => n + r.target_count, 0),
    avgLevel: levels.length
      ? Math.round((levels.reduce((a, b) => a + b, 0) / levels.length) * 10) / 10
      : null,
    directions: directions.filter((d) => dirIds.includes(d.id)),
  };
}

/** 节点级统计：实际人数 vs 岗位编制、方向分布、单点风险、能力覆盖率 */
export function nodeStats(
  nodeId: string,
  nodes: OrgNode[],
  people: Person[],
  roles: Role[],
  directions: Direction[],
): NodeStats {
  const members = peopleInSubtree(people, nodes, nodeId);
  const onboard = members.filter((p) => p.status === "onboard");
  const roleIds = [...new Set(onboard.map((p) => p.role_id).filter(Boolean) as string[])];
  const scopedRoles = roles.filter((r) => roleIds.includes(r.id));

  const targetSeats = scopedRoles.reduce((n, r) => n + r.target_count, 0);
  const levels = onboard.map((p) => p.level).filter((l): l is number => l != null);
  const dirIds = [...new Set(scopedRoles.map((r) => r.direction_id))];

  const caps = scopedRoles.length ? buildCapabilities(scopedRoles, onboard) : [];
  const covered = caps.filter((c) => c.status === "covered").length;

  return {
    headcount: members.length,
    onboard: onboard.length,
    targetSeats,
    avgLevel: levels.length
      ? Math.round((levels.reduce((a, b) => a + b, 0) / levels.length) * 10) / 10
      : null,
    directions: directions.filter((d) => dirIds.includes(d.id)),
    soleCarriers: caps.filter((c) => c.status === "single").length,
    coverageRate: caps.length ? Math.round((covered / caps.length) * 100) : 0,
    unassessed: members.filter(
      (p) => !p.performance || p.readiness === "unknown" || (p.assessed_skills ?? []).length === 0,
    ).length,
  };
}

/* ------------------------------ 数据待补全清单 ------------------------------ */

export type MissingField =
  | "role"
  | "node"
  | "level"
  | "performance"
  | "readiness"
  | "skills"
  | "tenure";

/** 翻译 key，供 UI 层用 t() 取文案 */
export const missingFieldLabelKey: Record<MissingField, string> = {
  role: "orgtree.missingField.role",
  node: "orgtree.missingField.node",
  level: "orgtree.missingField.level",
  performance: "orgtree.missingField.performance",
  readiness: "orgtree.missingField.readiness",
  skills: "orgtree.missingField.skills",
  tenure: "orgtree.missingField.tenure",
};

/** 影响 AI 分析准确度的权重 */
const WEIGHT: Record<MissingField, number> = {
  skills: 4,
  role: 3,
  performance: 2,
  readiness: 2,
  node: 1,
  level: 1,
  tenure: 1,
};

export type CompletenessRow = { person: Person; missing: MissingField[]; weight: number };

export function completeness(people: Person[]) {
  const rows: CompletenessRow[] = people
    .filter((p) => p.status !== "left")
    .map((p) => {
      const missing: MissingField[] = [];
      if (!p.role_id) missing.push("role");
      if (!p.org_node_id) missing.push("node");
      if (p.level == null) missing.push("level");
      if (!p.performance) missing.push("performance");
      if (!p.readiness || p.readiness === "unknown") missing.push("readiness");
      if (((p.assessed_skills ?? []) as unknown[]).length === 0) missing.push("skills");
      if (p.tenure_months == null) missing.push("tenure");
      return { person: p, missing, weight: missing.reduce((n, m) => n + WEIGHT[m], 0) };
    })
    .filter((r) => r.missing.length > 0)
    .sort((a, b) => b.weight - a.weight);

  const maxWeight = Object.values(WEIGHT).reduce((a, b) => a + b, 0);
  const totalPeople = people.filter((p) => p.status !== "left").length;
  const lost = rows.reduce((n, r) => n + r.weight, 0);
  const score = totalPeople === 0 ? 100 : Math.max(0, Math.round((1 - lost / (totalPeople * maxWeight)) * 100));

  const byField = (Object.keys(missingFieldLabelKey) as MissingField[])
    .map((f) => ({ field: f, count: rows.filter((r) => r.missing.includes(f)).length }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);

  return { rows, score, byField, totalPeople };
}
