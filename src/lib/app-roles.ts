export const APP_ROLES = ["owner", "hr_director", "hr", "manager", "recruiter"] as const;
export type AppRole = (typeof APP_ROLES)[number];

/** Permission-equivalent roles; identity is preserved for display and auditing. */
export function isOwnerRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "hr_director";
}

export function roleAllowed(role: AppRole, allowed: readonly AppRole[]): boolean {
  return allowed.includes(role) || (isOwnerRole(role) && allowed.some(isOwnerRole));
}