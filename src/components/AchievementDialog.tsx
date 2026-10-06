import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/lib/db-client";
import type { OrgNode } from "@/lib/org-tree";
import type { Person } from "@/lib/talent";
import type { TeamAchievement } from "@/lib/team-achievements";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const today = () => new Date().toISOString().slice(0, 10);

export function AchievementDialog({
  open,
  onOpenChange,
  achievement,
  contributorIds,
  types,
  nodes,
  people,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  achievement: TeamAchievement | null;
  contributorIds: string[];
  types: { id: string; name: string }[];
  nodes: OrgNode[];
  people: Person[];
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [form, setForm] = useState({ type: "", title: "", date: today(), node: "none", link: "", note: "" });
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setForm({
      type: achievement?.achievement_type ?? types[0]?.name ?? "",
      title: achievement?.title ?? "",
      date: achievement?.achieved_on ?? today(),
      node: achievement?.org_node_id ?? "none",
      link: achievement?.link ?? "",
      note: achievement?.note ?? "",
    });
    setPicked(contributorIds);
  }, [open, achievement, contributorIds, types]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.type || !form.title.trim()) throw new Error(t("achievement.required"));
      const payload = {
        achievement_type: form.type,
        title: form.title.trim(),
        achieved_on: form.date,
        org_node_id: form.node === "none" ? null : form.node,
        link: form.link.trim() || null,
        note: form.note.trim() || null,
      };
      let id = achievement?.id;
      if (id) {
        const updated = await db.from("team_achievements").update(payload).eq("id", id);
        if (updated.error) throw updated.error;
        const removed = await db.from("team_achievement_contributors").delete().eq("achievement_id", id);
        if (removed.error) throw removed.error;
      } else {
        const created = await db.from("team_achievements").insert(payload).select("id").single();
        if (created.error) throw created.error;
        id = created.data?.id;
      }
      if (!id) throw new Error(t("achievement.saveFailed"));
      if (picked.length) {
        const added = await db
          .from("team_achievement_contributors")
          .insert(picked.map((person_id) => ({ achievement_id: id, person_id })));
        if (added.error) throw added.error;
      }
      await db.from("audit_log").insert({
        action: achievement ? "Edit" : "Create",
        entity: "Team achievement",
        detail: `${form.type}: ${form.title.trim()}`,
      });
    },
    onSuccess: () => {
      toast.success(t(achievement ? "achievement.updated" : "achievement.created"));
      qc.invalidateQueries({ refetchType: "all" });
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{t(achievement ? "achievement.edit" : "achievement.add")}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>{t("achievement.type")}</Label><Select value={form.type} onValueChange={(type) => setForm((value) => ({ ...value, type }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{types.map((type) => <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>{t("achievement.date")}</Label><Input type="date" value={form.date} onChange={(event) => setForm((value) => ({ ...value, date: event.target.value }))} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>{t("achievement.titleField")}</Label><Input value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>{t("achievement.team")}</Label><Select value={form.node} onValueChange={(node) => setForm((value) => ({ ...value, node }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{t("achievement.wholeOrg")}</SelectItem>{nodes.map((node) => <SelectItem key={node.id} value={node.id}>{node.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>{t("achievement.contributors")}</Label><div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-lg border border-border/60 p-3">{people.map((person) => { const active = picked.includes(person.id); return <Button key={person.id} type="button" size="sm" variant={active ? "secondary" : "outline"} onClick={() => setPicked((list) => active ? list.filter((id) => id !== person.id) : [...list, person.id])}>{person.name}</Button>; })}</div></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>{t("achievement.link")}</Label><Input value={form.link} placeholder="https://" onChange={(event) => setForm((value) => ({ ...value, link: event.target.value }))} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>{t("achievement.note")}</Label><Textarea rows={3} value={form.note} onChange={(event) => setForm((value) => ({ ...value, note: event.target.value }))} /></div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>{t("ui.cancel")}</Button><Button disabled={save.isPending || !types.length} onClick={() => save.mutate()}>{save.isPending ? t("ui.saving") : t("ui.save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}