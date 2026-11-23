import { it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert/strict";
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