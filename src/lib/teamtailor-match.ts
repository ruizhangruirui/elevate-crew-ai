import { normTitle, type TeamTailorData } from "./teamtailor.server";

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

type RoleRow = { id: string; title: string; job_title: string | null };

/**
 * Match every TeamTailor job to an internal position. Priority:
 * 1. HR-confirmed mapping (stored TeamTailor job ID → role ID).
 * 2. Exact normalized title match against Position name or Job Title.
 * A normalized title shared by several roles is ambiguous and never auto-linked.
 */
export function matchJobs(roles: RoleRow[], mappings: { tt_job_id: string; role_id: string }[], tt: TeamTailorData): JobMatch[] {
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
      rolesByNorm.get(key)?.add(r.id);
    }
  }

  const appsByJob = new Map<string, number>();
  for (const a of tt.applications) appsByJob.set(a.jobId, (appsByJob.get(a.jobId) ?? 0) + 1);
  // Jobs that only appear through applications (not in the /jobs list) still get a row.
  const jobIds = new Map<string, string>();
  for (const j of tt.jobs) jobIds.set(j.id, j.title);
  for (const a of tt.applications) if (!jobIds.has(a.jobId)) jobIds.set(a.jobId, "(unknown title)");

  const matches: JobMatch[] = [...jobIds.entries()].map(([ttJobId, ttJobTitle]) => {
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
      return { ...base, status: "ambiguous" as const, roleId: null, roleTitle: null, reason: `${candidates.size} positions share this title — skipped` };
    }
    const roleId = [...candidates][0];
    const role = roleId ? roleById.get(roleId) : undefined;
    if (!role) return { ...base, status: "unmatched" as const, roleId: null, roleTitle: null, reason: "No active recruiting position" };
    return { ...base, status: "title" as const, roleId: role.id, roleTitle: role.title, reason: null };
  });
  // A title is not a stable identity: never silently merge two supplier jobs
  // into one maintained position. A saved mapping can explicitly identify it.
  const jobsByRole = new Map<string, JobMatch[]>();
  for (const match of matches) {
    if (!match.roleId) continue;
    const group = jobsByRole.get(match.roleId) ?? [];
    group.push(match);
    jobsByRole.set(match.roleId, group);
  }
  for (const group of jobsByRole.values()) {
    if (group.length < 2) continue;
    const confirmed = group.filter((job) => job.status === "mapped");
    for (const job of group) {
      if (confirmed.length === 1 && job === confirmed[0]) continue;
      job.status = "ambiguous";
      job.roleId = null;
      job.roleTitle = null;
      job.reason = "Multiple TeamTailor jobs match this position — skipped to avoid merging pipelines";
    }
  }
  return matches;
}

