/**
 * Inbox-staged candidates from TeamTailor default to low priority so they sort
 * to the bottom of the Recruiting list. A recruiter-raised priority (high/low)
 * is never overwritten; only the default (medium) is downgraded to low.
 */
export function inboxDefaultPriority(stage: string | null | undefined, current?: string | null): string | undefined {
  const s = (stage ?? "").trim().toLowerCase();
  if (s !== "inbox") return undefined;
  const cur = (current ?? "").trim().toLowerCase();
  if (cur === "low" || cur === "high") return undefined;
  return "low";
}
