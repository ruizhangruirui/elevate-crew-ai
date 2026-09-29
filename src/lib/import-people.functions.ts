import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { admin, requireUser } from "./auth.server";

const importRow = z.object({
  name: z.string().trim().min(1).max(200),
  level: z.number().int().min(0).max(100).nullable(),
  status: z.enum(["onboard", "candidate"]),
  contract_type: z.enum(["正式员工", "外包", "实习生", "外部顾问", "访问学者"]).nullable(),
  team: z.string().trim().max(200),
  role: z.string().trim().max(200),
  tags: z.array(z.string().trim().min(1).max(100)).max(30),
  note: z.string().max(2000).nullable(),
});

export const importPeople = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ rows: z.array(importRow).min(1).max(500), fileName: z.string().max(255) }).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser(["owner"]);
    const db = await admin();
    const [orgs, nodes, roles] = await Promise.all([
      db.from("orgs").select("id").limit(1),
      db.from("org_nodes").select("id,name").eq("archived", false),
      db.from("roles").select("id,title").eq("archived", false),
    ]);
    if (orgs.error || nodes.error || roles.error) throw new Error("Unable to validate import data");
    const orgId = orgs.data?.[0]?.id;
    if (!orgId) throw new Error("Organization not initialized");
    const teamMap = new Map((nodes.data ?? []).map((n) => [n.name, n.id]));
    const roleMap = new Map((roles.data ?? []).map((r) => [r.title, r.id]));
    const payload = data.rows.map((row) => {
      if (row.team && !teamMap.has(row.team)) throw new Error(`Unknown team: ${row.team}`);
      if (row.role && !roleMap.has(row.role)) throw new Error(`Unknown role: ${row.role}`);
      return {
        org_id: orgId, name: row.name, level: row.level, status: row.status,
        contract_type: row.contract_type, org_node_id: row.team ? (teamMap.get(row.team) ?? null) : null,
        role_id: row.role ? (roleMap.get(row.role) ?? null) : null, tags: row.tags, note: row.note,
      };
    });
    const { data: inserted, error } = await db.from("people").insert(payload).select("id,status");
    if (error) throw new Error(error.message);
    const today = new Date().toISOString().slice(0, 10);
    const joins = (inserted ?? []).filter((p) => p.status === "onboard").map((p) => ({
      person_id: p.id, event_type: "join", reason: "new_hire", effective_on: today,
    }));
    if (joins.length) {
      const { error: joinError } = await db.from("person_lifecycle_events").insert(joins);
      if (joinError) throw new Error(`People imported, but join records failed: ${joinError.message}`);
    }
    const { error: auditError } = await db.from("audit_log").insert({
      actor: user.name, action: "import_people", entity: "people",
      detail: `${payload.length} rows imported from ${data.fileName}`,
    });
    if (auditError) throw new Error(`People imported, but audit record failed: ${auditError.message}`);
    return payload.length;
  });