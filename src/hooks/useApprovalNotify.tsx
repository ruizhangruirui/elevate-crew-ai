import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchWorkspace } from "@/lib/talent";
import { useI18n } from "@/lib/i18n";
import type { ActionItem } from "@/lib/actions";
import { actionLink, buildApprovalMailto, fetchApprovalMailTemplate, resolveRecipientEmails } from "@/lib/approval-mail";

type NotifyInput = Pick<ActionItem, "title" | "source_kind"> & Partial<ActionItem> & { description?: string };

/** Opens a prefilled email draft to the approver right after a request is created. */
export function useApprovalNotify() {
  const { t, lang } = useI18n();
  const { data: ws } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const { data: tpl } = useQuery({ queryKey: ["approval-mail-template"], queryFn: fetchApprovalMailTemplate });

  const open = useCallback((input: NotifyInput) => {
    const action = { id: "", detail: null, source_key: null, role_id: null, person_id: null, org_node_id: null, owner: null, due_on: null, priority: "normal", status: "todo", completed_at: null, created_at: "", updated_at: "", ...input } as ActionItem;
    const to = resolveRecipientEmails([action.owner], ws?.people ?? []);
    const href = buildApprovalMailto({ action, to, link: actionLink(action, window.location.origin), description: input.description ?? action.detail ?? "", recipient: action.owner ?? "", lang, template: tpl?.template });
    window.location.href = href;
    toast.info(to.length ? t("act.notify.opened") : t("act.notify.noEmail"));
  }, [ws, tpl, lang, t]);

  /** Success toast with an "Email approver" button. */
  const offer = useCallback((message: string, input: NotifyInput) => {
    toast.success(message, { duration: 15000, action: { label: t("act.notifyApprover"), onClick: () => open(input) } });
  }, [open, t]);

  return { open, offer };
}
