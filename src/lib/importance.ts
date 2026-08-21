import type { Person, Role } from "@/lib/talent";

/**
 * 人员重要性：手动指定优先，未指定（auto）时按「是否担任领导职务 / 级别 / 合同类型 / 所在岗位关键度」推导。
 * 用于区分「战略岗位理想状态」与「组织实际人员构成」——外包、实习生等不承担战略岗位属正常现象。
 */
export type Importance = "core" | "key" | "standard" | "peripheral";

const PERIPHERAL_CONTRACTS = new Set(["外包", "实习生", "访问学者"]);

export function deriveImportance(person: Person, roles: Role[] = []): Importance {
  if (person.is_leader) return "core";
  const level = person.level ?? 0;
  if (level >= 16) return "core";

  const contract = person.contract_type ?? "";
  if (PERIPHERAL_CONTRACTS.has(contract)) return "peripheral";

  const role = roles.find((r) => r.id === person.role_id);
  if (level >= 15) return "key";
  if (role && (role.criticality === "strategic_critical" || role.criticality === "critical")) {
    return "key";
  }
  return "standard";
}

export function effectiveImportance(person: Person, roles: Role[] = []): Importance {
  const raw = person.importance ?? "auto";
  if (raw === "core" || raw === "key" || raw === "standard" || raw === "peripheral") return raw;
  return deriveImportance(person, roles);
}

export function importanceLabel(t: (k: string) => string, value: Importance): string {
  return t(`importance.${value}`);
}

export const IMPORTANCE_TONE: Record<Importance, string> = {
  core: "bg-brand/12 text-brand",
  key: "bg-ok/12 text-ok",
  standard: "bg-muted text-muted-foreground",
  peripheral: "bg-muted/60 text-muted-foreground",
};

/** 重要性对「单点承载风险」的权重：越重要的人离开影响越大。 */
export const IMPORTANCE_WEIGHT: Record<Importance, number> = {
  core: 3,
  key: 2,
  standard: 1,
  peripheral: 0,
};
