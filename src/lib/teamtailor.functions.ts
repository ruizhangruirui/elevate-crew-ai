import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { admin, requireUser } from "./auth.server";
import { matchJobs, type JobMatch } from "./teamtailor-match";

const SYNC_ROLES = ["owner", "hr", "recruiter"] as const;

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

  const { fetchTeamTailorJobs, fetchTeamTailorData } = await import("./teamtailor.server");
  const discovered = await fetchTeamTailorJobs(apiKey, region);
  const activeRoles = (roles ?? []) as RoleRow[];
  const matches = matchJobs(activeRoles, mappings ?? [], { ...discovered, applications: [] });
  const matchedIds = new Set(matches.filter((job) => job.roleId).map((job) => job.ttJobId));
  const pipelines = await fetchTeamTailorData(apiKey, region, discovered.jobs.filter((job) => matchedIds.has(job.id)));
  const tt = { jobs: discovered.jobs, applications: pipelines.applications, capped: discovered.capped || pipelines.capped };
  return { db, roles: (roles ?? []) as RoleRow[], mappings: mappings ?? [], tt };
}


const dedupeKey = (a: { email: string | null; name: string }) =>
  (a.email ?? "").trim().toLowerCase() || a.name.trim().toLowerCase();

/** Dry-run: show how each TeamTailor job would match, without writing anything. */
export const previewTeamTailorSync = createServerFn({ method: "POST" }).handler(async (): Promise<SyncPreview> => {
  await requireUser([...SYNC_ROLES]);
  const { db, roles, mappings, tt } = await loadContext();
  const matches = matchJobs(roles, mappings, tt);
  const roleByJob = new Map(matches.flatMap((m) => m.roleId ? [[m.ttJobId, m.roleId] as const] : []));

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
  const roleByJob = new Map(matches.flatMap((m) => m.roleId ? [[m.ttJobId, m.roleId] as const] : []));

  const { data: existing, error: existingError } = await db
    .from("candidates")
    .select("id,role_id,email,name,stage,outcome,cv_url,teamtailor_application_id");
  if (existingError) throw new Error(existingError.message);
  const byAppId = new Map((existing ?? []).filter((c) => c.teamtailor_application_id).map((c) => [c.teamtailor_application_id as string, c]));
  const byKey = new Map((existing ?? []).map((c) => [`${c.role_id}|${dedupeKey(c)}`, c]));

  const rows: Record<string, unknown>[] = [];
  const updates: { id: string; stage: string | null; outcome: string }[] = [];
  let unchanged = 0;
  let skippedDuplicates = 0;
  let unmatched = 0;
  let skippedRejected = 0;
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
    const isRejected = a.rejected || /reject/i.test(stage ?? "");
    const outcome = isRejected ? "rejected" : /hired/i.test(stage ?? "") ? "hired" : "active";

    const existingRow = byAppId.get(a.applicationId) ?? byKey.get(`${roleId}|${dedupeKey(a)}`);
    // Only active TeamTailor candidates (Inbox and later stages) are imported.
    if (isRejected && !existingRow) { skippedRejected++; continue; }
    if (existingRow) {
      if (!existingRow.cv_url && a.profileUrl) {
        await db.from("candidates").update({ cv_url: a.profileUrl } as never).eq("id", existingRow.id);
      }
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
      // TeamTailor's direct resume link expires within minutes, so the CV link
      // points to the candidate's TeamTailor profile where the CV is shown.
      cv_url: a.profileUrl,
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
    detail: `imported ${rows.length}, updated ${updates.length}, unchanged ${unchanged}, skipped ${skippedDuplicates} duplicates, ${skippedRejected} rejected, ${unmatched} unmatched`,
  } as never);

  return {
    imported: rows.length,
    updated: updates.length,
    unchanged,
    skippedDuplicates,
    skippedRejected,
    unmatched,
    unmatchedJobs: [...unmatchedJobs].slice(0, 10),
    capped: tt.capped,
  };
});
