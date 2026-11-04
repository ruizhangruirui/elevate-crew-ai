import { createServerFn } from "@tanstack/react-start";
import { admin, requireUser } from "./auth.server";
import { isDueForOnboarding } from "./candidate-autohire";

/**
 * Moves every "To onboard" candidate whose start date has arrived into People
 * (status onboard, hire date = start date) and marks the candidate Hired.
 * Idempotent; runs server-side so it does not depend on the viewer's scope.
 */
export const processDueOnboardings = createServerFn({ method: "POST" }).handler(async () => {
  await requireUser();
  const db = await admin();
  const today = new Date().toISOString().slice(0, 10);
  const { data: due, error } = await db.from("candidates").select("*").eq("outcome", "to_onboard").lte("onboarding_on", today);
  if (error) throw new Error(error.message);
  const list = (due ?? []).filter((c) => isDueForOnboarding(c, today));
  if (!list.length) return { moved: 0 };
  const { data: org } = await db.from("orgs").select("id").limit(1).maybeSingle();
  let moved = 0;
  for (const c of list) {
    const { data: role } = await db.from("roles").select("id,org_node_id,job_title,title").eq("id", c.role_id).maybeSingle();
    let personId = c.person_id as string | null;
    const fields = {
      status: "onboard",
      hire_date: c.onboarding_on,
      role_id: role?.id ?? null,
      org_node_id: role?.org_node_id ?? null,
      contract_type: c.contract_type ?? null,
      personal_email: c.email ?? null,
    };
    if (personId) {
      const { data: p } = await db.from("people").select("id,hire_date").eq("id", personId).maybeSingle();
      if (p) {
        const { error: e } = await db.from("people").update({ status: "onboard", hire_date: p.hire_date ?? c.onboarding_on }).eq("id", personId);
        if (e) continue;
      } else personId = null;
    }
    if (!personId) {
      if (!org?.id) continue;
      const { data: p, error: e } = await db.from("people")
        .insert({ org_id: org.id, name: c.name, ...fields, offer_title: role?.job_title ?? null, appointed_role_title: role?.title ?? null })
        .select("id").single();
      if (e || !p) continue;
      personId = p.id as string;
    }
    const { error: ce } = await db.from("candidates").update({ outcome: "hired", person_id: personId }).eq("id", c.id);
    if (ce) continue;
    await db.from("candidate_events").insert({ candidate_id: c.id, kind: "outcome", outcome: "hired", actor: "system", note: "Auto-onboarded on start date", happened_on: today });
    await db.from("audit_log").insert({ actor: "system", action: "auto_onboard", entity: "candidate", detail: c.name, person_id: personId });
    moved++;
  }
  return { moved };
});
