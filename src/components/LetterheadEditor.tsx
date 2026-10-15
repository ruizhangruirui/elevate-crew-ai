import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db as supabase } from "@/lib/db-client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextarea } from "@/components/RichTextarea";
import { ConfirmAction } from "@/components/ConfirmAction";
import { useI18n } from "@/lib/i18n";
import { DEFAULT_STATIONERY, LOGO_KEY, WATERMARK_KEY, STATIONERY_KEY, fetchLetterhead, type LetterStationery } from "@/lib/reference-letters";

export function LetterheadEditor() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const q = useQuery({ queryKey: ["letterhead"], queryFn: fetchLetterhead });
  const [form, setForm] = useState<LetterStationery>({ ...DEFAULT_STATIONERY });
  useEffect(() => { if (q.data) setForm(q.data.stationery); }, [q.data]);
  const dirty = JSON.stringify(form) !== JSON.stringify(q.data?.stationery ?? DEFAULT_STATIONERY);

  const upsert = useMutation({
    mutationFn: async ({ key, value, rowId }: { key: string; value: string | null; rowId?: string | undefined }) => {
      if (value === null && !rowId) throw new Error("Missing letterhead setting");
      const res = value === null
        ? await supabase.from("config_items").delete().eq("id", rowId ?? "")
        : rowId
          ? await supabase.from("config_items").update({ name: value } as never).eq("id", rowId)
          : await supabase.from("config_items").insert({ category: key, name: value, sort_order: 0 } as never);
      if (res.error) throw res.error;
    },
    onSuccess: () => { toast.success(t("ref.tpl.saved")); qc.invalidateQueries({ queryKey: ["letterhead"] }); },
    onError: (e: unknown) => toast.error(String((e as Error)?.message ?? e)),
  });

  const onFile = (file?: File) => {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) { toast.error(t("ref.logo.invalid")); return; }
    if (file.size > 1024 * 1024) { toast.error(t("ref.logo.tooBig")); return; }
    const reader = new FileReader();
    reader.onload = () => upsert.mutate({ key: LOGO_KEY, value: String(reader.result), rowId: q.data?.logoRow?.id });
    reader.readAsDataURL(file);
  };

  const lh = q.data;
  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-display text-base font-semibold">{t("ref.logo.title")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("ref.stationery.hint")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {lh?.logo ? (
          <img src={lh.logo} alt="Company logo" className="h-14 max-w-48 rounded border border-border/60 bg-background object-contain p-1" />
        ) : null}
        <input ref={input} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        <Button variant="outline" size="sm" onClick={() => input.current?.click()} disabled={upsert.isPending}>
          {t("ref.logo.upload")}
        </Button>
        {lh?.logoRow && (
          <ConfirmAction title={t("ref.logo.remove")} description={t("ref.logo.title")} onConfirm={() => upsert.mutate({ key: LOGO_KEY, value: null, rowId: lh.logoRow?.id })}>
            <Button variant="ghost" size="sm">{t("ref.logo.remove")}</Button>
          </ConfirmAction>
        )}
        {lh?.logo && (
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={lh.watermark}
              onCheckedChange={(v) => upsert.mutate({ key: WATERMARK_KEY, value: v ? "on" : "off", rowId: lh.watermarkRow?.id })}
            />
            {t("ref.logo.watermark")}
          </label>
        )}
      </div>
      {q.isError ? <p role="alert" className="text-sm text-destructive">{t("ref.stationery.loadError")}</p> : null}
      <fieldset disabled={!q.data || upsert.isPending} className="space-y-3 pt-1">
        <div className="grid gap-3 sm:grid-cols-2">
          {(["company", "title", "place", "salutation"] as const).map((key) => (
            <div key={key} className="min-w-0 space-y-1.5">
              <Label htmlFor={`letter-${key}`}>{t(`ref.stationery.${key}`)}</Label>
              <Input id={`letter-${key}`} maxLength={200} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="letter-address">{t("ref.stationery.address")}</Label>
          <RichTextarea id="letter-address" rows={2} value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
        </div>
        <h4 className="border-t border-border/50 pt-3 text-sm font-medium">{t("ref.stationery.signature")}</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["signoff", "signatureName", "signatureTitle"] as const).map((key) => (
            <div key={key} className="min-w-0 space-y-1.5">
              <Label htmlFor={`letter-${key}`}>{t(`ref.stationery.${key}`)}</Label>
              <Input id={`letter-${key}`} maxLength={200} placeholder={key === "signatureName" || key === "signatureTitle" ? t("ref.stationery.autoSupervisor") : undefined} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor="letter-signatureContact">{t("ref.stationery.signatureContact")}</Label>
            <RichTextarea id="letter-signatureContact" rows={2} value={form.signatureContact} onChange={(v) => setForm({ ...form, signatureContact: v })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="letter-footer">{t("ref.stationery.footer")}</Label>
          <RichTextarea id="letter-footer" rows={2} value={form.footer} onChange={(v) => setForm({ ...form, footer: v })} />
        </div>
        <div className="flex justify-end gap-2 border-t border-border/50 pt-3">
          <Button variant="ghost" disabled={!dirty} onClick={() => q.data && setForm(q.data.stationery)}>{t("ui.cancel")}</Button>
          <ConfirmAction title={t("ref.stationery.save")} description={t("ref.stationery.confirm")} confirmLabel={t("ref.stationery.save")} onConfirm={() => upsert.mutate({ key: STATIONERY_KEY, value: JSON.stringify(form), rowId: q.data?.stationeryRow?.id })}>
            <Button disabled={!dirty || upsert.isPending}>{t("ref.stationery.save")}</Button>
          </ConfirmAction>
        </div>
      </fieldset>
    </div>
  );
}
