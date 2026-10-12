import { db as supabase } from "@/lib/db-client";

export type RefStatus = "requested" | "submitted" | "approved";

export type RefFacts = {
  name: string;
  lab: string;
  team: string;
  hire_date: string;
  job_title: string;
  workload: string;
  exit_date: string;
  exit_reason: string;
};

export type ReferenceLetter = {
  id: string;
  person_id: string;
  supervisor_person_id: string | null;
  status: RefStatus | string;
  facts: RefFacts;
  intro_text: string;
  supervisor_text: string | null;
  closing_text: string | null;
  hr_note: string | null;
  requested_by: string | null;
  submitted_by: string | null;
  approved_by: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
};

export const TEMPLATE_KEYS = {
  current: "ref_template_current",
  left: "ref_template_left",
  closing: "ref_template_closing",
} as const;

export const DEFAULT_TEMPLATES: Record<keyof typeof TEMPLATE_KEYS, string> = {
  current:
    "This is to confirm that {name} has been employed with us since {hire_date} as {job_title} in {lab} / {team}, with a workload of {workload}.",
  left:
    "This is to confirm that {name} was employed with us from {hire_date} to {exit_date} as {job_title} in {lab} / {team}, with a workload of {workload}. {name} left the company: {exit_reason}.",
  closing: "We thank {name} for the contribution and wish every success in the future.",
};

export const PLACEHOLDERS = Object.keys({
  name: 1, lab: 1, team: 1, hire_date: 1, job_title: 1, workload: 1, exit_date: 1, exit_reason: 1,
} satisfies Record<keyof RefFacts, 1>);

export function fillTemplate(tpl: string, f: RefFacts) {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => ((f as Record<string, string>)[k] || (k in f ? "—" : m)));
}

export async function fetchReferenceLetters() {
  const { data, error } = await supabase.from("reference_letters").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ReferenceLetter[];
}

export type RefTemplateRow = { id: string; category: string; name: string };

export async function fetchRefTemplates() {
  const { data, error } = await supabase
    .from("config_items")
    .select("*")
    .in("category", Object.values(TEMPLATE_KEYS));
  if (error) throw error;
  const rows = (data ?? []) as unknown as RefTemplateRow[];
  const get = (k: keyof typeof TEMPLATE_KEYS) =>
    rows.find((r) => r.category === TEMPLATE_KEYS[k]) ?? null;
  return {
    rows: { current: get("current"), left: get("left"), closing: get("closing") },
    text: {
      current: get("current")?.name || DEFAULT_TEMPLATES.current,
      left: get("left")?.name || DEFAULT_TEMPLATES.left,
      closing: get("closing")?.name || DEFAULT_TEMPLATES.closing,
    },
  };
}

/* ------------------------------ Export ------------------------------ */

function paragraphs(l: ReferenceLetter) {
  return [l.intro_text, l.supervisor_text ?? "", l.closing_text ?? ""]
    .flatMap((s) => s.split(/\n{2,}|\n/))
    .map((s) => s.trim())
    .filter(Boolean);
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fileBase = (l: ReferenceLetter) => `Reference_Letter_${l.facts.name.replace(/\s+/g, "_")}`;

export async function downloadDocx(l: ReferenceLetter, signer: string) {
  const { Document, Packer, Paragraph, TextRun, AlignmentType } = await import("docx");
  const today = new Date().toISOString().slice(0, 10);
  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        children: [
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun(today)] }),
          new Paragraph({ spacing: { before: 400, after: 400 }, children: [new TextRun({ text: "Reference Letter", bold: true, size: 32 })] }),
          ...paragraphs(l).map((p) => new Paragraph({ spacing: { after: 240 }, children: [new TextRun(p)] })),
          new Paragraph({ spacing: { before: 600 }, children: [new TextRun(signer)] }),
        ],
      },
    ],
  });
  save(await Packer.toBlob(doc), `${fileBase(l)}.docx`);
}

export async function downloadPdf(l: ReferenceLetter, signer: string) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 72;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  let y = margin;
  pdf.setFont("helvetica", "normal").setFontSize(10);
  pdf.text(new Date().toISOString().slice(0, 10), margin + width, y, { align: "right" });
  y += 40;
  pdf.setFont("helvetica", "bold").setFontSize(16).text("Reference Letter", margin, y);
  y += 32;
  pdf.setFont("helvetica", "normal").setFontSize(11);
  for (const p of [...paragraphs(l), "", signer]) {
    const lines = pdf.splitTextToSize(p, width) as string[];
    for (const line of lines) {
      if (y > pdf.internal.pageSize.getHeight() - margin) { pdf.addPage(); y = margin; }
      pdf.text(line, margin, y);
      y += 16;
    }
    y += 10;
  }
  pdf.save(`${fileBase(l)}.pdf`);
}
