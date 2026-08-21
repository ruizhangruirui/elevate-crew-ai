import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Download, Upload, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fetchWorkspace } from "@/lib/talent";
import { recordJoin } from "@/lib/lifecycle";
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

const CONTRACTS = ["正式员工", "外包", "实习生", "外部顾问", "访问学者"];

const HEADERS = [
  "name",
  "level",
  "status",
  "contract_type",
  "team",
  "role",
  "tags",
  "note",
] as const;

type Row = {
  name: string;
  level: number | null;
  status: string;
  contract_type: string | null;
  team: string;
  role: string;
  tags: string[];
  note: string | null;
  error?: string;
};

type OrgNode = { id: string; name: string };

export function ImportPeopleDialog({ children }: { children?: React.ReactNode }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fileName, setFileName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: ws } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const { data: nodes } = useQuery({
    queryKey: ["org-nodes-import"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_nodes")
        .select("id,name")
        .eq("archived", false);
      if (error) throw error;
      return (data ?? []) as OrgNode[];
    },
  });

  const downloadTemplate = () => {
    const sample = [
      {
        name: "Jane Doe",
        level: 15,
        status: "onboard",
        contract_type: "正式员工",
        team: nodes?.[0]?.name ?? "Team A",
        role: ws?.roles?.[0]?.title ?? "",
        tags: "Best Paper; Tech Lead",
        note: "",
      },
    ];
    const sheet = XLSX.utils.json_to_sheet(sample, { header: HEADERS as unknown as string[] });
    sheet["!cols"] = HEADERS.map(() => ({ wch: 20 }));

    const ref = XLSX.utils.aoa_to_sheet([
      ["field", "required", "accepted values"],
      ["name", "yes", "free text"],
      ["level", "no", "number, e.g. 13-18"],
      ["status", "no", "onboard | candidate (default onboard)"],
      ["contract_type", "no", CONTRACTS.join(" | ")],
      ["team", "no", (nodes ?? []).map((n) => n.name).join(" | ") || "team name in Settings"],
      ["role", "no", (ws?.roles ?? []).map((r) => r.title).join(" | ") || "target role title"],
      ["tags", "no", "separated by ; or ,"],
      ["note", "no", "free text"],
    ]);
    ref["!cols"] = [{ wch: 16 }, { wch: 10 }, { wch: 70 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "People");
    XLSX.utils.book_append_sheet(wb, ref, "Reference");
    XLSX.writeFile(wb, "people-import-template.xlsx");
  };

  const parseFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const first = wb.SheetNames[0];
      if (!first) throw new Error("empty");
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[first]!, {
        defval: "",
      });
      const parsed: Row[] = raw
        .map((r) => {
          const pick = (k: string) => String(r[k] ?? "").trim();
          const name = pick("name");
          const statusRaw = pick("status").toLowerCase();
          const status = statusRaw === "candidate" ? "candidate" : "onboard";
          const levelRaw = pick("level");
          const level = levelRaw ? Number(levelRaw) : null;
          const contract = pick("contract_type");
          const tags = pick("tags")
            .split(/[;,，、]/)
            .map((s) => s.trim())
            .filter(Boolean);
          const teamName = pick("team");
          const roleTitle = pick("role");
          let error: string | undefined;
          if (!name) error = t("imp.err.name");
          else if (level !== null && Number.isNaN(level)) error = t("imp.err.level");
          else if (contract && !CONTRACTS.includes(contract)) error = t("imp.err.contract");
          else if (teamName && !(nodes ?? []).some((n) => n.name === teamName))
            error = t("imp.err.team");
          else if (roleTitle && !(ws?.roles ?? []).some((x) => x.title === roleTitle))
            error = t("imp.err.role");
          return {
            name,
            level: level !== null && !Number.isNaN(level) ? level : null,
            status,
            contract_type: contract || null,
            team: teamName,
            role: roleTitle,
            tags,
            note: pick("note") || null,
            ...(error ? { error } : {}),
          } as Row;
        })
        .filter((r) => r.name || r.error);
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
      if (!ws?.org) throw new Error(t("ppl.error.orgNotInit"));
      const payload = valid.map((r) => ({
        org_id: ws.org!.id,
        name: r.name,
        level: r.level,
        status: r.status,
        contract_type: r.contract_type,
        org_node_id: r.team ? ((nodes ?? []).find((n) => n.name === r.team)?.id ?? null) : null,
        role_id: r.role ? ((ws.roles ?? []).find((x) => x.title === r.role)?.id ?? null) : null,
        tags: r.tags,
        note: r.note,
      }));
      const { data: inserted, error } = await supabase.from("people").insert(payload).select("id,status");
      if (error) throw error;
      for (const p of inserted ?? []) {
        if (p.status === "onboard") await recordJoin(p.id, { reason: "new_hire" });
      }
      await supabase.from("audit_log").insert({
        action: "import_people",
        entity: "people",
        detail: `${payload.length} rows imported from ${fileName}`,
      });
      return payload.length;
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
                      <th className="px-2 py-1.5 text-left">{t("ppl.field.name")}</th>
                      <th className="px-2 py-1.5 text-left">{t("ppl.field.level")}</th>
                      <th className="px-2 py-1.5 text-left">{t("ppl.field.status")}</th>
                      <th className="px-2 py-1.5 text-left">{t("imp.col.team")}</th>
                      <th className="px-2 py-1.5 text-left">{t("imp.col.role")}</th>
                      <th className="px-2 py-1.5 text-left">{t("imp.col.result")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t border-border/40">
                        <td className="px-2 py-1.5">{r.name || "—"}</td>
                        <td className="px-2 py-1.5">{r.level ?? "—"}</td>
                        <td className="px-2 py-1.5">{r.status}</td>
                        <td className="px-2 py-1.5">{r.team || "—"}</td>
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
          <Button
            onClick={() => importRows.mutate()}
            disabled={!valid.length || importRows.isPending}
          >
            {t("imp.confirm").replace("{n}", String(valid.length))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
