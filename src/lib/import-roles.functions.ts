import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { admin, requireUser } from "./auth.server";

const opt = z.string().trim().max(2000);
const roleRow = z.object({
  direction: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  description: opt,
  level_min: z.number().int().min(0).max(100).nullable(),
  level_max: z.number().int().min(0).max(100).nullable(),
  target_count: z.number().int().min(1).max(500).nullable(),
  criticality: z.union([z.enum(["strategic_critical", "critical", "important"]), z.literal("")]),
  lab: opt,
  team: opt,
  employment_mode: z.union([z.enum(["local", "hq_dispatch"]), z.literal("")]),
  location: opt,
});
export type RoleImportRow = z.infer<typeof roleRow>;

/** Owner-only. Upsert by direction + title: existing roles get only non-empty cells; new roles are created. */
export const importRoles = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ rows: z.array(roleRow).min(1).max(500), fileName: z.string().max(255) }).parse(input),
  )
  .handler(async ({ data }) => {
    const user = await requireUser(["owner"]);
    const db = await admin();
    const [dirs, nodes, roles] = await Promise.all([
      db.from("directions").select("id,title").eq("archived", false),
      db.from("org_nodes").select("id,name,type,parent_id").eq("archived", false),
      db.from("roles").select("id,title,direction_id").eq("archived", false),
    ]);
    const err = dirs.error || nodes.error || roles.error;
    if (err) throw new Error(`Unable to load organization data: ${err.message}`);
    const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
    const dirMap = new Map((dirs.data ?? []).map((d) => [norm(d.title as string), d.id as string]));
    const labs = (nodes.data ?? []).filter((n) => n.type === "Lab");
    const teams = (nodes.data ?? []).filter((n) => n.type === "Team");
    const existing = new Map((roles.data ?? []).map((r) => [`${r.direction_id}|${norm(r.title as string)}`, r.id as string]));
    const nodeFor = (lab: string, team: string) => {
      const l = labs.find((x) => norm(x.name) === norm(lab));
      if (!l) return null;
      if (!team) return l.id;
      return teams.find((x) => norm(x.name) === norm(team) && x.parent_id === l.id)?.id ?? l.id;
    };

    const seen = new Set<string>();
    const inserts: Record<string, unknown>[] = [];
    const updates: { id: string; patch: Record<string, unknown> }[] = [];
    for (const r of data.rows) {
      const dirId = dirMap.get(norm(r.direction));
      if (!dirId) throw new Error(`Unknown direction "${r.direction}" (role "${r.title}"). Create it in Settings first.`);
      const key = `${dirId}|${norm(r.title)}`;
      if (seen.has(key)) throw new Error(`Duplicate role in file: ${r.title}`);
      seen.add(key);
      const id = existing.get(key);
      if (id) {
        const patch: Record<string, unknown> = {};
        if (r.description) patch["description"] = r.description;
        if (r.level_min !== null) patch["level_min"] = r.level_min;
        if (r.level_max !== null) patch["level_max"] = r.level_max;
        if (r.target_count !== null) patch["target_count"] = r.target_count;
        if (r.criticality) patch["criticality"] = r.criticality;
        if (r.lab) patch["org_node_id"] = nodeFor(r.lab, r.team);
        if (r.employment_mode) patch["employment_mode"] = r.employment_mode;
        if (r.location) patch["location"] = r.location;
        if (Object.keys(patch).length) updates.push({ id, patch });
      } else {
        inserts.push({
          direction_id: dirId,
          title: r.title,
          description: r.description || null,
          level_min: r.level_min ?? 14,
          level_max: r.level_max ?? r.level_min ?? 16,
          target_count: r.target_count ?? 1,
          criticality: r.criticality || "important",
          org_node_id: r.lab ? nodeFor(r.lab, r.team) : null,
          employment_mode: r.employment_mode || null,
          location: r.location || null,
        });
      }
    }
    for (const u of updates) {
      const { error } = await db.from("roles").update(u.patch as never).eq("id", u.id);
      if (error) throw new Error(error.message);
    }
    if (inserts.length) {
      const { error } = await db.from("roles").insert(inserts as never);
      if (error) throw new Error(error.message);
    }
    await db.from("audit_log").insert({
      actor: user.name,
      action: "import_roles",
      entity: "roles",
      detail: `${inserts.length} created, ${updates.length} updated from ${data.fileName}`,
    });
    return { created: inserts.length, updated: updates.length };
  });
