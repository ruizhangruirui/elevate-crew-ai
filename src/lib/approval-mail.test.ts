import { describe, it } from "node:test";
import { deepStrictEqual, ok } from "node:assert/strict";
import { buildApprovalMailto, parseApprovalMailTemplate, DEFAULT_APPROVAL_MAIL, resolveRecipientEmails } from "./approval-mail";

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
  it("uses the configured template with placeholders", () => {
    const template = { ...DEFAULT_APPROVAL_MAIL, subject_en: "Please approve: {title}", body_en: "Hi {recipient}, see {link}" };
    const url = buildApprovalMailto({ action: { title: "Pos X", due_on: null } as any, to: [], link: "L1", recipient: "Ben", lang: "en", template });
    const decoded = decodeURIComponent(url);
    ok(decoded.includes("subject=Please approve: Pos X"));
    ok(decoded.includes("body=Hi Ben, see L1"));
  });
  it("falls back to defaults for missing or blank template fields", () => {
    const tpl = parseApprovalMailTemplate(JSON.stringify({ subject_zh: "", body_en: "X" }));
    deepStrictEqual(tpl.subject_zh, DEFAULT_APPROVAL_MAIL.subject_zh);
    deepStrictEqual(tpl.body_en, "X");
  });
});
