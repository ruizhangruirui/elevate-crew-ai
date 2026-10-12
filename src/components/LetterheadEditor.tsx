import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db as supabase } from "@/lib/db-client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmAction } from "@/components/ConfirmAction";
import { useI18n } from "@/lib/i18n";
import { LOGO_KEY, WATERMARK_KEY, fetchLetterhead } from "@/lib/reference-letters";

export function LetterheadEditor() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const q = useQuery({ queryKey: ["letterhead"], queryFn: fetchLetterhead });

  const upsert = useMutation({
    mutationFn: async ({ key, value, rowId }: { key: string; value: string | null; rowId?: string | undefined }) => {
      const res = value === null
        ? await supabase.from("config_items").delete().eq("id", rowId!)
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
    if (file.size > 1024 * 1024) { toast.error(t("ref.logo.tooBig")); return; }
    const reader = new FileReader();
    reader.onload = () => upsert.mutate({ key: LOGO_KEY, value: String(reader.result), rowId: q.data?.logoRow?.id });
    reader.readAsDataURL(file);
  };

  const lh = q.data;
  return (
    <div className="mt-8 space-y-3 border-t border-border/50 pt-6">
      <div>
        <h3 className="font-display text-base font-semibold">{t("ref.logo.title")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("ref.logo.desc")}</p>
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
          <ConfirmAction title={t("ref.logo.remove")} description={t("ref.logo.title")} onConfirm={() => upsert.mutate({ key: LOGO_KEY, value: null, rowId: lh.logoRow!.id })}>
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
    </div>
  );
}
