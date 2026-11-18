import { z } from "zod";
import { monthsBetween } from "./contract";

export const OFFER_STAGES = ["Offer approval", "Offer sent", "Offer accepted"] as const;
export const OFFER_STATES = [
  "draft",
  "hiring_manager",
  "lab_director",
  "hrd",
  "approved",
  "rejected",
  "sent",
  "accepted",
  "onboarded",
] as const;
export type OfferState = (typeof OFFER_STATES)[number];
const text = z.string().trim().max(2000).default("");
export const offerTermsSchema = z.object({
  candidate_name: text,
  job_title: text,
  job_level: text,
  salary_information: text,
  additional_salary: text,
  contract_term: z.enum(["fixed_term", "open_ended"]),
  duration_months: text,
  start_date: text,
  end_date: text,
  supervisor_id: text,
  workload: text,
  contract_type: text,
  project_code: text,
  technical_interviewer: text,
  hr_interviewer: text,
  comprehensive_interviewer: text,
});
export type OfferTerms = z.infer<typeof offerTermsSchema>;
export type OfferAccount = {
  id: string;
  name: string;
  email: string;
  role: string;
  scope_node_ids: string[];
};
export type OfferRequest = {
  id: string;
  candidate_id: string;
  role_id: string;
  org_node_id: string | null;
  lab_id: string;
  recruiter_user_id: string;
  hiring_manager_user_id: string | null;
  lab_director_user_id: string | null;
  hrd_user_id: string | null;
  terms: OfferTerms | null;
  state: OfferState;
  revision: number;
  round: number;
  updated_at: string;
  candidate_name: string;
  job_title: string;
  lab_name: string;
  recruiter_name: string;
  can_edit: boolean;
  can_decide: boolean;
  recipient: { name: string; email: string } | null;
};
export type OfferJson =
  string | number | boolean | null | OfferJson[] | { [key: string]: OfferJson };
export type OfferEvent = {
  id: string;
  revision: number;
  round: number;
  actor_name: string;
  kind: string;
  from_state: string | null;
  to_state: string;
  changes: Record<string, { before: OfferJson; after: OfferJson }>;
  terms_snapshot: OfferTerms;
  note: string | null;
  created_at: string;
};
export const emptyOfferTerms: OfferTerms = {
  candidate_name: "",
  job_title: "",
  job_level: "",
  salary_information: "",
  additional_salary: "",
  contract_term: "open_ended",
  duration_months: "",
  start_date: "",
  end_date: "",
  supervisor_id: "",
  workload: "100",
  contract_type: "Employee",
  project_code: "",
  technical_interviewer: "",
  hr_interviewer: "",
  comprehensive_interviewer: "",
};
export function currentOfferApprover(o: {
  state: string;
  hiring_manager_user_id: string | null;
  lab_director_user_id: string | null;
  hrd_user_id: string | null;
  recruiter_user_id: string;
}) {
  if (o.state === "hiring_manager") return o.hiring_manager_user_id;
  if (o.state === "lab_director") return o.lab_director_user_id;
  if (o.state === "hrd") return o.hrd_user_id;
  if (["approved", "rejected", "draft", "sent"].includes(o.state)) return o.recruiter_user_id;
  return null;
}
export function canEditOffer(
  user: { id: string; role: string },
  o: { recruiter_user_id: string; state: string },
) {
  return (
    user.role === "recruiter" &&
    o.recruiter_user_id === user.id &&
    !["accepted", "onboarded"].includes(o.state)
  );
}
export function canDecideOffer(
  user: { id: string; role: string },
  o: Parameters<typeof currentOfferApprover>[0],
) {
  return (
    ["hiring_manager", "lab_director", "hrd"].includes(o.state) &&
    currentOfferApprover(o) === user.id &&
    user.role === (o.state === "hrd" ? "hr_director" : "manager")
  );
}
export function fullOfferAccess(
  user: { id: string; role: string },
  o: Parameters<typeof currentOfferApprover>[0],
  hrInScope: boolean,
) {
  return (
    ["owner", "hr_director"].includes(user.role) ||
    (user.role === "hr" && hrInScope) ||
    [o.recruiter_user_id, o.hiring_manager_user_id, o.lab_director_user_id, o.hrd_user_id].includes(
      user.id,
    )
  );
}
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function validateOfferTerms(t: OfferTerms, submitted: boolean) {
  if (!t.candidate_name.trim()) throw new Error("Candidate name is required");
  if (t.start_date && !validDate(t.start_date)) throw new Error("Invalid start date");
  if (t.end_date && !validDate(t.end_date)) throw new Error("Invalid end date");
  if (t.end_date && t.start_date && t.end_date <= t.start_date)
    throw new Error("End date must be after start date");
  if (t.contract_term === "open_ended" && (t.end_date || t.duration_months))
    throw new Error("Open-ended contracts have no end date or fixed duration");
  if (
    t.job_level &&
    (!/^\d+$/.test(t.job_level) || Number(t.job_level) < 1 || Number(t.job_level) > 100)
  )
    throw new Error("Job level must be a whole number from 1 to 100");
  if (
    t.workload &&
    (!/^\d+$/.test(t.workload) || Number(t.workload) < 1 || Number(t.workload) > 100)
  )
    throw new Error("Workload must be 1–100%");
  if (
    t.duration_months &&
    (!/^\d+$/.test(t.duration_months) ||
      Number(t.duration_months) < 1 ||
      Number(t.duration_months) > 1200)
  )
    throw new Error("Contract duration must be a positive whole number of months");
  if (
    t.start_date &&
    t.end_date &&
    t.duration_months &&
    monthsBetween(t.start_date, t.end_date) !== Number(t.duration_months)
  )
    throw new Error("Contract months must match the start/end dates (end date inclusive)");
  if (t.supervisor_id && !z.string().uuid().safeParse(t.supervisor_id).success)
    throw new Error("Choose a valid supervisor");
  if (submitted) {
    if (
      [
        t.job_title,
        t.job_level,
        t.salary_information,
        t.start_date,
        t.supervisor_id,
        t.workload,
        t.contract_type,
        t.project_code,
        t.technical_interviewer,
        t.hr_interviewer,
        t.comprehensive_interviewer,
      ].some((v) => !v.trim())
    )
      throw new Error("Complete all required offer fields before submitting");
    if (t.contract_term === "fixed_term" && (!t.end_date || !t.duration_months))
      throw new Error("Fixed-term contracts need an end date and duration in months");
  }
}
export function nextOfferState(state: OfferState, command: string): OfferState {
  if (command === "save" && !["accepted", "onboarded"].includes(state)) return "draft";
  if (command === "submit" && !["accepted", "onboarded"].includes(state)) return "hiring_manager";
  if (command === "reject" && ["hiring_manager", "lab_director", "hrd"].includes(state))
    return "rejected";
  if (command === "approve") {
    if (state === "hiring_manager") return "lab_director";
    if (state === "lab_director") return "hrd";
    if (state === "hrd") return "approved";
  }
  if (command === "sent" && state === "approved") return "sent";
  if (command === "accepted" && state === "sent") return "accepted";
  throw new Error("Invalid offer transition");
}
export function recruitingStageOptions(stages: readonly string[]) {
  return [
    ...new Set([
      ...stages.filter(
        (s) =>
          s.toLowerCase() !== "offer" &&
          !OFFER_STAGES.some((x) => x.toLowerCase() === s.toLowerCase()),
      ),
      ...OFFER_STAGES,
    ]),
  ];
}
export function normalizedCandidate<T extends { outcome: string; stage: string | null }>(c: T): T {
  if (c.outcome === "offer") return { ...c, outcome: "active", stage: "Offer sent" };
  if (c.outcome === "offer_accepted") return { ...c, outcome: "active", stage: "Offer accepted" };
  return c;
}
