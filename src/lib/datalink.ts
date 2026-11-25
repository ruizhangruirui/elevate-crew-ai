/** Datalink: company tool where offer approvals run. */
export const DATALINK_URL =
  "https://datalink-de.gtsdata.huawei.com/datalinkpro/web/#/form/formList/formTaskReport?workSpaceId=Dlink_97046&appId=13280046&formId=DDD283E74AC0496E866348EFBE201CB1&type=5&isCenter=formList&menu=5";

/** The "Start offer approval" link is offered once the decision is to issue an offer. */
export const needsOfferApproval = (outcome: string) => outcome === "offer";

/** Reads a dotted path such as "data.result.id" from an API response. */
export function pickPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".").filter(Boolean)) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Renames offer fields to Datalink form field names; unmapped fields keep their own name. */
export function mapFields(
  terms: Record<string, unknown>,
  map: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(terms)) out[map[k] ?? k] = v;
  return out;
}

export type DatalinkPhase = "pending" | "approved" | "rejected" | "withdrawn" | "unknown";

/** Normalises a Datalink status word into one of our display phases. */
export function datalinkPhase(status: string | null | undefined): DatalinkPhase {
  const s = (status ?? "").toLowerCase().trim();
  if (!s) return "unknown";
  if (/(reject|refuse|deny|denied|驳回|拒绝|不通过)/.test(s)) return "rejected";
  if (/(withdraw|cancel|revoke|撤回|取消)/.test(s)) return "withdrawn";
  if (/(approved|pass|complete|finish|done|通过|完成|结束)/.test(s)) return "approved";
  if (/(pending|process|running|review|approving|submit|审批中|进行中|待审)/.test(s))
    return "pending";
  return "unknown";
}

/** Fills {id} in a configured path. */
export const fillPath = (path: string, id: string) => path.replace("{id}", encodeURIComponent(id));
