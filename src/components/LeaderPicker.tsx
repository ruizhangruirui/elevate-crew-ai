import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db as supabase } from "@/lib/db-client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmAction } from "@/components/ConfirmAction";
import { useI18n } from "@/lib/i18n";

type Node = { id: string; parent_id: string | null; type: string; name: string };
type P = { id: string; name: string; org_node_id: string | null; is_leader: boolean; status: string; archived: boolean };

/** Assign the leader (Lab Director / Team Lead) of one org node. */
export function LeaderPicker({ node, nodes }: { node: Node; nodes: Node[] }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const people = useQuery({
    queryKey: ["people-leaders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("people").select("id,name,org_node_id,is_leader,status,archived").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as P[];
    },
  });
  const [pending, setPending] = useState<string | null>(null);

  // Candidates: active people on this node or any node beneath it.
  const sub = new Set([node.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) if (n.parent_id && sub.has(n.parent_id) && !sub.has(n.id)) { sub.add(n.id); grew = true; }
  }
  const active = (people.data ?? []).filter((p) => !p.archived && p.status !== "left");
  const pool = active.filter((p) => p.org_node_id && sub.has(p.org_node_id));
  const current = active.filter((p) => p.org_node_id === node.id && p.is_leader);
  const label = node.type === "Lab" ? t("chart.labDirector") : t("chart.teamLead");

  const assign = useMutation({
    mutationFn: async (personId: string) => {
      for (const c of current) {
        if (c.id === personId) continue;
        const { error } = await supabase.from("people").update({ is_leader: false } as never).eq("id", c.id);
        if (error) throw error;
      }
      if (personId !== "__none") {
        const { error } = await supabase.from("people").update({ is_leader: true, org_node_id: node.id } as never).eq("id", personId);
        if (error) throw error;
      }
      await supabase.from("audit_log").insert({ action: "Assign leader", entity: node.name, detail: `${label}: ${pool.find((p) => p.id === personId)?.name ?? "—"}` } as never);
    },
    onSuccess: () => { toast.success(t("set.org.leaderSaved")); qc.invalidateQueries({ refetchType: "all" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const name = (id: string) => (id === "__none" ? t("chart.vacant") : pool.find((p) => p.id === id)?.name ?? "");
  return (
    <div className="mt-2 flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <Select value={current[0]?.id ?? "__none"} onValueChange={setPending}>
        <SelectTrigger className="h-7 w-52 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">{t("chart.vacant")}</SelectItem>
          {pool.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {pending && (
        <ConfirmAction
          open
          onOpenChange={(o: boolean) => !o && setPending(null)}
          title={`${label} · ${node.name}`}
          description={t("set.org.leaderConfirm").replace("{name}", name(pending)).replace("{role}", label)}
          onConfirm={() => { assign.mutate(pending); setPending(null); }}
        >
          <span />
        </ConfirmAction>
      )}
    </div>
  );
}
