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
const MAX_PAGES = 25;

type JsonApiResource = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id: string; type: string } | null }>;
};

export type TeamTailorCandidate = {
  jobTitle: string;
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin: string | null;
  cvUrl: string | null;
};

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
  for (let page = 0; next && page < MAX_PAGES; page++) {
    // links.next is a full URL including the /v1 prefix; strip the base to avoid doubling it.
    const url = next.startsWith("http") ? next.replace(/^https?:\/\/[^/]+\/v1/, "") : next;
    const res = await ttGet(base, apiKey, url);
    data.push(...(res.data ?? []));
    included.push(...(res.included ?? []));
    next = res.links?.next ?? null;
  }
  return { data, included };
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Fetch job applications (with candidates included) and jobs, and flatten
 * them into one row per application: the candidate plus the job title they
 * applied to. Requires an API key with Admin read scope.
 */
export async function fetchTeamTailorCandidates(apiKey: string, region: string): Promise<TeamTailorCandidate[]> {
  const base = BASE_URLS[region] ?? BASE_URLS["eu"]!;
  const [jobs, applications] = await Promise.all([
    listAll(base, apiKey, "/jobs?page%5Bsize%5D=30"),
    listAll(base, apiKey, "/job-applications?include=candidate&page%5Bsize%5D=30"),
  ]);

  const jobTitleById = new Map<string, string>();
  for (const j of jobs.data) {
    const title = str(j.attributes?.["title"]);
    if (title) jobTitleById.set(j.id, title);
  }
  const candidateById = new Map<string, JsonApiResource>();
  for (const c of applications.included) if (c.type === "candidates") candidateById.set(c.id, c);

  const out: TeamTailorCandidate[] = [];
  for (const app of applications.data) {
    const jobId = app.relationships?.["job"]?.data?.id;
    const candId = app.relationships?.["candidate"]?.data?.id;
    const jobTitle = jobId ? jobTitleById.get(jobId) : undefined;
    const cand = candId ? candidateById.get(candId) : undefined;
    if (!jobTitle || !cand) continue;
    const a = cand.attributes ?? {};
    const first = str(a["first-name"]) ?? "";
    const last = str(a["last-name"]) ?? "";
    const name = `${first} ${last}`.trim();
    if (!name) continue;
    const location = [str(a["city"]), str(a["country"])].filter(Boolean).join(", ") || null;
    out.push({
      jobTitle,
      name,
      email: str(a["email"]),
      phone: str(a["phone"]),
      location,
      linkedin: str(a["linkedin-url"]),
      cvUrl: str(a["resume"]),
    });
  }
  return out;
}
