import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db as supabase } from "@/lib/db-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextarea } from "@/components/RichTextarea";
import { ConfirmAction } from "@/components/ConfirmAction";
import { useI18n } from "@/lib/i18n";
import { CERT_KEY, CERT_PLACEHOLDERS, DEFAULT_CERT, fetchCertSettings, type CertSettings } from "@/lib/reference-letters";

export function CertificateTemplateEditor() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["cert-settings"], queryFn: fetchCertSettings });
  const [form, setForm] = useState<CertSettings>({ ...DEFAULT_CERT });
  useEffect(() => { if (q.data) setForm(q.data.settings); }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const value = JSON.stringify(form);
      const row = q.data?.row;
      const res = row
        ? await supabase.from("config_items").update({ name: value } as never).eq("id", row.id)
        : await supabase.from("config_items").insert({ category: CERT_KEY, name: value, sort_order: 0 } as never);
      if (res.error) throw res.error;
    },
    onSuccess: () => { toast.success(t("cert.saved")); qc.invalidateQueries({ queryKey: ["cert-settings"] }); },
    onError: (e: unknown) => toast.error(String((e as Error)?.message ?? e)),
  });

  const set = (k: keyof CertSettings, v: string) => setForm({ ...form, [k]: v });
  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-display text-base font-semibold">{t("cert.settings")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("cert.hint")}</p>
        <p className="mt-1 break-words text-xs text-muted-foreground">{t("ref.tpl.vars")}: {CERT_PLACEHOLDERS.map((p) => `{${p}}`).join("  ")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(["title", "salutation", "fullTimeHours"] as const).map((k) => (
          <div key={k} className="space-y-1.5">
            <Label>{t(`cert.s.${k}`)}</Label>
            <Input type={k === "fullTimeHours" ? "number" : "text"} value={form[k]} onChange={(e) => set(k, e.target.value)} />
          </div>
        ))}
      </div>
      {(["body", "closing"] as const).map((k) => (
        <div key={k} className="space-y-1.5">
          <Label>{t(`cert.s.${k}`)}</Label>
          <RichTextarea rows={k === "body" ? 4 : 2} value={form[k]} onChange={(v) => set(k, v)} />
        </div>
      ))}
      <div className="flex justify-end gap-2 border-t border-border/50 pt-3">
        <Button variant="ghost" onClick={() => setForm({ ...DEFAULT_CERT })}>{t("ref.tpl.reset")}</Button>
        <ConfirmAction title={t("cert.settings")} description={t("ref.save")} onConfirm={() => save.mutate()}>
          <Button disabled={save.isPending}>{t("ref.save")}</Button>
        </ConfirmAction>
      </div>
    </div>
  );
}
