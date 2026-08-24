import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import type { Person } from "@/lib/talent";
import { PERF_KEYS } from "@/lib/growth";
import { perfLabel } from "@/components/GrowthSummary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormActions } from "@/components/FormActions";

/** Org-wide entry point to record a performance review for any person. */
export function ReviewDialog({
  open,
  onOpenChange,
  people,
  personId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  people: Person[];
  personId?: string | null;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    person_id: personId ?? "",
    period: new Date().getFullYear().toString(),
    rating: "meets",
    summary: "",
    highlights: "",
    improvements: "",
    reviewer: "",
  });

  useEffect(() => {
    if (open) setForm((f) => ({ ...f, person_id: personId ?? f.person_id }));
  }, [open, personId]);

  const save = useMutation({
    mutationFn: async () => {
      const person = people.find((p) => p.id === form.person_id);
      if (!person) throw new Error(t("growth.review.pickPerson"));
      const { error } = await supabase.from("performance_records").insert({
        person_id: person.id,
        period: form.period.trim() || new Date().getFullYear().toString(),
        rating: form.rating,
        summary: form.summary || null,
        highlights: form.highlights || null,
        improvements: form.improvements || null,
        reviewer: form.reviewer || null,
      });
      if (error) throw error;
      await supabase.from("audit_log").insert({
        person_id: person.id,
        action: t("sheet.person.perfAddAction"),
        entity: person.name,
        detail: `${form.period} · ${perfLabel(t, form.rating)}`,
      });
    },
    onSuccess: () => {
      toast.success(t("sheet.person.perfSaved"));
      qc.invalidateQueries({ refetchType: "all" });
      onOpenChange(false);
      setForm((f) => ({
        ...f,
        summary: "",
        highlights: "",
        improvements: "",
        rating: "meets",
      }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("growth.review.title")}</DialogTitle>
          <DialogDescription>{t("growth.review.hint")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("growth.review.person")}</Label>
            <Select
              value={form.person_id}
              onValueChange={(v) => setForm({ ...form, person_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("growth.review.pickPerson")} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.level ? ` · L${p.level}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t("sheet.person.perfPeriod")}</Label>
              <Input
                value={form.period}
                onChange={(e) => setForm({ ...form, period: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("sheet.person.perfRating")}</Label>
              <Select
                value={form.rating}
                onValueChange={(v) => setForm({ ...form, rating: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERF_KEYS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {perfLabel(t, k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("sheet.person.perfReviewer")}</Label>
              <Input
                value={form.reviewer}
                onChange={(e) => setForm({ ...form, reviewer: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("sheet.person.perfSummary")}</Label>
            <Textarea
              rows={3}
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("sheet.person.perfHighlights")}</Label>
              <Textarea
                rows={2}
                value={form.highlights}
                onChange={(e) => setForm({ ...form, highlights: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("sheet.person.perfImprovements")}</Label>
              <Textarea
                rows={2}
                value={form.improvements}
                onChange={(e) => setForm({ ...form, improvements: e.target.value })}
              />
            </div>
          </div>
        </div>

        <FormActions
          onCancel={() => onOpenChange(false)}
          onSave={() => save.mutate()}
          saving={save.isPending}
          disabled={!form.person_id}
        />
      </DialogContent>
    </Dialog>
  );
}
