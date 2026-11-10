import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert/strict";

const bunTestModule = "bun:test";
const { mock } = await import(bunTestModule);

const archivedPerson = {
  id: "departed-person",
  name: "Former employee",
  archived: true,
  status: "left",
  hire_date: "2020-05-05",
  offer_title: "Researcher",
  workload_pct: 80,
  assessed_skills: [{ skill: "Research", level: "Expert" }],
};
const filters: unknown[][] = [];
mock.module("@/lib/db-client", () => ({
  db: {
    from: (table: string) => {
      filters.push(["table", table]);
      return {
        select: () => ({
          eq: (field: string, value: unknown) => {
            filters.push([field, value]);
            return { order: async () => ({ data: [archivedPerson], error: null }) };
          },
        }),
      };
    },
  },
}));

const { fetchArchivedPeople } = await import("./lifecycle");

describe("archived person profile data", () => {
  it("reads archived records without restoring them and preserves profile details", async () => {
    const people = await fetchArchivedPeople();
    deepStrictEqual(filters, [["table", "people"], ["archived", true]]);
    deepStrictEqual(people[0], archivedPerson);
    strictEqual(people[0]?.status, "left");
    strictEqual(people[0]?.archived, true);
  });
});