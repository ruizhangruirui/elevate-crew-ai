import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Download, Upload, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db-client";
import { useI18n } from "@/lib/i18n";
import { fetchWorkspace } from "@/lib/talent";
import { importRoles, type RoleImportRow } from "@/lib/import-roles.functions";
import { useLocations } from "@/lib/locations";
import { useAuth } from "@/hooks/useAuth";
import { ConfirmAction } from "@/components/ConfirmAction";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const HEADERS = [
  "direction", "title", "description", "level_min", "level_max", "target_count",
  "criticality", "lab", "team", "employment_mode", "location",
] as const;
const CRIT = ["strategic_critical", "critical", "important"];
const MODES = ["local", "hq_dispatch"];

type Row = RoleImportRow & { error?: string };

export function ImportRolesDialog() {
  const { t } = useI18n();
  const { isOwner } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fileName, setFileName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: ws } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace, enabled: isOwner });
  const { data: locations = [] } = useLocations();
  const { data: nodes = [] } = useQuery({
    queryKey: ["org-nodes-import"],
    enabled: isOwner,
    queryFn: async () => {
      const { data, error } = await db.from("org_nodes").select("id,name,type,parent_id").eq("archived", false);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; type: string; parent_id: string | null }[];
    },
  });
  const labs = nodes.filter((n) => n.type === "Lab");
  const teams = nodes.filter((n) => n.type === "Team");
  const dirs = ws?.directions ?? [];

  const downloadTemplate = () => {
    const sample = [{
      direction: dirs[0]?.title ?? "Direction A",
      title: "Senior Research Engineer",
      description: "Owns ...",
      level_min: 15, level_max: 17, target_count: 2,
      criticality: "critical",
      lab: labs[0]?.name ?? "", team: teams.find((x) => x.parent_id === labs[0]?.id)?.name ?? "",
      employment_mode: "local",
      location: locations[0] ?? "Zurich",
    }];
    const sheet = XLSX.utils.json_to_sheet(sample, { header: HEADERS as unknown as string[] });
    sheet["!cols"] = HEADERS.map(() => ({ wch: 20 }));
    const ref = XLSX.utils.aoa_to_sheet([
      ["field", "required", "accepted values"],
      ["direction", "yes", dirs.map((d) => d.title).join(" | ")],
      ["title", "yes", "role name - direction + title is the key: existing roles are updated, new ones added"],
      ["description", "no", "free text"],
      ["level_min / level_max", "no", "number, default 14-16"],
      ["target_count", "no", "number, default 1"],
      ["criticality", "no", CRIT.join(" | ") + " (default important)"],
      ["lab", "no", labs.map((n) => n.name).join(" | ")],
      ["team", "no", teams.map((x) => `${x.name} (${labs.find((l) => l.id === x.parent_id)?.name ?? "-"})`).join(" | ")],
      ["employment_mode", "no", "local (Local Hire) | hq_dispatch (HQ Assignment)"],
      ["location", "no", locations.join(" | ")],
      ["(note)", "", "For existing roles, empty cells are left unchanged."],
    ]);
    ref["!cols"] = [{ wch: 22 }, { wch: 10 }, { wch: 90 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Roles");
    XLSX.utils.book_append_sheet(wb, ref, "Reference");
    XLSX.writeFile(wb, "roles-import-template.xlsx");
  };

  const parseFile = async (file: File) => {
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const first = wb.SheetNames[0];
      if (!first) throw new Error("empty");
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[first]!, { defval: "" });
      const dirNames = new Set(dirs.map((d) => d.title.trim().toLowerCase()));
      const parsed = raw.map((r) => {
        const pick = (k: string) => {
          const key = Object.keys(r).find((x) => x.trim().toLowerCase().replace(/\s+/g, "_") === k);
          return String(key ? (r[key] ?? "") : "").trim();
        };
        const num = (k: string) => { const v = pick(k); return v ? Number(v) : null; };
        const row: Row = {
          direction: pick("direction"), title: pick("title"), description: pick("description"),
          level_min: num("level_min"), level_max: num("level_max"), target_count: num("target_count"),
          criticality: pick("criticality").toLowerCase().replace(/\s+/g, "_") as Row["criticality"],
          lab: pick("lab"), team: pick("team"),
          employment_mode: pick("employment_mode").toLowerCase() as Row["employment_mode"],
          location: pick("location"),
        };
        if (!row.title) row.error = t("rimp.err.title");
        else if (!dirNames.has(row.direction.toLowerCase())) row.error = t("rimp.err.direction");
        else if ([row.level_min, row.level_max, row.target_count].some((n) => n !== null && !Number.isInteger(n))) row.error = t("imp.err.level");
        else if (row.criticality && !CRIT.includes(row.criticality)) row.error = t("rimp.err.crit");
        else if (row.employment_mode && !MODES.includes(row.employment_mode)) row.error = t("rimp.err.mode");
        return row;
      }).filter((r) => r.title || r.direction);
      setRows(parsed);
      setFileName(file.name);
      if (!parsed.length) toast.error(t("imp.err.empty"));
    } catch {
      toast.error(t("imp.err.parse"));
    }
  };

  const valid = (rows ?? []).filter((r) => !r.error);
  const invalid = (rows ?? []).filter((r) => r.error);

  const run = useMutation({
    mutationFn: () => importRoles({ data: { rows: valid.map(({ error: _e, ...r }) => r), fileName } }),
    onSuccess: (r) => {
      toast.success(t("imp.toast.done").replace("{c}", String(r.created)).replace("{u}", String(r.updated)));
      setOpen(false); setRows(null); setFileName("");
      qc.invalidateQueries({ refetchType: "all" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isOwner) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setRows(null); setFileName(""); } }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Upload className="mr-1.5 h-4 w-4" />{t("rimp.trigger")}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("rimp.title")}</DialogTitle>
          <DialogDescription>{t("rimp.desc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/30 p-3">
            <FileSpreadsheet className="h-4 w-4 text-brand" />
            <span className="text-sm text-muted-foreground">{t("imp.step1")}</span>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="mr-1.5 h-4 w-4" />{t("imp.template")}
            </Button>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t("imp.step2")}</p>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void parseFile(f); e.target.value = ""; }} />
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              <Upload className="mr-1.5 h-4 w-4" />{fileName || t("imp.choose")}
            </Button>
          </div>
          {rows && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <span>{t("imp.ready").replace("{n}", String(valid.length))}</span>
                {invalid.length > 0 && (
                  <span className="flex items-center gap-1 text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />{t("imp.invalid").replace("{n}", String(invalid.length))}
                  </span>
                )}
              </div>
              <div className="max-h-64 overflow-auto rounded-lg border border-border/60">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
                    <tr>{["Direction", "Role", "Level", "HC", "Lab / Team", t("loc.location"), t("imp.col.result")].map((h) => (
                      <th key={h} className="px-2 py-1.5 text-left">{h}</th>))}</tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t border-border/40">
                        <td className="px-2 py-1.5">{r.direction || "—"}</td>
                        <td className="px-2 py-1.5">{r.title || "—"}</td>
                        <td className="px-2 py-1.5">{r.level_min ?? "—"}–{r.level_max ?? "—"}</td>
                        <td className="px-2 py-1.5">{r.target_count ?? "—"}</td>
                        <td className="px-2 py-1.5">{[r.lab, r.team].filter(Boolean).join(" / ") || "—"}</td>
                        <td className="px-2 py-1.5">{r.location || "—"}</td>
                        <td className="px-2 py-1.5">{r.error ? <span className="text-destructive">{r.error}</span> : <span className="text-brand">{t("imp.ok")}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <ConfirmAction
            title={t("rimp.title")}
            description={<p>{t("rimp.confirmDesc").replace("{n}", String(valid.length))}</p>}
            confirmLabel={t("imp.confirm").replace("{n}", String(valid.length))}
            onConfirm={() => run.mutate()}
          >
            <Button disabled={!valid.length || invalid.length > 0 || valid.length > 500 || run.isPending}>
              {t("imp.confirm").replace("{n}", String(valid.length))}
            </Button>
          </ConfirmAction>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
