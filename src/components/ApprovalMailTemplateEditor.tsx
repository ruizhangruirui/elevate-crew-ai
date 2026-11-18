import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db as supabase } from "@/lib/db-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmAction } from "@/components/ConfirmAction";
import { useI18n } from "@/lib/i18n";
import {
  APPROVAL_MAIL_KEY,
  APPROVAL_MAIL_PLACEHOLDERS,
  DEFAULT_APPROVAL_MAIL,
  fetchApprovalMailTemplate,
  type ApprovalMailTemplate,
} from "@/lib/approval-mail";

export function ApprovalMailTemplateEditor() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["approval-mail-template"], queryFn: fetchApprovalMailTemplate });
  const [form, setForm] = useState<ApprovalMailTemplate>({ ...DEFAULT_APPROVAL_MAIL });
  useEffect(() => { if (q.data) setForm(q.data.template); }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const value = JSON.stringify(form);
      const row = q.data?.row;
      const res = row
        ? await supabase.from("config_items").update({ name: value } as never).eq("id", row.id)
        : await supabase.from("config_items").insert({ category: APPROVAL_MAIL_KEY, name: value, sort_order: 0 } as never);
      if (res.error) throw res.error;
    },
    onSuccess: () => { toast.success(t("amail.saved")); qc.invalidateQueries({ queryKey: ["approval-mail-template"] }); },
    onError: (e: unknown) => toast.error(String((e as Error)?.message ?? e)),
  });

  const set = (k: keyof ApprovalMailTemplate, v: string) => setForm({ ...form, [k]: v });
  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-display text-base font-semibold">{t("amail.title")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("amail.hint")}</p>
        <p className="mt-1 break-words text-xs text-muted-foreground">{t("amail.vars")}: {APPROVAL_MAIL_PLACEHOLDERS.map((p) => `{${p}}`).join("  ")}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {(["zh", "en"] as const).map((l) => (
          <div key={l} className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t(`amail.subject_${l}`)}</Label>
              <Input value={form[`subject_${l}`]} onChange={(e) => set(`subject_${l}`, e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t(`amail.body_${l}`)}</Label>
              <Textarea rows={10} value={form[`body_${l}`]} onChange={(e) => set(`body_${l}`, e.target.value)} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <ConfirmAction title={t("amail.reset")} description={<p>{t("amail.resetConfirm")}</p>} confirmLabel={t("amail.reset")} onConfirm={() => setForm({ ...DEFAULT_APPROVAL_MAIL })}>
          <Button variant="outline">{t("amail.reset")}</Button>
        </ConfirmAction>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{t("amail.save")}</Button>
      </div>
    </div>
  );
}
