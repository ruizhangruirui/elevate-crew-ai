/**
 * TeamTailor public API client (server-only).
 * Docs: https://docs.teamtailor.com — JSON:API, auth via
 * `Authorization: Token token=<key>` and `X-Api-Version` header.
 * Base URL depends on the account's data region (EU / NA / AU).
 */

const BASE_URLS: Record<string, string> = {
  eu: "https://api.teamtailor.com/v1",
  na: "https://api.na.teamtailor.com/v1",
  au: "https://api.au.teamtailor.com/v1",
};

const API_VERSION = "20240404";
const MAX_PAGES = 40;

type JsonApiResource = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id: string; type: string } | null }>;
};

export type TeamTailorJob = {
  id: string;
  title: string;
};

export type TeamTailorApplication = {
  applicationId: string;
  jobId: string;
  stageName: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin: string | null;
  profileUrl: string | null;
  /** True when TeamTailor marks the application as rejected (not an active candidate). */
  rejected: boolean;
};

export type TeamTailorData = {
  jobs: TeamTailorJob[];
  applications: TeamTailorApplication[];
  /** True when the page cap was hit, so some records may be missing. */
  capped: boolean;
};

/**
 * Normalize a job/position title for matching: Unicode NFKC, lowercase,
 * non-breaking spaces and unicode dashes unified, punctuation stripped,
 * whitespace collapsed. Matching-only — display keeps the original.
 */
export function normTitle(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u00A0\u202F\u2009\u2007\u2000-\u200A]/g, " ")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/[-()[\]{}"'‘’“”«».,:;!？?/\\|+*#@~^$%&=_<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function ttGet(base: string, apiKey: string, path: string) {
  const res = await fetch(`${base}${path}`, {
    headers: {
      Authorization: `Token token=${apiKey}`,
      "X-Api-Version": API_VERSION,
      Accept: "application/vnd.api+json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`TeamTailor API error ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<{ data?: JsonApiResource[]; included?: JsonApiResource[]; links?: { next?: string | null } }>;
}

/** Follow JSON:API pagination (links.next) up to a safety cap. */
async function listAll(base: string, apiKey: string, path: string) {
  const data: JsonApiResource[] = [];
  const included: JsonApiResource[] = [];
  let next: string | null = path;
  let capped = false;
  for (let page = 0; next && page < MAX_PAGES; page++) {
    // links.next is a full URL including the /v1 prefix; strip the base to avoid doubling it.
    const url = next.startsWith("http") ? next.replace(/^https?:\/\/[^/]+\/v1/, "") : next;
    const res = await ttGet(base, apiKey, url);
    data.push(...(res.data ?? []));
    included.push(...(res.included ?? []));
    next = res.links?.next ?? null;
    if (next && page === MAX_PAGES - 1) capped = true;
  }
  return { data, included, capped };
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Discover jobs first, so unrelated historical applications cannot consume the page cap. */
export async function fetchTeamTailorJobs(apiKey: string, region: string) {
  const base = BASE_URLS[region] ?? "https://api.teamtailor.com/v1";
  const result = await listAll(base, apiKey, "/jobs?filter%5Bstatus%5D=all&page%5Bsize%5D=30");
  const jobs: TeamTailorJob[] = [];
  for (const job of result.data) {
    const title = str(job.attributes?.["title"]);
    if (job.type === "jobs" && title) jobs.push({ id: job.id, title });
  }
  return { jobs, capped: result.capped };
}

/** Read each matched job's own pipeline, with independent pagination and bounded concurrency. */
export async function fetchTeamTailorData(apiKey: string, region: string, matchedJobs: TeamTailorJob[]): Promise<TeamTailorData> {
  const base = BASE_URLS[region] ?? "https://api.teamtailor.com/v1";
  const jobs = [...new Map(matchedJobs.map((job) => [job.id, job])).values()];
  const applications: { data: JsonApiResource[]; included: JsonApiResource[]; capped: boolean } = { data: [], included: [], capped: false };
  for (let offset = 0; offset < jobs.length; offset += 3) {
    const batch = await Promise.all(jobs.slice(offset, offset + 3).map((job) =>
      listAll(base, apiKey, `/job-applications?filter%5Bjob%5D=${encodeURIComponent(job.id)}&include=candidate,job,stage&page%5Bsize%5D=30`),
    ));
    for (const result of batch) {
      applications.data.push(...result.data);
      applications.included.push(...result.included);
      applications.capped ||= result.capped;
    }
  }

  const jobById = new Map<string, TeamTailorJob>(jobs.map((job) => [job.id, job]));
  for (const j of applications.included) {
    if (j.type !== "jobs") continue;
    const title = str(j.attributes?.["title"]);
    if (title && !jobById.has(j.id)) jobById.set(j.id, { id: j.id, title });
  }
  const candidateById = new Map<string, JsonApiResource>();
  const stageNameById = new Map<string, string>();
  for (const c of applications.included) {
    if (c.type === "candidates") candidateById.set(c.id, c);
    if (c.type === "stages") {
      const name = str(c.attributes?.["name"]);
      if (name) stageNameById.set(c.id, name);
    }
  }

  const out: TeamTailorApplication[] = [];
  for (const app of applications.data) {
    const jobId = app.relationships?.["job"]?.data?.id;
    const candId = app.relationships?.["candidate"]?.data?.id;
    const stageId = app.relationships?.["stage"]?.data?.id;
    const cand = candId ? candidateById.get(candId) : undefined;
    if (!jobId || !cand) continue;
    const a = cand.attributes ?? {};
    const first = str(a["first-name"]) ?? "";
    const last = str(a["last-name"]) ?? "";
    // Some TeamTailor candidates (sourced/connected) have no name yet; fall back to email.
    const name = `${first} ${last}`.trim() || str(a["email"]) || "";
    if (!name) continue;
    const location = [str(a["city"]), str(a["country"])].filter(Boolean).join(", ") || null;
    out.push({
      applicationId: app.id,
      jobId,
      stageName: stageId ? (stageNameById.get(stageId) ?? null) : null,
      name,
      email: str(a["email"]),
      phone: str(a["phone"]),
      location,
      linkedin: str(a["linkedin-url"]),
      // The resume URL is a signed link that expires within a minute; the
      // profile URL is the stable link back to the candidate in TeamTailor.
      profileUrl: str(a["profile-url"]),
      rejected: Boolean(app.attributes?.["rejected-at"]),
    });
  }
  return { jobs: [...jobById.values()], applications: out, capped: applications.capped };
}

export type TeamTailorCandidate = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin: string | null;
  profileUrl: string | null;
  pitch: string | null;
  tags: string[];
  appliedJobs: string[];
};

/** All candidates in the TeamTailor account (talent pool), page-capped. */
export async function fetchTeamTailorCandidates(apiKey: string, region: string) {
  const base = BASE_URLS[region] ?? "https://api.teamtailor.com/v1";
  const result = await listAll(base, apiKey, "/candidates?include=job-applications.job&page%5Bsize%5D=30");
  const jobs = new Map(result.included.filter((r) => r.type === "jobs").map((r) => [r.id, str(r.attributes?.["title"])]));
  const applications = new Map(result.included.filter((r) => r.type === "job-applications").map((r) => [r.id, r]));
  const out: TeamTailorCandidate[] = [];
  for (const c of result.data) {
    if (c.type !== "candidates") continue;
    const a = c.attributes ?? {};
    const name = `${str(a["first-name"]) ?? ""} ${str(a["last-name"]) ?? ""}`.trim() || str(a["email"]) || "";
    if (!name) continue;
    // Use each candidate's own application relationships, never global jobs or AI matches.
    const links = c.relationships?.["job-applications"]?.data as unknown;
    const appliedJobs = Array.isArray(links) ? [...new Set(links.flatMap((link: { id: string }) => {
      const jobId = applications.get(link.id)?.relationships?.["job"]?.data?.id;
      const title = jobId ? jobs.get(jobId) : null;
      return title ? [title] : [];
    }))] : [];
    out.push({
      id: c.id,
      name,
      email: str(a["email"]),
      phone: str(a["phone"]),
      location: [str(a["city"]), str(a["country"])].filter(Boolean).join(", ") || null,
      linkedin: str(a["linkedin-url"]),
      profileUrl: str(a["profile-url"]),
      pitch: str(a["pitch"]),
      tags: Array.isArray(a["tags"]) ? (a["tags"] as unknown[]).filter((t): t is string => typeof t === "string") : [],
      appliedJobs,
    });
  }
  return { candidates: out, capped: result.capped };
}

/** Fresh (short-lived) resume link → CV text (PDF or Word), with a failure reason. Retries once with a new link. */
export async function fetchTeamTailorResumeText(apiKey: string, region: string, candidateId: string): Promise<import("./pdf-text.server").CvReadResult> {
  const base = BASE_URLS[region] ?? "https://api.teamtailor.com/v1";
  const { cvToText } = await import("./pdf-text.server");
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await ttGet(base, apiKey, `/candidates/${encodeURIComponent(candidateId)}`);
    const one = res.data as unknown as JsonApiResource | undefined;
    const url = str(one?.attributes?.["resume"]);
    if (!url) return { text: null, reason: "no_file" };
    const file = await fetch(url).catch(() => null);
    if (file?.ok) return cvToText(new Uint8Array(await file.arrayBuffer()));
  }
  return { text: null, reason: "download_failed" };
}

/** TeamTailor candidate ID behind a job application (Recruiting rows store only the application ID). */
export async function fetchTeamTailorApplicationCandidateId(apiKey: string, region: string, applicationId: string): Promise<string | null> {
  const base = BASE_URLS[region] ?? "https://api.teamtailor.com/v1";
  const res = await ttGet(base, apiKey, `/job-applications/${encodeURIComponent(applicationId)}`);
  const one = res.data as unknown as JsonApiResource | undefined;
  return one?.relationships?.["candidate"]?.data?.id ?? null;
}
