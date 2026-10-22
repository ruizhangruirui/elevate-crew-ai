import { createServerFn } from "@tanstack/react-start";
import { admin, requireUser } from "./auth.server";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export type SyncResult = {
  imported: number;
  skippedDuplicates: number;
  unmatched: number;
  unmatchedJobs: string[];
};

/**
 * Pull candidates from TeamTailor into Recruiting. TeamTailor jobs are matched
 * to internal roles by title (Position name or Job Title, case-insensitive);
 * candidates whose job has no matching role are reported, not imported.
 * Duplicates (same email, or same name when no email, within the same role)
 * are skipped, so re-running the sync is safe.
 */
export const syncTeamTailor = createServerFn({ method: "POST" }).handler(async (): Promise<SyncResult> => {
  const user = await requireUser(["owner", "hr", "recruiter"]);
  const apiKey = process.env["TEAMTAILOR_API_KEY"];
  if (!apiKey) throw new Error("TeamTailor API key is not configured on the server");
  const region = (process.env["TEAMTAILOR_REGION"] ?? "eu").trim().toLowerCase();

  const { fetchTeamTailorCandidates } = await import("./teamtailor.server");
  const db = await admin();

  const { data: roles, error: rolesError } = await db
    .from("roles")
    .select("id,title,job_title,archived")
    .eq("archived", false);
  if (rolesError) throw new Error(rolesError.message);
  const roleByTitle = new Map<string, string>();
  for (const r of roles ?? []) {
    for (const title of [r.title, (r as { job_title?: string | null }).job_title]) {
      if (title) roleByTitle.set(norm(title), r.id);
    }
  }

  const { data: existing, error: existingError } = await db.from("candidates").select("role_id,email,name");
  if (existingError) throw new Error(existingError.message);
  const seen = new Set(
    (existing ?? []).map((c) => `${c.role_id}|${norm(c.email ?? "") || norm(c.name)}`),
  );

  const items = await fetchTeamTailorCandidates(apiKey, region);
  const rows: Record<string, unknown>[] = [];
  let unmatched = 0;
  let skippedDuplicates = 0;
  const unmatchedJobs = new Set<string>();

  for (const item of items) {
    const roleId = roleByTitle.get(norm(item.jobTitle));
    if (!roleId) {
      unmatched++;
      unmatchedJobs.add(item.jobTitle);
      continue;
    }
    const key = `${roleId}|${norm(item.email ?? "") || norm(item.name)}`;
    if (seen.has(key)) {
      skippedDuplicates++;
      continue;
    }
    seen.add(key);
    rows.push({
      role_id: roleId,
      name: item.name,
      email: item.email,
      phone: item.phone,
      linkedin_url: item.linkedin,
      cv_url: item.cvUrl,
      source: "TeamTailor",
      outcome: "active",
    });
  }

  if (rows.length) {
    const { error } = await db.from("candidates").insert(rows as never[]);
    if (error) throw new Error(error.message);
  }
  await db.from("audit_log").insert({
    actor: user.name,
    action: "teamtailor_sync",
    entity: "candidates",
    detail: `imported ${rows.length}, skipped ${skippedDuplicates} duplicates, ${unmatched} unmatched`,
  } as never);

  return {
    imported: rows.length,
    skippedDuplicates,
    unmatched,
    unmatchedJobs: [...unmatchedJobs].slice(0, 10),
  };
});
