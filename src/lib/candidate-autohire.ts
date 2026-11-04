/** A "To onboard" candidate is due once their planned start date is today or earlier. */
export function isDueForOnboarding(c: { outcome: string; onboarding_on: string | null }, today: string): boolean {
  return c.outcome === "to_onboard" && !!c.onboarding_on && c.onboarding_on <= today;
}
