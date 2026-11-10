import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StatTile } from "@/components/StatTile";
import { useI18n } from "@/lib/i18n";
import { fetchWorkspace } from "@/lib/talent";
import { fetchOrgNodes } from "@/lib/org-tree";
import { formatDate } from "@/lib/dates";
import { allowsFixedTerm, contractLabel, daysUntil, labTeamOf, PERIPHERAL_CONTRACTS } from "@/lib/contract";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/contracts")({
  head: () => ({
    meta: [
      { title: "Contract Monitor · Talent Management" },
      { name: "description", content: "Track fixed-term contract end dates for leased staff and interns." },
      { property: "og:title", content: "Contract Monitor · Talent Management" },
      { property: "og:description", content: "Track fixed-term contract end dates for leased staff and interns." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContractsPage,
});

function ContractsPage() {
  const { t } = useI18n();
  return (
    <AppShell title={t("cm.title")}>
      <ContractsBody />
    </AppShell>
  );
}

type Status = "expired" | "30" | "90" | "later" | "missing";
const TONE: Record<Status, string> = {
  expired: "border-danger/40 bg-danger/10 text-danger",
  "30": "border-warn/40 bg-warn/10 text-warn",
  "90": "border-brand/40 bg-brand/10 text-brand",
  later: "border-ok/40 bg-ok/10 text-ok",
  missing: "border-border bg-muted text-muted-foreground",
};

function ContractsBody() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const { data: nodes = [] } = useQuery({ queryKey: ["org-nodes"], queryFn: fetchOrgNodes });
  const [q, setQ] = useState("");
  const [lab, setLab] = useState("all");
  const [contract, setContract] = useState("all");
  const [status, setStatus] = useState<"all" | Status>("all");

  const rows = useMemo(() => {
    const people = ((data?.people ?? []) as any[]).filter((p) => p.fixed_term && allowsFixedTerm(p.contract_type));
    return people
      .map((p) => {
        const days = p.contract_end_on ? daysUntil(p.contract_end_on) : null;
        const st: Status = days == null ? "missing" : days < 0 ? "expired" : days <= 30 ? "30" : days <= 90 ? "90" : "later";
        const lt = labTeamOf(nodes as any, p.org_node_id);
        return { p, days, st, lab: lt.lab, team: lt.team };
      })
      .sort((a, b) => (a.days ?? -1e9) - (b.days ?? -1e9));
  }, [data, nodes]);

  const shown = rows.filter((r) =>
    (lab === "all" || r.lab?.id === lab) &&
    (contract === "all" || r.p.contract_type === contract) &&
    (status === "all" || r.st === status) &&
    (!q.trim() || `${r.p.name} ${r.p.staff_id ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));
  const count = (s: Status) => rows.filter((r) => r.st === s).length;
  const labs = (nodes as any[]).filter((n) => n.type === "Lab" && !n.archived);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={t("cm.stat.total")} value={rows.length} />
        <StatTile label={t("cm.st.expired")} value={count("expired")} tone="danger" />
        <StatTile label={t("cm.st.30")} value={count("30")} tone="warn" />
        <StatTile label={t("cm.st.90")} value={count("90")} />
      </div>
      <div className="card-glass p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input className="pl-8" placeholder={t("cm.search")} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={lab} onValueChange={setLab}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("cm.allLabs")}</SelectItem>
              {labs.map((n) => <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={contract} onValueChange={setContract}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("cm.allContracts")}</SelectItem>
              {[...PERIPHERAL_CONTRACTS].map((c) => <SelectItem key={c} value={c}>{contractLabel(t, c)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">—</SelectItem>
              {(["expired", "30", "90", "later", "missing"] as Status[]).map((s) => <SelectItem key={s} value={s}>{t(`cm.st.${s}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="py-2 pr-3 font-medium">{t("cm.col.person")}</th>
                <th className="py-2 pr-3 font-medium">{t("cm.col.labTeam")}</th>
                <th className="py-2 pr-3 font-medium">{t("cm.col.contract")}</th>
                <th className="py-2 pr-3 font-medium">{t("cm.col.end")}</th>
                <th className="py-2 pr-3 font-medium">{t("cm.col.left")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ p, days, st, lab: l, team }) => (
                <tr
                  key={p.id}
                  className="cursor-pointer border-b border-border/40 hover:bg-muted/40"
                  onClick={() => navigate({ to: "/people/$personId", params: { personId: p.id } })}
                >
                  <td className="py-2 pr-3 font-medium">{p.name}{p.staff_id && <span className="ml-1.5 text-xs text-muted-foreground">{p.staff_id}</span>}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{[l?.name, team?.name].filter(Boolean).join(" / ") || "—"}</td>
                  <td className="py-2 pr-3">{contractLabel(t, p.contract_type)}</td>
                  <td className="py-2 pr-3">{formatDate(p.contract_end_on)}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-md border px-2 py-0.5 text-xs ${TONE[st]}`}>
                      {days != null && days >= 0 ? t("cm.days").replace("{n}", String(days)) : t(`cm.st.${st}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t("cm.empty")}</p>}
        </div>
      </div>
    </div>
  );
}
