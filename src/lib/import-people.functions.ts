import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { admin, requireUser } from "./auth.server";
import { CONTRACTS } from "./contract";

const importRow = z.object({
  staff_id: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  lab: z.string().trim().min(1).max(200),
  team: z.string().trim().max(200),
  contract_type: z.enum(CONTRACTS),
  hire_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  level: z.number().int().min(0).max(100).nullable(),
  role: z.string().trim().max(200),
});

export const importPeople = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ rows: z.array(importRow).min(1).max(500), fileName: z.string().max(255) }).parse(input),
  )
  .handler(async ({ data }) => {
    const user = await requireUser(["owner"]);
    const db = await admin();
    const [orgs, nodes, roles, existing] = await Promise.all([
      db.from("orgs").select("id").limit(1),
      db.from("org_nodes").select("id,name,type,parent_id").eq("archived", false),
      db.from("roles").select("id,title").eq("archived", false),
      db.from("people").select("staff_id").eq("archived", false),
    ]);
    const loadError = orgs.error || nodes.error || roles.error || existing.error;
    if (loadError) {
      console.error("importPeople: failed to load reference data", loadError);
      throw new Error(`Unable to load organization data: ${loadError.message}`);
    }
    const orgId = orgs.data?.[0]?.id;
    if (!orgId) throw new Error("Organization not initialized");
    const labs = (nodes.data ?? []).filter((n) => n.type === "Lab");
    const teams = (nodes.data ?? []).filter((n) => n.type === "Team");
    const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
    const roleMap = new Map((roles.data ?? []).map((r) => [norm(r.title as string), r.id]));
    const taken = new Set((existing.data ?? []).map((p) => p.staff_id as string | null).filter(Boolean) as string[]);
    const seen = new Set<string>();

    const payload = data.rows.map((row) => {
      if (taken.has(row.staff_id) || seen.has(row.staff_id)) throw new Error(`Duplicate Staff ID: ${row.staff_id}`);
      seen.add(row.staff_id);
      // No hard validation against existing org structure or roles:
      // assign when a match is found, otherwise leave unassigned.
      const lab = labs.find((l) => norm(l.name) === norm(row.lab));
      let nodeId: string | null = lab?.id ?? null;
      if (lab && row.team) {
        const team = teams.find((tm) => norm(tm.name) === norm(row.team) && tm.parent_id === lab.id);
        nodeId = team?.id ?? lab.id;
      }
      return {
        org_id: orgId,
        staff_id: row.staff_id,
        name: row.name,
        level: row.level,
        status: "onboard",
        contract_type: row.contract_type,
        hire_date: row.hire_date,
        org_node_id: nodeId,
        role_id: row.role ? (roleMap.get(norm(row.role)) ?? null) : null,
      };
    });

    const { data: inserted, error } = await db.from("people").insert(payload).select("id,hire_date");
    if (error) throw new Error(error.message);
    const today = new Date().toISOString().slice(0, 10);
    const joins = (inserted ?? []).map((p) => ({
      person_id: p.id,
      event_type: "join",
      reason: "new_hire",
      effective_on: (p.hire_date as string | null) ?? today,
    }));
    if (joins.length) {
      const { error: joinError } = await db.from("person_lifecycle_events").insert(joins);
      if (joinError) throw new Error(`People imported, but join records failed: ${joinError.message}`);
    }
    const { error: auditError } = await db.from("audit_log").insert({
      actor: user.name,
      action: "import_people",
      entity: "people",
      detail: `${payload.length} rows imported from ${data.fileName}`,
    });
    if (auditError) throw new Error(`People imported, but audit record failed: ${auditError.message}`);
    return payload.length;
  });

export const bulkDeletePeople = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ ids: z.array(z.string().uuid()).min(1).max(1000) }).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser(["owner"]);
    const db = await admin();
    for (const t of ["performance_records", "person_milestones", "person_lifecycle_events", "person_role_fit", "org_activity_participants"] as const) {
      const { error } = await db.from(t).delete().in("person_id", data.ids);
      if (error) throw new Error(error.message);
    }
    for (const t of ["actions", "audit_log"] as const) {
      const { error } = await db.from(t).update({ person_id: null }).in("person_id", data.ids);
      if (error) throw new Error(error.message);
    }
    const { error } = await db.from("people").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    await db.from("audit_log").insert({ actor: user.name, action: "bulk_delete_people", entity: "people", detail: `${data.ids.length} people deleted` });
    return data.ids.length;
  });
