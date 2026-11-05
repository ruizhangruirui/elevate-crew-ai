export type RecruitingRoleStatus = "open" | "to_onboard" | "filled";

export function recruitingRoleStatus(gap: number, awaitingOnboarding: number): RecruitingRoleStatus {
  if (awaitingOnboarding > 0) return "to_onboard";
  return gap > 0 ? "open" : "filled";
}