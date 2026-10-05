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
