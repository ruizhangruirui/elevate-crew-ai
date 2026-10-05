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
      db.from("people").select("staff_id").eq("archived", false).not("staff_id", "is", null),
    ]);
    if (orgs.error || nodes.error || roles.error || existing.error) throw new Error("Unable to validate import data");
    const orgId = orgs.data?.[0]?.id;
    if (!orgId) throw new Error("Organization not initialized");
    const labs = (nodes.data ?? []).filter((n) => n.type === "Lab");
    const teams = (nodes.data ?? []).filter((n) => n.type === "Team");
    const roleMap = new Map((roles.data ?? []).map((r) => [r.title, r.id]));
    const taken = new Set((existing.data ?? []).map((p) => p.staff_id as string));
    const seen = new Set<string>();

    const payload = data.rows.map((row) => {
      if (taken.has(row.staff_id) || seen.has(row.staff_id)) throw new Error(`Duplicate Staff ID: ${row.staff_id}`);
      seen.add(row.staff_id);
      const lab = labs.find((l) => l.name === row.lab);
      if (!lab) throw new Error(`Unknown lab: ${row.lab}`);
      let nodeId = lab.id;
      if (row.team) {
        const team = teams.find((tm) => tm.name === row.team && tm.parent_id === lab.id);
        if (!team) throw new Error(`Team "${row.team}" is not under ${row.lab}`);
        nodeId = team.id;
      }
      if (row.role && !roleMap.has(row.role)) throw new Error(`Unknown role: ${row.role}`);
      return {
        org_id: orgId,
        staff_id: row.staff_id,
        name: row.name,
        level: row.level,
        status: "onboard",
        contract_type: row.contract_type,
        hire_date: row.hire_date,
        org_node_id: nodeId,
        role_id: row.role ? (roleMap.get(row.role) ?? null) : null,
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
