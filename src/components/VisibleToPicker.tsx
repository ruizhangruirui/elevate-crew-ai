import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { db } from "@/lib/db-client";
import { useI18n } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { labOf, subtree, type ScopeNode } from "@/lib/people-scope";

/** Choose people (from the People list) who may view this recruiting position with their own account. */
export function VisibleToPicker({ value, onChange, orgNodeId }: { value: string[]; onChange: (ids: string[]) => void; orgNodeId?: string | null }) {
  const { lang } = useI18n();
  const zh = lang === "zh";
  const [q, setQ] = useState("");
  const people = useQuery({
    queryKey: ["visible-to-people"],
    queryFn: async () => {
      const { data, error } = await db.from("people").select("id,name,company_email,org_node_id").eq("archived", false).order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; company_email: string | null; org_node_id: string | null }[];
    },
  });
  const nodes = useQuery({
    queryKey: ["scope-org-nodes"],
    queryFn: async () => {
      const { data, error } = await db.from("org_nodes").select("id,name,type,parent_id").eq("archived", false);
      if (error) throw error;
      return (data ?? []) as ScopeNode[];
    },
  });
  const all = people.data ?? [];
  const lab = labOf(nodes.data ?? [], orgNodeId);
  const list = useMemo(() => {
    if (!lab) return all;
    const inLab = subtree(nodes.data ?? [], [lab]);
    return all.filter((p) => value.includes(p.id) || (p.org_node_id && inLab.has(p.org_node_id)));
  }, [all, lab, nodes.data, value]);
  const byId = useMemo(() => new Map(list.map((p) => [p.id, p])), [list]);
  const shown = list.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 50);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div className="space-y-2">
      <Label>{zh ? "可见人员" : "Visible to"}</Label>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs">
              {byId.get(id)?.name ?? "…"}
              <button type="button" onClick={() => toggle(id)} aria-label="remove"><X className="size-3" /></button>
            </span>
          ))}
        </div>
      )}
      <Input className="h-8 text-xs" placeholder={zh ? "搜索人员…" : "Search people…"} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-40 overflow-y-auto rounded-md border p-1">
        {shown.map((p) => (
          <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted">
            <Checkbox checked={value.includes(p.id)} onCheckedChange={() => toggle(p.id)} />
            <span>{p.name}</span>
            {p.company_email && <span className="truncate text-muted-foreground">{p.company_email}</span>}
          </label>
        ))}
        {!shown.length && <p className="px-2 py-1 text-xs text-muted-foreground">—</p>}
      </div>
      <p className="text-xs text-muted-foreground">
        {zh ? "所选人员登录自己的账号（账号邮箱需与公司邮箱一致）后可查看该岗位的招聘情况。" : "Selected people can view this position's recruiting after signing in with their own account (account email must match their company email)."}
      </p>
    </div>
  );
}
