import { it } from "node:test";
import { strictEqual, deepStrictEqual, rejects } from "node:assert/strict";
import { fetchTeamTailorCandidates, fetchTeamTailorData } from "./teamtailor.server";

it("reads a matched job's applicants independently of the global application page cap and follows its next page", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url.toString());
    strictEqual(url.searchParams.get("filter[job]"), "matched-job");
    const second = url.searchParams.get("page[number]") === "2";
    const id = second ? "application-2" : "application-1";
    return new Response(JSON.stringify({
      data: [{ id, type: "job-applications", relationships: {
        job: { data: { id: "matched-job", type: "jobs" } },
        candidate: { data: { id, type: "candidates" } },
        stage: { data: { id: "interview", type: "stages" } },
      } }],
      included: [
        { id, type: "candidates", attributes: { "first-name": "Test", "last-name": second ? "Two" : "One", email: `${id}@example.test` } },
        { id: "interview", type: "stages", attributes: { name: "Interview" } },
      ],
      links: { next: second ? null : "https://api.teamtailor.com/v1/job-applications?filter%5Bjob%5D=matched-job&include=candidate,job,stage&page%5Bnumber%5D=2" },
    }), { status: 200 });
  };
  try {
    const result = await fetchTeamTailorData("test-key", "eu", [{ id: "matched-job", title: "Research Engineer" }]);
    strictEqual(requests.length, 2);
    deepStrictEqual(result.applications.map((app) => app.applicationId), ["application-1", "application-2"]);
    strictEqual(result.applications[1]?.stageName, "Interview");
    strictEqual(result.capped, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

it("does not fetch applications when no supplier jobs match maintained positions", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Unmatched jobs must not be fetched"); };
  try {
    const result = await fetchTeamTailorData("test-key", "eu", []);
    deepStrictEqual(result.applications, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

it("rejects unrelated applications even if the supplier includes them in a selected job response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: ["selected", "unrelated"].map((id) => ({ id, type: "job-applications", relationships: {
      job: { data: { id, type: "jobs" } }, candidate: { data: { id: "candidate", type: "candidates" } },
    } })),
    included: [
      { id: "candidate", type: "candidates", attributes: { "first-name": "Synthetic" } },
      { id: "unrelated", type: "jobs", attributes: { title: "Other job" } },
    ],
  }));
  try {
    const result = await fetchTeamTailorData("synthetic-key", "eu", [{ id: "selected", title: "Selected job" }]);
    deepStrictEqual(result.applications.map((a) => a.jobId), ["selected"]);
    deepStrictEqual(result.jobs.map((j) => j.id), ["selected"]);
  } finally { globalThis.fetch = originalFetch; }
});

it("talent pool reads all 41 candidate pages, without job or rejection filters, including unnamed candidates", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    strictEqual(url.pathname, "/v1/candidates");
    strictEqual([...url.searchParams.keys()].some((key) => key.startsWith("filter")), false);
    const page = ++calls;
    return new Response(JSON.stringify({
      data: [{ id: `candidate-${page}`, type: "candidates", attributes: page === 41 ? {} : { "first-name": "Synthetic", "rejected-at": "2026-11-01" } }],
      links: { next: page < 41 ? `https://api.teamtailor.com/v1/candidates?include=job-applications.job&page%5Bnumber%5D=${page + 1}` : null },
    }));
  };
  try {
    const result = await fetchTeamTailorCandidates("synthetic-key", "eu");
    strictEqual(calls, 41);
    strictEqual(result.candidates.length, 41);
    strictEqual(result.candidates[40]?.name, "TeamTailor #candidate-41");
    strictEqual(result.capped, false);
  } finally { globalThis.fetch = originalFetch; }
});

it("talent pool stops on repeated pagination instead of reporting a partial sync as complete", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [], links: { next: "https://api.teamtailor.com/v1/candidates?page%5Bnumber%5D=2" } }));
  try {
    await rejects(() => fetchTeamTailorCandidates("synthetic-key", "eu"), /repeated pagination/);
  } finally { globalThis.fetch = originalFetch; }
});

it("retries a rate-limited candidate page without skipping it", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1
    ? new Response("", { status: 429, headers: { "Retry-After": "0" } })
    : new Response(JSON.stringify({ data: [{ id: "c1", type: "candidates", attributes: { "first-name": "Synthetic" } }], links: { next: null } }));
  try {
    const result = await fetchTeamTailorCandidates("synthetic-key", "eu");
    strictEqual(calls, 2);
    deepStrictEqual(result.candidates.map((c) => c.id), ["c1"]);
  } finally { globalThis.fetch = originalFetch; }
});

it("talent pool keeps each candidate's actual applied jobs, including multiple and rejected applications, across pages", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    strictEqual(url.searchParams.get("include"), "job-applications.job");
    const second = ++calls === 2;
    return new Response(JSON.stringify({
      data: [{ id: second ? "candidate-2" : "candidate-1", type: "candidates", attributes: { "first-name": "Synthetic" }, relationships: {
        "job-applications": { data: second ? [] : ["a1", "a2", "a3"].map((id) => ({ id, type: "job-applications" })) },
      } }],
      included: [
        ...["a1", "a2", "a3", "unrelated"].map((id) => ({ id, type: "job-applications", attributes: { "rejected-at": id === "a2" ? "2026-11-01" : null }, relationships: { job: { data: { id: id === "a2" ? "j2" : id === "unrelated" ? "j3" : "j1", type: "jobs" } } } })),
        ...["Research Engineer", "Research Intern", "Unrelated role"].map((title, i) => ({ id: `j${i + 1}`, type: "jobs", attributes: { title } })),
      ],
      links: { next: second ? null : "https://api.teamtailor.com/v1/candidates?include=job-applications.job&page%5Bnumber%5D=2" },
    }));
  };
  try {
    const result = await fetchTeamTailorCandidates("synthetic-key", "eu");
    strictEqual(calls, 2);
    deepStrictEqual(result.candidates[0]?.appliedJobs, ["Research Engineer", "Research Intern"]);
    deepStrictEqual(result.candidates[1]?.appliedJobs, []);
    strictEqual(result.capped, false);
  } finally { globalThis.fetch = originalFetch; }
});