import type { ActionItem } from "./actions";
import { actionTarget } from "./action-target";
import { formatDate } from "./dates";

type MailPerson = {
  name: string;
  company_email?: string | null;
  appointed_role_title?: string | null;
  offer_title?: string | null;
  archived_at?: string | null;
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Find the recipient's company email: exact name match first, then job/role title (e.g. "HR Director"). */
export function resolveRecipientEmails(names: (string | null | undefined)[], people: MailPerson[]): string[] {
  const active = people.filter((p) => !p.archived_at && p.company_email);
  const out = new Set<string>();
  for (const raw of names) {
    const n = norm(raw);
    if (!n) continue;
    const byName = active.filter((p) => norm(p.name) === n);
    const matches = byName.length
      ? byName
      : active.filter((p) => norm(p.appointed_role_title) === n || norm(p.offer_title) === n);
    for (const p of matches) out.add(p.company_email!.trim());
  }
  return [...out];
}

export function actionLink(action: ActionItem, origin: string) {
  const target = actionTarget(action);
  if (!target) return `${origin}/actions`;
  if (target.kind === "offer") return `${origin}/recruiting/offers?offer=${target.id}`;
  if (target.kind === "reference") return `${origin}/growth?tab=reference&letter=${target.id}`;
  if (target.kind === "position") return `${origin}/?role=${target.id}`;
  return `${origin}/people/${target.id}`;
}

export const APPROVAL_MAIL_KEY = "approval_mail_template";
export const APPROVAL_MAIL_PLACEHOLDERS = ["recipient", "title", "details", "due", "link"] as const;

export const DEFAULT_APPROVAL_MAIL = {
  subject_zh: "[待审批] {title}",
  body_zh: "{recipient}，您好：\n\n人才管理系统中有一项事项需要您处理：\n\n事项：{title}\n说明：{details}\n截止日期：{due}\n\n请点击链接在系统中查看并处理：{link}\n\n谢谢！",
  subject_en: "[Approval needed] {title}",
  body_en: "Dear {recipient},\n\nAn item in the Talent Management system needs your attention:\n\nItem: {title}\nDetails: {details}\nDue: {due}\n\nOpen it in the system: {link}\n\nThank you.",
};
export type ApprovalMailTemplate = typeof DEFAULT_APPROVAL_MAIL;

/** Parse the stored template JSON, falling back to defaults per field. */
export function parseApprovalMailTemplate(raw: string | null | undefined): ApprovalMailTemplate {
  const out = { ...DEFAULT_APPROVAL_MAIL };
  try {
    const parsed = JSON.parse(raw ?? "{}") as Record<string, unknown>;
    for (const k of Object.keys(out) as (keyof ApprovalMailTemplate)[]) {
      if (typeof parsed[k] === "string" && (parsed[k] as string).trim()) out[k] = parsed[k] as string;
    }
  } catch { /* defaults */ }
  return out;
}

export async function fetchApprovalMailTemplate() {
  const { db } = await import("./db-client");
  const { data, error } = await db.from("config_items").select("*").eq("category", APPROVAL_MAIL_KEY);
  if (error) throw error;
  const row = ((data ?? []) as unknown as { id: string; name: string }[])[0] ?? null;
  return { row, template: parseApprovalMailTemplate(row?.name) };
}

export function fillApprovalMail(text: string, vars: Record<string, string>) {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] || "—" : m));
}

export function buildApprovalMailto(opts: {
  action: ActionItem;
  to: string[];
  link: string;
  description?: string;
  recipient?: string;
  lang: "zh" | "en";
  template?: ApprovalMailTemplate | undefined;
}) {
  const { action, to, link, description, recipient, lang } = opts;
  const tpl = opts.template ?? DEFAULT_APPROVAL_MAIL;
  const vars = {
    recipient: recipient || (lang === "zh" ? "同事" : "colleague"),
    title: action.title,
    details: description ?? "",
    due: action.due_on ? formatDate(action.due_on) : "",
    link,
  };
  const subject = fillApprovalMail(lang === "zh" ? tpl.subject_zh : tpl.subject_en, vars);
  const body = fillApprovalMail(lang === "zh" ? tpl.body_zh : tpl.body_en, vars);
  return `mailto:${to.map(encodeURIComponent).join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
