import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db as supabase } from "@/lib/db-client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichTextarea } from "@/components/RichTextarea";
import { ConfirmAction } from "@/components/ConfirmAction";
import { useI18n } from "@/lib/i18n";
import { DEFAULT_TEMPLATES, PLACEHOLDERS, TEMPLATE_KEYS, fetchRefTemplates } from "@/lib/reference-letters";

type K = keyof typeof TEMPLATE_KEYS;
const KEYS: K[] = ["current", "left", "closing", "guide"];

export function ReferenceTemplateEditor() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ref-templates"], queryFn: fetchRefTemplates });
  const [form, setForm] = useState<Record<K, string>>(DEFAULT_TEMPLATES);
  useEffect(() => { if (q.data) setForm(q.data.text); }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      for (const k of KEYS) {
        const row = q.data?.rows[k];
        const res = row
          ? await supabase.from("config_items").update({ name: form[k] } as never).eq("id", row.id)
          : await supabase.from("config_items").insert({ category: TEMPLATE_KEYS[k], name: form[k], sort_order: 0 } as never);
        if (res.error) throw res.error;
      }
    },
    onSuccess: () => { toast.success(t("ref.tpl.saved")); qc.invalidateQueries({ queryKey: ["ref-templates"] }); },
    onError: (e: unknown) => toast.error(String((e as Error)?.message ?? e)),
  });

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-display text-base font-semibold">{t("ref.tpl.title")}</h3>
        <p className="mt-1 break-words text-xs text-muted-foreground">
          {t("ref.tpl.vars")}: {PLACEHOLDERS.map((p) => `{${p}}`).join("  ")}
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
      {KEYS.map((k) => (
        <div key={k} className="space-y-1.5">
          <Label>{t(`ref.tpl.${k}`)}</Label>
          {k === "guide" && <p className="text-xs text-muted-foreground">{t("ref.tpl.guideHint")}</p>}
          {k === "guide"
            ? <Textarea rows={3} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            : <RichTextarea rows={3} value={form[k]} onChange={(v) => setForm({ ...form, [k]: v })} />}
        </div>
      ))}
      </div>
      <div className="flex justify-end gap-2 border-t border-border/50 pt-3">
        <Button variant="ghost" onClick={() => setForm(DEFAULT_TEMPLATES)}>{t("ref.tpl.reset")}</Button>
        <ConfirmAction title={t("ref.tpl.title")} description={t("ref.save")} onConfirm={() => save.mutate()}>
          <Button disabled={save.isPending}>{t("ref.save")}</Button>
        </ConfirmAction>
      </div>
    </div>
  );
}
