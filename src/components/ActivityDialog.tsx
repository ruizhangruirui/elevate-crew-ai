import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { activityKinds, type Activity } from "@/lib/org-building";
import type { Direction, Person } from "@/lib/talent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const today = () => new Date().toISOString().slice(0, 10);

const empty = {
  kind: "tech_share",
  title: "",
  happened_on: today(),
  host: "",
  duration_minutes: "60",
  direction_id: "none",
  capability_tags: "",
  link: "",
  note: "",
};

export function ActivityDialog({
  open,
  onOpenChange,
  activity,
  directions,
  people,
  participantIds,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  activity: Activity | null;
  directions: Direction[];
  people: Person[];
  participantIds: string[];
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [form, setForm] = useState(empty);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    if (activity) {
      setForm({
        kind: activity.kind,
        title: activity.title,
        happened_on: activity.happened_on,
        host: activity.host ?? "",
        duration_minutes: activity.duration_minutes ? String(activity.duration_minutes) : "",
        direction_id: activity.direction_id ?? "none",
        capability_tags: (activity.capability_tags ?? []).join("、"),
        link: activity.link ?? "",
        note: activity.note ?? "",
      });
      setPicked(participantIds);
    } else {
      setForm({ ...empty, happened_on: today() });
      setPicked([]);
    }
  }, [open, activity, participantIds]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error(t("sheet.activity.titleRequired"));
      const payload = {
        kind: form.kind,
        title: form.title.trim(),
        happened_on: form.happened_on,
        host: form.host.trim() || null,
        duration_minutes: Number(form.duration_minutes) || null,
        direction_id: form.direction_id === "none" ? null : form.direction_id,
        capability_tags: form.capability_tags
          .split(/[、,，\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
        link: form.link.trim() || null,
        note: form.note.trim() || null,
      };

      let id = activity?.id;
      if (id) {
        const { error } = await supabase.from("org_activities").update(payload).eq("id", id);
        if (error) throw error;
        const { error: delErr } = await supabase
          .from("org_activity_participants")
          .delete()
          .eq("activity_id", id);
        if (delErr) throw delErr;
      } else {
        const { data, error } = await supabase
          .from("org_activities")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        id = data.id;
      }
      if (picked.length) {
        const { error } = await supabase
          .from("org_activity_participants")
          .insert(picked.map((person_id) => ({ activity_id: id!, person_id })));
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(activity ? t("sheet.activity.updated") : t("sheet.activity.recorded"));
      qc.invalidateQueries();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display">
            {activity ? t("sheet.activity.editTitle") : t("sheet.activity.recordTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("sheet.activity.kind")}</Label>
            <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {activityKinds.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {t(k.labelKey)} · {t(k.hintKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("sheet.activity.date")}</Label>
            <Input
              type="date"
              value={form.happened_on}
              onChange={(e) => setForm((f) => ({ ...f, happened_on: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("sheet.activity.title")}</Label>
            <Input
              value={form.title}
              placeholder={t("sheet.activity.titlePlaceholder")}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("sheet.activity.host")}</Label>
            <Input
              value={form.host}
              onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("sheet.activity.durationMinutes")}</Label>
            <Input
              inputMode="numeric"
              value={form.duration_minutes}
              onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("sheet.activity.direction")}</Label>
            <Select
              value={form.direction_id}
              onValueChange={(v) => setForm((f) => ({ ...f, direction_id: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("sheet.activity.unlimitedOrg")}</SelectItem>
                {directions.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("sheet.activity.capabilityTags")}</Label>
            <Input
              value={form.capability_tags}
              placeholder={t("sheet.activity.capabilityTagsPlaceholder")}
              onChange={(e) => setForm((f) => ({ ...f, capability_tags: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              {t("sheet.activity.capabilityTagsHint")}
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("sheet.activity.participants")}</Label>
            <div className="flex flex-wrap gap-2 rounded-lg border border-border/60 p-3">
              {people.length === 0 && (
                <span className="text-xs text-muted-foreground">{t("sheet.activity.noPeopleYet")}</span>
              )}
              {people.map((p) => {
                const on = picked.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setPicked((list) =>
                        on ? list.filter((x) => x !== p.id) : [...list, p.id],
                      )
                    }
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      on
                        ? "border-brand/60 bg-brand/15 text-foreground"
                        : "border-border/70 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("sheet.activity.linkLabel")}</Label>
            <Input
              value={form.link}
              placeholder="https://"
              onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("sheet.activity.noteLabel")}</Label>
            <Textarea
              rows={3}
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("sheet.cancel")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? t("sheet.activity.saving") : t("sheet.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
