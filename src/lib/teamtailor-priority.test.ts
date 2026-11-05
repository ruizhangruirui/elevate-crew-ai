import { describe, it } from "node:test";
import { strictEqual } from "node:assert/strict";
import { inboxDefaultPriority } from "./teamtailor-priority";

describe("TeamTailor inbox candidates default to low priority", () => {
  it("returns low for a new candidate staged in Inbox", () => {
    strictEqual(inboxDefaultPriority("Inbox"), "low");
    strictEqual(inboxDefaultPriority(" inbox "), "low");
  });
  it("downgrades only the default medium priority to low", () => {
    strictEqual(inboxDefaultPriority("Inbox", "medium"), "low");
    strictEqual(inboxDefaultPriority("Inbox", null), "low");
  });
  it("never overrides a recruiter-set priority", () => {
    strictEqual(inboxDefaultPriority("Inbox", "high"), undefined);
    strictEqual(inboxDefaultPriority("Inbox", "low"), undefined);
  });
  it("leaves non-inbox stages untouched", () => {
    strictEqual(inboxDefaultPriority("Interview", "medium"), undefined);
    strictEqual(inboxDefaultPriority(null), undefined);
  });
});
