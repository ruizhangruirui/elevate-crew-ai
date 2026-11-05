import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { admin, requireUser } from "./auth.server";
import { normTitle, type TeamTailorData } from "./teamtailor.server";

const SYNC_ROLES = ["owner", "hr", "recruiter"] as const;

export type JobMatch = {
  ttJobId: string;
  ttJobTitle: string;
  applications: number;
  status: "mapped" | "title" | "ambiguous" | "unmatched";
  roleId: string | null;
  roleTitle: string | null;
  /** Why the job could not be matched (for ambiguous/unmatched). */
  reason: string | null;
};

export type SyncPreview = {
  jobs: JobMatch[];
  matchedJobs: number;
  unmatchedJobs: number;
  totalApplications: number;
  importable: number;
  duplicates: number;
  capped: boolean;
};

export type SyncResult = {
  imported: number;
  updated: number;
  unchanged: number;
  skippedDuplicates: number;
  unmatched: number;
  unmatchedJobs: string[];
  capped: boolean;
};

type RoleRow = { id: string; title: string; job_title: string | null };

async function loadContext() {
  const apiKey = process.env["TEAMTAILOR_API_KEY"];
  if (!apiKey) throw new Error("TeamTailor API key is not configured on the server");
  const region = (process.env["TEAMTAILOR_REGION"] ?? "eu").trim().toLowerCase();
  const db = await admin();

  const { data: roles, error: rolesError } = await db
    .from("roles")
    .select("id,title,job_title,archived,recruiting_archived")
    .eq("archived", false)
    .eq("recruiting_archived", false);
  if (rolesError) throw new Error(rolesError.message);

  const { data: mappings, error: mapError } = await db.from("teamtailor_job_mappings").select("tt_job_id,role_id");
  if (mapError) throw new Error(mapError.message);

  const { fetchTeamTailorData } = await import("./teamtailor.server");
  const tt = await fetchTeamTailorData(apiKey, region);
  return { db, roles: (roles ?? []) as RoleRow[], mappings: mappings ?? [], tt };
}

/**
 * Match every TeamTailor job to an internal position. Priority:
 * 1. HR-confirmed mapping (stored TeamTailor job ID → role ID).
 * 2. Exact normalized title match against Position name or Job Title.
 * A normalized title shared by several roles is ambiguous and never auto-linked.
 */
function matchJobs(roles: RoleRow[], mappings: { tt_job_id: string; role_id: string }[], tt: TeamTailorData): JobMatch[] {
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const mappedRole = new Map(mappings.map((m) => [m.tt_job_id, m.role_id]));
  // normalized title -> distinct role IDs (a role may appear via title and job_title)
  const rolesByNorm = new Map<string, Set<string>>();
  for (const r of roles) {
    for (const title of [r.title, r.job_title]) {
      if (!title) continue;
      const key = normTitle(title);
      if (!key) continue;
      if (!rolesByNorm.has(key)) rolesByNorm.set(key, new Set());
      rolesByNorm.get(key)!.add(r.id);
    }
  }

  const appsByJob = new Map<string, number>();
  for (const a of tt.applications) appsByJob.set(a.jobId, (appsByJob.get(a.jobId) ?? 0) + 1);
  // Jobs that only appear through applications (not in the /jobs list) still get a row.
  const jobIds = new Map<string, string>();
  for (const j of tt.jobs) jobIds.set(j.id, j.title);
  for (const a of tt.applications) if (!jobIds.has(a.jobId)) jobIds.set(a.jobId, "(unknown title)");

  return [...jobIds.entries()].map(([ttJobId, ttJobTitle]) => {
    const applications = appsByJob.get(ttJobId) ?? 0;
    const base = { ttJobId, ttJobTitle, applications };
    const mapped = mappedRole.get(ttJobId);
    if (mapped) {
      const role = roleById.get(mapped);
      if (role) return { ...base, status: "mapped" as const, roleId: role.id, roleTitle: role.title, reason: null };
      return { ...base, status: "unmatched" as const, roleId: null, roleTitle: null, reason: "Saved mapping points to a position that no longer exists or is archived" };
    }
    const key = normTitle(ttJobTitle);
    const candidates = key ? rolesByNorm.get(key) : undefined;
    if (!candidates || candidates.size === 0) {
      return { ...base, status: "unmatched" as const, roleId: null, roleTitle: null, reason: "No position with this title (checked Position name and Job Title)" };
    }
    if (candidates.size > 1) {
      return { ...base, status: "ambiguous" as const, roleId: null, roleTitle: null, reason: `${candidates.size} positions share this title — pick one manually` };
    }
    const role = roleById.get([...candidates][0]!)!;
    return { ...base, status: "title" as const, roleId: role.id, roleTitle: role.title, reason: null };
  });
}

const dedupeKey = (a: { email: string | null; name: string }) =>
  (a.email ?? "").trim().toLowerCase() || a.name.trim().toLowerCase();

/** Dry-run: show how each TeamTailor job would match, without writing anything. */
export const previewTeamTailorSync = createServerFn({ method: "POST" }).handler(async (): Promise<SyncPreview> => {
  await requireUser([...SYNC_ROLES]);
  const { db, roles, mappings, tt } = await loadContext();
  const matches = matchJobs(roles, mappings, tt);
  const roleByJob = new Map(matches.filter((m) => m.roleId).map((m) => [m.ttJobId, m.roleId!]));

  const { data: existing, error } = await db.from("candidates").select("role_id,email,name,teamtailor_application_id");
  if (error) throw new Error(error.message);
  const seenApps = new Set((existing ?? []).map((c) => c.teamtailor_application_id).filter(Boolean));
  const seenKeys = new Set((existing ?? []).map((c) => `${c.role_id}|${dedupeKey(c)}`));

  let importable = 0;
  let duplicates = 0;
  const batchSeen = new Set<string>();
  for (const a of tt.applications) {
    const roleId = roleByJob.get(a.jobId);
    if (!roleId) continue;
    if (seenApps.has(a.applicationId) || seenKeys.has(`${roleId}|${dedupeKey(a)}`) || batchSeen.has(`${roleId}|${a.applicationId}`)) {
      duplicates++;
      continue;
    }
    batchSeen.add(`${roleId}|${a.applicationId}`);
    importable++;
  }

  return {
    jobs: matches.sort((x, y) => y.applications - x.applications),
    matchedJobs: matches.filter((m) => m.roleId).length,
    unmatchedJobs: matches.filter((m) => !m.roleId).length,
    totalApplications: tt.applications.length,
    importable,
    duplicates,
    capped: tt.capped,
  };
});

/** HR confirms a permanent TeamTailor job → position mapping. */
export const saveTeamTailorMapping = createServerFn({ method: "POST" })
  .inputValidator(z.object({ ttJobId: z.string().min(1), ttJobTitle: z.string().optional(), roleId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const user = await requireUser([...SYNC_ROLES]);
    const db = await admin();
    const { error } = await db.from("teamtailor_job_mappings").upsert(
      { tt_job_id: data.ttJobId, tt_job_title: data.ttJobTitle ?? null, role_id: data.roleId, created_by: user.name } as never,
      { onConflict: "tt_job_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Import candidates from TeamTailor into Recruiting. Matched jobs only;
 * unmatched/ambiguous applications are reported, never imported. Duplicates
 * are detected by the stable TeamTailor application ID (stage/outcome updates
 * are applied to existing rows), with an email/name fallback for rows imported
 * before the ID was stored.
 */
export const syncTeamTailor = createServerFn({ method: "POST" }).handler(async (): Promise<SyncResult> => {
  const user = await requireUser([...SYNC_ROLES]);
  const { db, roles, mappings, tt } = await loadContext();
  const matches = matchJobs(roles, mappings, tt);
  const roleByJob = new Map(matches.filter((m) => m.roleId).map((m) => [m.ttJobId, m.roleId!]));

  const { data: existing, error: existingError } = await db
    .from("candidates")
    .select("id,role_id,email,name,stage,outcome,teamtailor_application_id");
  if (existingError) throw new Error(existingError.message);
  const byAppId = new Map((existing ?? []).filter((c) => c.teamtailor_application_id).map((c) => [c.teamtailor_application_id as string, c]));
  const byKey = new Map((existing ?? []).map((c) => [`${c.role_id}|${dedupeKey(c)}`, c]));

  const rows: Record<string, unknown>[] = [];
  const updates: { id: string; stage: string | null; outcome: string }[] = [];
  let unchanged = 0;
  let skippedDuplicates = 0;
  let unmatched = 0;
  const unmatchedJobs = new Set<string>();
  const jobTitleById = new Map(tt.jobs.map((j) => [j.id, j.title]));
  const batchSeen = new Set<string>();

  for (const a of tt.applications) {
    const roleId = roleByJob.get(a.jobId);
    if (!roleId) {
      unmatched++;
      unmatchedJobs.add(jobTitleById.get(a.jobId) ?? "(unknown title)");
      continue;
    }
    const stage = a.stageName ?? null;
    const outcome = /reject/i.test(stage ?? "") ? "rejected" : /hired/i.test(stage ?? "") ? "hired" : "active";

    const existingRow = byAppId.get(a.applicationId) ?? byKey.get(`${roleId}|${dedupeKey(a)}`);
    if (existingRow) {
      const patch: { id: string; stage: string | null; outcome: string } = { id: existingRow.id, stage, outcome };
      if (existingRow.stage !== stage || existingRow.outcome !== outcome) updates.push(patch);
      else unchanged++;
      // Backfill the stable ID on rows matched via the email/name fallback.
      if (!existingRow.teamtailor_application_id) {
        await db.from("candidates").update({ teamtailor_application_id: a.applicationId } as never).eq("id", existingRow.id);
      }
      continue;
    }
    const batchKey = `${roleId}|${a.applicationId}`;
    if (batchSeen.has(batchKey)) {
      skippedDuplicates++;
      continue;
    }
    batchSeen.add(batchKey);
    rows.push({
      role_id: roleId,
      name: a.name,
      email: a.email,
      phone: a.phone,
      location: a.location,
      linkedin_url: a.linkedin,
      source: "TeamTailor",
      outcome,
      stage,
      teamtailor_application_id: a.applicationId,
      notes: a.profileUrl ? `TeamTailor profile: ${a.profileUrl}` : null,
    });
  }

  if (rows.length) {
    const { error } = await db.from("candidates").insert(rows as never[]);
    if (error) throw new Error(error.message);
  }
  for (const u of updates) {
    const { error } = await db.from("candidates").update({ stage: u.stage, outcome: u.outcome } as never).eq("id", u.id);
    if (error) throw new Error(error.message);
  }
  await db.from("audit_log").insert({
    actor: user.name,
    action: "teamtailor_sync",
    entity: "candidates",
    detail: `imported ${rows.length}, updated ${updates.length}, unchanged ${unchanged}, skipped ${skippedDuplicates} duplicates, ${unmatched} unmatched`,
  } as never);

  return {
    imported: rows.length,
    updated: updates.length,
    unchanged,
    skippedDuplicates,
    unmatched,
    unmatchedJobs: [...unmatchedJobs].slice(0, 10),
    capped: tt.capped,
  };
});
