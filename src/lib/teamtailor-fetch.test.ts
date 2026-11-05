import { it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert/strict";
import { fetchTeamTailorData } from "./teamtailor.server";

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