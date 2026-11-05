import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { db } from "@/lib/db-client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hrNodes, type ScopeNode } from "@/lib/people-scope";

/** Pick one person from the People list (single select, searchable). */
export function PersonPicker({ label, value, onChange, clearLabel, scope }: {
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  clearLabel: string;
  /** "hr": only people in the HR team. */
  scope?: "hr";
}) {
  const [q, setQ] = useState("");
  const people = useQuery({
    queryKey: ["people-names"],
    queryFn: async () => {
      const { data, error } = await db.from("people").select("id,name,org_node_id").eq("archived", false).order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; org_node_id: string | null }[];
    },
  });
  const nodes = useQuery({
    queryKey: ["scope-org-nodes"],
    enabled: scope === "hr",
    queryFn: async () => {
      const { data, error } = await db.from("org_nodes").select("id,name,type,parent_id").eq("archived", false);
      if (error) throw error;
      return (data ?? []) as ScopeNode[];
    },
  });
  const all = people.data ?? [];
  const list = useMemo(() => {
    if (scope !== "hr") return all;
    const hr = hrNodes(nodes.data ?? []);
    return all.filter((p) => p.id === value || (p.org_node_id && hr.has(p.org_node_id)));
  }, [all, nodes.data, scope, value]);
  const name = useMemo(() => list.find((p) => p.id === value)?.name ?? null, [list, value]);
  const shown = list.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 50);

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {name && (
        <span className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs">
          {name}
          <button type="button" onClick={() => onChange(null)} aria-label={clearLabel}><X className="size-3" /></button>
        </span>
      )}
      <Input className="h-8 text-xs" placeholder={`${label}…`} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-36 overflow-y-auto rounded-md border p-1">
        {shown.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            className={`block w-full truncate rounded px-2 py-1 text-left text-xs ${p.id === value ? "bg-brand/12 font-medium text-brand" : "hover:bg-muted"}`}
          >
            {p.name}
          </button>
        ))}
        {!shown.length && <p className="px-2 py-1 text-xs text-muted-foreground">—</p>}
      </div>
    </div>
  );
}
