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
  const result = await listAll(base, apiKey, "/jobs?page%5Bsize%5D=30");
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
    const name = `${first} ${last}`.trim();
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
