/** Contract types are stored as these stable codes; labels are translated. */
export const CONTRACTS = [
  "Employee",
  "Leased via Connect 44",
  "Leased via Hays",
  "Intern",
  "Consultant",
] as const;
export type ContractType = (typeof CONTRACTS)[number];

const CONTRACT_KEYS: Record<string, string> = {
  Employee: "contract.employee",
  "Leased via Connect 44": "contract.connect44",
  "Leased via Hays": "contract.hays",
  Intern: "contract.intern",
  Consultant: "contract.consultant",
};

export function contractLabel(t: (k: string) => string, value?: string | null): string | null {
  if (!value) return null;
  const key = CONTRACT_KEYS[value];
  return key ? t(key) : value;
}

/** Leased staff and interns are not expected to hold strategic roles. */
export const PERIPHERAL_CONTRACTS = new Set<string>(["Leased via Connect 44", "Leased via Hays", "Intern"]);

/** Interns and leased staff carry no position, so never flag them as role-less. */
export function roleExpected(contract?: string | null): boolean {
  return !PERIPHERAL_CONTRACTS.has(contract ?? "");
}

/** Whole months between hire date and today. */
export function tenureMonths(hireDate?: string | null): number | null {
  if (!hireDate) return null;
  const d = new Date(hireDate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const m = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()) - (now.getDate() < d.getDate() ? 1 : 0);
  return Math.max(0, m);
}

export function tenureLabel(t: (k: string) => string, months: number | null): string {
  if (months == null) return "—";
  const y = Math.floor(months / 12);
  const m = months % 12;
  return t("tenure.fmt").replace("{y}", String(y)).replace("{m}", String(m));
}

type Node = { id: string; parent_id: string | null; type: string; name: string };
/** Resolve a person's org node into its Lab and Team. */
export function labTeamOf(nodes: Node[], nodeId?: string | null): { lab: Node | null; team: Node | null } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let cur = nodeId ? byId.get(nodeId) : undefined;
  let team: Node | null = null;
  let lab: Node | null = null;
  while (cur) {
    if (cur.type === "Team" && !team) team = cur;
    if (cur.type === "Lab") { lab = cur; break; }
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return { lab, team };
}

/** Only leased staff and interns can be on a fixed-term contract. */
export function allowsFixedTerm(contract?: string | null): boolean {
  return !!contract && PERIPHERAL_CONTRACTS.has(contract);
}

/** Normalise fixed-term fields before saving; returns an error key when invalid. */
export function fixedTermFields(
  contract: string | null,
  fixedTerm: boolean,
  endOn: string | null,
): { fixed_term: boolean; contract_end_on: string | null } | { error: string } {
  if (!allowsFixedTerm(contract) || !fixedTerm) return { fixed_term: false, contract_end_on: null };
  if (!endOn || !/^\d{4}-\d{2}-\d{2}$/.test(endOn)) return { error: "cm.err.endDate" };
  return { fixed_term: true, contract_end_on: endOn };
}

/** Whole months between two dates (start → end), null when either is missing/invalid. */
export function monthsBetween(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  const m = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) - (e.getDate() < s.getDate() ? 1 : 0);
  return Math.max(0, m);
}

/** Contract duration label, e.g. "6 个月" / "1 年 6 个月" ("6m" / "1y 6m"). */
export function durationLabel(t: (k: string) => string, months: number | null): string {
  if (months == null) return "—";
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y > 0 && m > 0) return t("cm.dur.ym").replace("{y}", String(y)).replace("{m}", String(m));
  if (y > 0) return t("cm.dur.y").replace("{y}", String(y));
  return t("cm.dur.m").replace("{m}", String(m));
}

/** Whole days from today until the date (negative when past). */
export function daysUntil(date: string, today = new Date()): number {
  const d = new Date(`${date}T00:00:00`);
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d.getTime() - t0.getTime()) / 86400000);
}
