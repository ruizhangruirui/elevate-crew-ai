import { describe, it } from "node:test";
import { deepStrictEqual, ok } from "node:assert/strict";
import { buildApprovalMailto, resolveRecipientEmails } from "./approval-mail";

const people = [
  { name: "Anna Lee", company_email: "anna@co.com" },
  { name: "Ben Wu", company_email: "ben@co.com", appointed_role_title: "HR Director" },
  { name: "Old Boss", company_email: "old@co.com", appointed_role_title: "HR Director", archived_at: "2025-01-01" },
];

describe("approval mail", () => {
  it("resolves a supervisor by name", () => {
    deepStrictEqual(resolveRecipientEmails(["Anna Lee"], people), ["anna@co.com"]);
  });
  it("resolves HR Director approvals by role title, skipping archived people", () => {
    deepStrictEqual(resolveRecipientEmails(["HR Director"], people), ["ben@co.com"]);
  });
  it("leaves recipient empty when nobody matches", () => {
    deepStrictEqual(resolveRecipientEmails(["Unknown"], people), []);
  });
  it("prefills recipient, subject and the system link", () => {
    const url = buildApprovalMailto({
      action: { title: "Approve position X", due_on: null } as any,
      to: ["ben@co.com"], link: "https://app/?role=1", lang: "en",
    });
    ok(url.startsWith("mailto:ben%40co.com?subject="));
    ok(decodeURIComponent(url).includes("https://app/?role=1"));
  });
});
