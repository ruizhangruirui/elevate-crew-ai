import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Download, Upload, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db as supabase } from "@/lib/db-client";
import { useI18n } from "@/lib/i18n";
import { fetchWorkspace } from "@/lib/talent";
import { importPeople } from "@/lib/import-people.functions";
import { CONTRACTS, type ContractType } from "@/lib/contract";
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

const HEADERS = ["staff_id", "name", "lab", "team", "contract_type", "hire_date", "level", "role"] as const;

type Row = {
  staff_id: string;
  name: string;
  lab: string;
  team: string;
  contract_type: ContractType;
  hire_date: string | null;
  level: number | null;
  role: string;
  error?: string;
};

type OrgNode = { id: string; name: string; type: string; parent_id: string | null };

function toIsoDate(v: unknown): string | null | "invalid" {
  if (v === "" || v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const d = new Date(v.getTime() - v.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim().replace(/[./]/g, "-");
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return "invalid";
  return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
}

export function ImportPeopleDialog({ children }: { children?: React.ReactNode }) {
  const { t } = useI18n();
  const { isOwner } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fileName, setFileName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: ws } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace, enabled: isOwner });
  const { data: nodes } = useQuery({
    queryKey: ["org-nodes-import"],
    enabled: isOwner,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_nodes")
        .select("id,name,type,parent_id")
        .eq("archived", false);
      if (error) throw error;
      return (data ?? []) as OrgNode[];
    },
  });

  const labs = (nodes ?? []).filter((n) => n.type === "Lab");
  const teams = (nodes ?? []).filter((n) => n.type === "Team");

  const downloadTemplate = () => {
    const firstLab = labs[0];
    const firstTeam = teams.find((tm) => tm.parent_id === firstLab?.id);
    const sample = [
      {
        staff_id: "S0001",
        name: "Jane Doe",
        lab: firstLab?.name ?? "Lab A",
        team: firstTeam?.name ?? "",
        contract_type: "Employee",
        hire_date: "2024-03-01",
        level: 15,
        role: ws?.roles?.[0]?.title ?? "",
      },
    ];
    const sheet = XLSX.utils.json_to_sheet(sample, { header: HEADERS as unknown as string[] });
    sheet["!cols"] = HEADERS.map(() => ({ wch: 20 }));

    const ref = XLSX.utils.aoa_to_sheet([
      ["field", "required", "accepted values"],
      ["staff_id", "yes", "unique staff ID"],
      ["name", "yes", "full name"],
      ["lab", "yes", labs.map((n) => n.name).join(" | ")],
      ["team", "no", teams.map((tm) => `${tm.name} (${labs.find((l) => l.id === tm.parent_id)?.name ?? "-"})`).join(" | ")],
      ["contract_type", "yes", CONTRACTS.join(" | ")],
      ["hire_date", "no", "YYYY-MM-DD"],
      ["level", "no", "number, e.g. 13-18"],
      ["role", "no", (ws?.roles ?? []).map((r) => r.title).join(" | ")],
    ]);
    ref["!cols"] = [{ wch: 16 }, { wch: 10 }, { wch: 90 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "People");
    XLSX.utils.book_append_sheet(wb, ref, "Reference");
    XLSX.writeFile(wb, "people-import-template.xlsx");
  };

  const parseFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const first = wb.SheetNames[0];
      if (!first) throw new Error("empty");
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[first]!, { defval: "" });
      const seen = new Set<string>();
      const parsed: Row[] = raw
        .map((r) => {
          const pick = (k: string) => {
            const key = Object.keys(r).find((x) => x.trim().toLowerCase().replace(/\s+/g, "_") === k);
            return String(key ? (r[key] ?? "") : "").trim();
          };
          const staff_id = pick("staff_id");
          const name = pick("name");
          const labName = pick("lab");
          const teamName = pick("team");
          const contract = pick("contract_type");
          const date = toIsoDate(r[Object.keys(r).find((x) => x.trim().toLowerCase().replace(/\\s+/g, "_") === "hire_date") ?? "hire_date"]);
          const levelRaw = pick("level");
          const level = levelRaw ? Number(levelRaw) : null;
          const roleTitle = pick("role");
          let error: string | undefined;
          if (!staff_id) error = t("imp.err.staffId");
          else if (seen.has(staff_id)) error = t("imp.err.staffDup");
          else if (!name) error = t("imp.err.name");
          else if (!(CONTRACTS as readonly string[]).includes(contract)) error = t("imp.err.contract");
          else if (date === "invalid") error = t("imp.err.date");
          else if (level !== null && Number.isNaN(level)) error = t("imp.err.level");
          if (staff_id) seen.add(staff_id);
          return {
            staff_id,
            name,
            lab: labName,
            team: teamName,
            contract_type: contract as ContractType,
            hire_date: date === "invalid" ? null : date,
            level: level !== null && !Number.isNaN(level) ? level : null,
            role: roleTitle,
            ...(error ? { error } : {}),
          } as Row;
        })
        .filter((r) => r.name || r.staff_id || r.error);
      setRows(parsed);
      setFileName(file.name);
      if (!parsed.length) toast.error(t("imp.err.empty"));
    } catch {
      toast.error(t("imp.err.parse"));
    }
  };

  const valid = (rows ?? []).filter((r) => !r.error);
  const invalid = (rows ?? []).filter((r) => r.error);

  const importRows = useMutation({
    mutationFn: async () => {
      if (!isOwner) throw new Error(t("imp.ownerOnly"));
      return importPeople({ data: { rows: valid.map(({ error: _error, ...row }) => row), fileName } });
    },
    onSuccess: (n) => {
      toast.success(t("imp.toast.done").replace("{n}", String(n)));
      setOpen(false);
      setRows(null);
      setFileName("");
      qc.invalidateQueries({ refetchType: "all" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isOwner) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setRows(null);
          setFileName("");
        }
      }}
    >
      <DialogTrigger asChild>
        {children ?? (
          <Button variant="outline" size="sm">
            <Upload className="mr-1.5 h-4 w-4" />
            {t("imp.trigger")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("imp.title")}</DialogTitle>
          <DialogDescription>{t("imp.desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/30 p-3">
            <FileSpreadsheet className="h-4 w-4 text-brand" />
            <span className="text-sm text-muted-foreground">{t("imp.step1")}</span>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="mr-1.5 h-4 w-4" />
              {t("imp.template")}
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t("imp.step2")}</p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void parseFile(f);
                e.target.value = "";
              }}
            />
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              <Upload className="mr-1.5 h-4 w-4" />
              {fileName || t("imp.choose")}
            </Button>
          </div>

          {rows && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-foreground">
                  {t("imp.ready").replace("{n}", String(valid.length))}
                </span>
                {invalid.length > 0 && (
                  <span className="flex items-center gap-1 text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {t("imp.invalid").replace("{n}", String(invalid.length))}
                  </span>
                )}
              </div>
              <div className="max-h-64 overflow-auto rounded-lg border border-border/60">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 text-left">{t("pp.f.staffId")}</th>
                      <th className="px-2 py-1.5 text-left">{t("ppl.field.name")}</th>
                      <th className="px-2 py-1.5 text-left">{t("pp.f.lab")}</th>
                      <th className="px-2 py-1.5 text-left">{t("imp.col.team")}</th>
                      <th className="px-2 py-1.5 text-left">{t("ppl.field.level")}</th>
                      <th className="px-2 py-1.5 text-left">{t("imp.col.role")}</th>
                      <th className="px-2 py-1.5 text-left">{t("imp.col.result")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t border-border/40">
                        <td className="px-2 py-1.5">{r.staff_id || "—"}</td>
                        <td className="px-2 py-1.5">{r.name || "—"}</td>
                        <td className="px-2 py-1.5">{r.lab || "—"}</td>
                        <td className="px-2 py-1.5">{r.team || "—"}</td>
                        <td className="px-2 py-1.5">{r.level ?? "—"}</td>
                        <td className="px-2 py-1.5">{r.role || "—"}</td>
                        <td className="px-2 py-1.5">
                          {r.error ? (
                            <span className="text-destructive">{r.error}</span>
                          ) : (
                            <span className="text-brand">{t("imp.ok")}</span>
                          )}
                        </td>
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
            title={t("imp.confirmTitle")}
            description={<p>{t("imp.confirmDesc").replace("{n}", String(valid.length))}</p>}
            confirmLabel={t("imp.confirm").replace("{n}", String(valid.length))}
            onConfirm={() => importRows.mutate()}
          >
            <Button disabled={!valid.length || invalid.length > 0 || valid.length > 500 || importRows.isPending}>
              {t("imp.confirm").replace("{n}", String(valid.length))}
            </Button>
          </ConfirmAction>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
