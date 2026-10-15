import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { db as supabase } from "@/lib/db-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichTextarea } from "@/components/RichTextarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import type { Person } from "@/lib/talent";
import { certDoc, downloadDocx, downloadPdf, fetchCertSettings, type CertFacts } from "@/lib/reference-letters";

const FIELDS: { key: keyof CertFacts; label: string }[] = [
  { key: "name", label: "ref.f.name" },
  { key: "hire_date", label: "ref.f.hire_date" },
  { key: "role", label: "cert.f.role" },
  { key: "workload", label: "ref.f.workload" },
  { key: "weekly_hours", label: "cert.f.weekly_hours" },
];

async function fetchPeople() {
  const { data, error } = await supabase.from("people").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as unknown as Person[];
}

export function EmploymentCertificatePanel() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isHr = user?.role === "owner" || user?.role === "hr";
  const people = useQuery({ queryKey: ["people-all"], queryFn: fetchPeople });
  const cfg = useQuery({ queryKey: ["cert-settings"], queryFn: fetchCertSettings });
  const [personId, setPersonId] = useState("");
  const [facts, setFacts] = useState<CertFacts | null>(null);
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState("");

  if (!isHr) return null;

  const pick = (id: string) => {
    setPersonId(id);
    const p = (people.data ?? []).find((x) => x.id === id);
    if (!p) return;
    const pct = p.workload_pct ?? 100;
    const full = Number(cfg.data?.settings.fullTimeHours) || 42;
    setFacts({
      name: p.name,
      hire_date: p.hire_date ?? "",
      role: p.offer_title || p.appointed_role_title || "",
      workload: `${pct}%`,
      weekly_hours: String(Math.round(((full * pct) / 100) * 10) / 10),
      employee_address: p.address ?? "",
    });
  };

  const doc = facts && cfg.data ? certDoc(facts, cfg.data.settings) : null;
  // Editable body: seeded from the template, HR can adjust before downloading.
  const docKey = doc ? doc.paragraphs.join("\n") : "";
  useEffect(() => { setBody(docKey); }, [docKey]);
  const finalDoc = doc ? { ...doc, paragraphs: body.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) } : null;
  const run = async (kind: "docx" | "pdf") => {
    if (!finalDoc || !facts) return;
    setBusy(true);
    try {
      await (kind === "docx" ? downloadDocx(finalDoc) : downloadPdf(finalDoc));
      await supabase.from("audit_log").insert({ person_id: personId, action: "Employment certificate issued", entity: facts.name, detail: kind.toUpperCase() } as never);
      toast.success(t("cert.downloaded"));
    } catch (e) {
      toast.error(String((e as Error)?.message ?? e));
    } finally { setBusy(false); }
  };

  const list = (people.data ?? []).filter((p) => !p.archived && p.status !== "left");

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold">{t("cert.tab")}</h2>
      <div className="card-glass space-y-4 rounded-xl p-5">
        <div className="space-y-1.5">
          <Label>{t("ref.person")}</Label>
          <Select value={personId} onValueChange={pick}>
            <SelectTrigger><SelectValue placeholder={t("ref.pickPerson")} /></SelectTrigger>
            <SelectContent>
              {list.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}{p.staff_id ? ` · ${p.staff_id}` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {facts && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs">{t(label)}</Label>
                  <Input type={key === "hire_date" ? "date" : "text"} value={facts[key]} onChange={(e) => setFacts({ ...facts, [key]: e.target.value })} />
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label>{t("ref.f.address")}</Label>
              <Textarea rows={3} maxLength={500} value={facts.employee_address} placeholder={t("ref.f.addressPh")} onChange={(e) => setFacts({ ...facts, employee_address: e.target.value })} />
            </div>
            {doc && (
              <div className="space-y-1.5">
                <Label>{t("cert.preview")}</Label>
                <p className="text-xs text-muted-foreground">{t("cert.previewHint")}</p>
                <RichTextarea rows={5} value={body} onChange={setBody} />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="gap-1.5" disabled={busy} onClick={() => run("docx")}><Download className="size-4" /> {t("ref.word")}</Button>
              <Button variant="outline" className="gap-1.5" disabled={busy} onClick={() => run("pdf")}><Download className="size-4" /> {t("ref.pdf")}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
