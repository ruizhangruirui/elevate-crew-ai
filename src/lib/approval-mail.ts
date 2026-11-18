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
  if (target.kind === "reference") return `${origin}/growth?tab=reference&letter=${target.id}`;
  if (target.kind === "position") return `${origin}/?role=${target.id}`;
  return `${origin}/people/${target.id}`;
}

export function buildApprovalMailto(opts: {
  action: ActionItem;
  to: string[];
  link: string;
  description?: string;
  lang: "zh" | "en";
}) {
  const { action, to, link, description, lang } = opts;
  const zh = lang === "zh";
  const subject = zh ? `[待审批] ${action.title}` : `[Approval needed] ${action.title}`;
  const lines = zh
    ? [
        "您好，",
        "",
        "人才管理系统中有一项事项需要您处理：",
        "",
        `事项：${action.title}`,
        description ? `说明：${description}` : "",
        action.due_on ? `截止日期：${formatDate(action.due_on)}` : "",
        "",
        `请点击链接在系统中查看并处理：${link}`,
        "",
        "谢谢！",
      ]
    : [
        "Hello,",
        "",
        "An item in the Talent Management system needs your attention:",
        "",
        `Item: ${action.title}`,
        description ? `Details: ${description}` : "",
        action.due_on ? `Due: ${formatDate(action.due_on)}` : "",
        "",
        `Open it in the system: ${link}`,
        "",
        "Thank you.",
      ];
  const body = lines.filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
  return `mailto:${to.map(encodeURIComponent).join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
