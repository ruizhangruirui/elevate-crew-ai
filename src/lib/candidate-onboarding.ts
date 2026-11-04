import { z } from "zod";

export const onboardingDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Invalid start date").nullable();

export function onboardingDate(value: string): string | null {
  return onboardingDateSchema.parse(value.trim() || null);
}