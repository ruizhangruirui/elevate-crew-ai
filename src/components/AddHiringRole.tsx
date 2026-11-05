import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { db } from "@/lib/db-client";
import { ROLE_CONTRACT_TYPES } from "@/lib/talent";
import { VisibleToPicker } from "@/components/VisibleToPicker";
import { PersonPicker } from "@/components/PersonPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Adds a hiring position as a regular Position under the given direction; it also appears in Recruiting. */
export function AddHiringRole({ directionId, orgNodes, onCreated }: { directionId: string | undefined; orgNodes: { id: string; name: string; type: string }[]; onCreated?: (id: string) => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [node, setNode] = useState("none");
  const [count, setCount] = useState("1");
  const [contract, setContract] = useState<string>(ROLE_CONTRACT_TYPES[0]);
  const [visibleTo, setVisibleTo] = useState<string[]>([]);
  const [recruiter, setRecruiter] = useState<string | null>(null);
  const [supervisor, setSupervisor] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: async () => {
      if (!directionId) throw new Error(t("rec.needDirection"));
      const { data, error } = await db
        .from("roles")
        .insert({
          title: title.trim(),
          direction_id: directionId,
          org_node_id: node === "none" ? null : node,
          target_count: Math.max(1, Number(count) || 1),
          contract_type: contract,
          recruiting_only: false,
          criticality: "important",
          visible_to_person_ids: visibleTo,
          recruiter_person_id: recruiter,
          supervisor_person_id: supervisor,
        })
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: (id) => {
      toast.success(t("rec.roleAdded"));
      qc.invalidateQueries({ refetchType: "all" });
      setOpen(false);
      setTitle("");
      setNode("none");
      setCount("1");
      setVisibleTo([]);
      setRecruiter(null);
      setSupervisor(null);
      onCreated?.(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <Button size="sm" variant="outline" className="gap-1" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> {t("rec.addRole")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("rec.addRoleTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>{t("rec.roleTitle")}</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>{t("rec.roleTeam")}</Label>
                <Select value={node} onValueChange={setNode}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">—</SelectItem>{orgNodes.map((n) => <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>{t("rec.roleContract")}</Label>
                <Select value={contract} onValueChange={setContract}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLE_CONTRACT_TYPES.map((c) => <SelectItem key={c} value={c}>{t(`roleContract.${c}`)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>{t("rec.roleCount")}</Label><Input type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <PersonPicker label={t("rec.roleRecruiter")} value={recruiter} onChange={setRecruiter} clearLabel={t("ui.clear")} scope="hr" />
              <PersonPicker label={t("rec.roleSupervisor")} value={supervisor} onChange={setSupervisor} clearLabel={t("ui.clear")} />
            </div>
            <VisibleToPicker value={visibleTo} onChange={setVisibleTo} orgNodeId={node === "none" ? null : node} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t("ui.cancel")}</Button>
            <Button disabled={!title.trim() || !recruiter || !supervisor || create.isPending} onClick={() => create.mutate()}>{t("ui.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
