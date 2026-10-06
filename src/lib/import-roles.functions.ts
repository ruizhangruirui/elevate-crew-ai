import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { admin, requireUser } from "./auth.server";

const opt = z.string().trim().max(2000);
const roleRow = z.object({
  direction: z.string().trim().max(200),
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
  owner: opt,
});
export type RoleImportRow = z.infer<typeof roleRow>;

const UNASSIGNED_DIRECTION = "Unassigned";

/**
 * Owner-only. Upsert by direction + title: existing roles get only non-empty cells; new roles are created.
 * Unknown directions are created. Optional owner (Staff ID or name, separated by ";") fills a seat by
 * linking that person to the role.
 */
export const importRoles = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ rows: z.array(roleRow).min(1).max(500), fileName: z.string().max(255) }).parse(input),
  )
  .handler(async ({ data }) => {
    const user = await requireUser(["owner"]);
    const db = await admin();
    const [orgs, dirs, nodes, roles, people] = await Promise.all([
      db.from("orgs").select("id").limit(1),
      db.from("directions").select("id,title,sort_order").eq("archived", false),
      db.from("org_nodes").select("id,name,type,parent_id").eq("archived", false),
      db.from("roles").select("id,title,direction_id").eq("archived", false),
      db.from("people").select("id,name,staff_id").eq("archived", false),
    ]);
    const err = orgs.error || dirs.error || nodes.error || roles.error || people.error;
    if (err) throw new Error(`Unable to load organization data: ${err.message}`);
    const orgId = orgs.data?.[0]?.id as string | undefined;
    if (!orgId) throw new Error("Organization not initialized");
    const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
    const dirMap = new Map((dirs.data ?? []).map((d) => [norm(d.title as string), d.id as string]));
    let sort = Math.max(0, ...(dirs.data ?? []).map((d) => Number(d.sort_order) || 0));
    const labs = (nodes.data ?? []).filter((n) => n.type === "Lab");
    const teams = (nodes.data ?? []).filter((n) => n.type === "Team");
    const existing = new Map((roles.data ?? []).map((r) => [`${r.direction_id}|${norm(r.title as string)}`, r.id as string]));
    const ppl = (people.data ?? []) as { id: string; name: string; staff_id: string | null }[];
    const findPerson = (s: string) =>
      ppl.find((p) => p.staff_id && norm(p.staff_id) === norm(s)) ?? ppl.filter((p) => norm(p.name) === norm(s)).at(0);
    const nodeFor = (lab: string, team: string) => {
      const l = labs.find((x) => norm(x.name) === norm(lab));
      if (!l) return null;
      if (!team) return l.id;
      return teams.find((x) => norm(x.name) === norm(team) && x.parent_id === l.id)?.id ?? l.id;
    };

    const directionId = async (name: string) => {
      const title = name || UNASSIGNED_DIRECTION;
      const hit = dirMap.get(norm(title));
      if (hit) return hit;
      const { data: d, error } = await db
        .from("directions")
        .insert({ org_id: orgId, title, sort_order: ++sort } as never)
        .select("id")
        .single();
      if (error || !d) throw new Error(`Unable to create direction "${title}": ${error?.message ?? ""}`);
      const id = (d as { id: string }).id;
      dirMap.set(norm(title), id);
      return id;
    };

    const seen = new Set<string>();
    let created = 0, updated = 0, dirsCreated = 0;
    const dirCountBefore = dirMap.size;
    const owners: { roleId: string; title: string; owner: string }[] = [];
    for (const r of data.rows) {
      const dirId = await directionId(r.direction);
      const key = `${dirId}|${norm(r.title)}`;
      if (seen.has(key)) throw new Error(`Duplicate role in file: ${r.title}`);
      seen.add(key);
      let id = existing.get(key);
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
        if (Object.keys(patch).length) {
          const { error } = await db.from("roles").update(patch as never).eq("id", id);
          if (error) throw new Error(error.message);
          updated++;
        }
      } else {
        const ownerCount = r.owner ? r.owner.split(/[;；\n]/).filter((x) => x.trim()).length : 0;
        const { data: ins, error } = await db
          .from("roles")
          .insert({
            direction_id: dirId,
            title: r.title,
            description: r.description || null,
            level_min: r.level_min ?? 14,
            level_max: r.level_max ?? r.level_min ?? 16,
            target_count: r.target_count ?? Math.max(1, ownerCount),
            criticality: r.criticality || "important",
            org_node_id: r.lab ? nodeFor(r.lab, r.team) : null,
            employment_mode: r.employment_mode || null,
            location: r.location || null,
          } as never)
          .select("id")
          .single();
        if (error || !ins) throw new Error(error?.message ?? "Insert failed");
        id = (ins as { id: string }).id;
        existing.set(key, id);
        created++;
      }
      if (r.owner) owners.push({ roleId: id, title: r.title, owner: r.owner });
    }
    dirsCreated = dirMap.size - dirCountBefore;

    let linked = 0;
    const unmatched: string[] = [];
    for (const o of owners) {
      for (const name of o.owner.split(/[;；\n]/).map((x) => x.trim()).filter(Boolean)) {
        const p = findPerson(name);
        if (!p) { unmatched.push(name); continue; }
        const { error } = await db
          .from("people")
          .update({ role_id: o.roleId, appointed_role_title: o.title } as never)
          .eq("id", p.id);
        if (error) throw new Error(error.message);
        linked++;
      }
    }

    await db.from("audit_log").insert({
      actor: user.name,
      action: "import_roles",
      entity: "roles",
      detail: `${created} created, ${updated} updated, ${dirsCreated} directions created, ${linked} owners linked from ${data.fileName}`,
    });
    return { created, updated, dirsCreated, linked, unmatched };
  });
