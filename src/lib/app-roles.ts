export const APP_ROLES = ["owner", "hr_director", "hr", "manager", "recruiter"] as const;
export type AppRole = (typeof APP_ROLES)[number];

/** Permission-equivalent roles; identity is preserved for display and auditing. */
export function isOwnerRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "hr_director";
}

/** Position approvals are delegated to HRD, separately from general administration. */
export function canApprovePositions(role: string | null | undefined): boolean {
  return role === "hr_director";
}

export const POSITION_APPROVAL_OWNER = "HR Director";

export function positionApprovalAction<T extends { source_kind?: string; owner?: string | null }>(action: T): T {
  return action.source_kind === "position_approval" ? { ...action, owner: POSITION_APPROVAL_OWNER } : action;
}

export function roleAllowed(role: AppRole, allowed: readonly AppRole[]): boolean {
  return allowed.includes(role) || (isOwnerRole(role) && allowed.some(isOwnerRole));
}