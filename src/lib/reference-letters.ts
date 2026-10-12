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

/* ---------------------------- Letterhead ---------------------------- */

export const LOGO_KEY = "ref_letterhead_logo";
export const WATERMARK_KEY = "ref_letterhead_watermark";
export const STATIONERY_KEY = "ref_letter_stationery";
export const DEFAULT_STATIONERY = {
  company: "", address: "", title: "Reference Letter", salutation: "", place: "",
  signoff: "", signatureName: "", signatureTitle: "", signatureContact: "", footer: "",
};
export type LetterStationery = typeof DEFAULT_STATIONERY;

export function parseStationery(value?: string): LetterStationery {
  try {
    const parsed: unknown = JSON.parse(value ?? "{}");
    const result = { ...DEFAULT_STATIONERY };
    if (parsed && typeof parsed === "object") {
      for (const key of Object.keys(result) as (keyof LetterStationery)[]) {
        const v = (parsed as Record<string, unknown>)[key];
        if (typeof v === "string") result[key] = v;
      }
    }
    return result;
  } catch { return { ...DEFAULT_STATIONERY }; }
}

export async function fetchLetterhead() {
  const { data, error } = await supabase.from("config_items").select("*").in("category", [LOGO_KEY, WATERMARK_KEY, STATIONERY_KEY]);
  if (error) throw error;
  const rows = (data ?? []) as unknown as RefTemplateRow[];
  const logo = rows.find((r) => r.category === LOGO_KEY) ?? null;
  const wm = rows.find((r) => r.category === WATERMARK_KEY) ?? null;
  const stationeryRow = rows.find((r) => r.category === STATIONERY_KEY) ?? null;
  return { logoRow: logo, watermarkRow: wm, stationeryRow, stationery: parseStationery(stationeryRow?.name), logo: logo?.name || null, watermark: wm ? wm.name !== "off" : true };
}

type Img = { data: Uint8Array; url: string; w: number; h: number; type: "png" | "jpg" };

async function loadImg(url: string, alpha = 1): Promise<Img> {
  const el = new Image();
  el.src = url;
  await el.decode();
  const c = document.createElement("canvas");
  c.width = el.naturalWidth;
  c.height = el.naturalHeight;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Cannot prepare company logo");
  ctx.globalAlpha = alpha;
  ctx.drawImage(el, 0, 0);
  const out = c.toDataURL("image/png");
  const encoded = out.split(",")[1];
  if (!encoded) throw new Error("Invalid company logo");
  const bin = atob(encoded);
  const data = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return { data, url: out, w: el.naturalWidth, h: el.naturalHeight, type: "png" };
}

async function letterhead() {
  const lh = await fetchLetterhead();
  return { stationery: lh.stationery, logo: lh.logo ? await loadImg(lh.logo) : null, mark: lh.logo && lh.watermark ? await loadImg(lh.logo, 0.08) : null };
}

const fit = (img: { w: number; h: number }, maxW: number, maxH: number) => {
  const k = Math.min(maxW / img.w, maxH / img.h);
  return { width: Math.round(img.w * k), height: Math.round(img.h * k) };
};

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

export async function downloadDocx(l: ReferenceLetter, signer: string, signerTitle = "") {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, Header, Footer, ImageRun, HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, HorizontalPositionAlign, VerticalPositionAlign, TextWrappingType } = await import("docx");
  const lh = await letterhead();
  const s = lh.stationery;
  const lines = (text: string) => text.split(/\r?\n/).filter((line) => line.trim());
  const signature = [s.signoff, s.signatureName || signer, s.signatureTitle || signerTitle, s.signatureContact].flatMap(lines);
  const headerKids: InstanceType<typeof Paragraph>[] = [];
  if (lh.logo) {
    const runs = [new ImageRun({ type: "png", data: lh.logo.data, transformation: fit(lh.logo, 160, 50), altText: { title: "Logo", description: "Company logo", name: "logo" } })];
    if (lh.mark)
      runs.push(new ImageRun({
        type: "png", data: lh.mark.data, transformation: fit(lh.mark, 420, 420),
        altText: { title: "Watermark", description: "Company watermark", name: "watermark" },
        floating: {
          horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, align: HorizontalPositionAlign.CENTER },
          verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, align: VerticalPositionAlign.CENTER },
          behindDocument: true, allowOverlap: true, wrap: { type: TextWrappingType.NONE },
        },
      }));
    headerKids.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: runs }));
  }
  for (const text of [s.company, s.address].flatMap(lines)) {
    headerKids.push(new Paragraph({ children: [new TextRun({ text, size: 18, bold: text === s.company })] }));
  }
  const headerLineCount = [s.company, s.address].flatMap(lines).reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 80)), 0);
  const footerLines = lines(s.footer);
  const today = new Date().toISOString().slice(0, 10);
  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: Math.max(1440, 720 + (lh.logo ? 1000 : 0) + headerLineCount * 240), right: 1440, bottom: Math.max(1440, 720 + footerLines.length * 240), left: 1440, header: 400, footer: 400 } } },
        ...(headerKids.length ? { headers: { default: new Header({ children: headerKids }) } } : {}),
        ...(footerLines.length ? { footers: { default: new Footer({ children: footerLines.map((text) => new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, size: 18 })] })) }) } : {}),
        children: [
          new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun([s.place, today].filter(Boolean).join(", "))] }),
          ...lines(fillTemplate(s.title, l.facts)).map((text) => new Paragraph({ keepNext: true, spacing: { before: 400, after: 400 }, children: [new TextRun({ text, bold: true, size: 32 })] })),
          ...lines(fillTemplate(s.salutation, l.facts)).map((text) => new Paragraph({ keepNext: true, spacing: { after: 240 }, children: [new TextRun(text)] })),
          ...paragraphs(l).map((p) => new Paragraph({ spacing: { after: 240 }, children: [new TextRun(p)] })),
          ...signature.map((text, i) => new Paragraph({ keepNext: i < signature.length - 1, spacing: { before: i === 0 ? 600 : 0, after: i === 0 && s.signoff ? 480 : 60 }, children: [new TextRun(text)] })),
        ],
      },
    ],
  });
  save(await Packer.toBlob(doc), `${fileBase(l)}.docx`);
}

export async function downloadPdf(l: ReferenceLetter, signer: string, signerTitle = "") {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 72;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const lh = await letterhead();
  const s = lh.stationery;
  const footerLines = pdf.splitTextToSize(s.footer, width) as string[];
  const bottom = pageH - Math.max(margin, footerLines.length * 12 + 32);
  // Canvas fallback keeps non-Latin stationery readable without remote font requests.
  const drawText = (text: string, x: number, y: number, size: number, bold = false, align: "left" | "right" | "center" = "left") => {
    pdf.setFont("helvetica", bold ? "bold" : "normal").setFontSize(size);
    if (!/[^\u0020-\u00ff]/.test(text)) { pdf.text(text, x, y, { align }); return; }
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Cannot render letter text");
    const font = `${bold ? "bold " : ""}${size * 3}px Arial, sans-serif`;
    ctx.font = font;
    canvas.width = Math.ceil(ctx.measureText(text).width) + 6;
    canvas.height = Math.ceil(size * 4.5);
    ctx.font = font;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, 0, size * 3);
    const w = canvas.width / 3;
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", x - (align === "right" ? w : align === "center" ? w / 2 : 0), y - size, w, canvas.height / 3);
  };
  const wrap = (text: string, size = 11) => {
    pdf.setFont("helvetica", "normal").setFontSize(size);
    if (!/[^\u0020-\u00ff]/.test(text)) return pdf.splitTextToSize(text, width) as string[];
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("Cannot measure letter text");
    ctx.font = `${size}px Arial, sans-serif`;
    return text.split(/\r?\n/).flatMap((paragraph) => {
      const result: string[] = []; let line = "";
      for (const char of paragraph) {
        if (line && ctx.measureText(line + char).width > width) { result.push(line); line = ""; }
        line += char;
      }
      result.push(line); return result;
    });
  };
  let contentTop = margin;
  const decorate = () => {
    if (lh.mark) {
      const s = fit(lh.mark, 360, 360);
      pdf.addImage(lh.mark.url, "PNG", (pageW - s.width) / 2, (pageH - s.height) / 2, s.width, s.height);
    }
    let headerY = 38;
    if (lh.logo) {
      const size = fit(lh.logo, 140, 44);
      pdf.addImage(lh.logo.url, "PNG", pageW - margin - size.width, 28, size.width, size.height);
      headerY = 88;
    }
    for (const text of [s.company, s.address].filter(Boolean)) {
      for (const line of wrap(text, 9)) { drawText(line, margin, headerY, 9, text === s.company); headerY += 13; }
    }
    contentTop = Math.max(margin, headerY + 18);
    wrap(s.footer, 9).forEach((line, i, all) => drawText(line, pageW / 2, pageH - 28 - (all.length - 1 - i) * 12, 9, false, "center"));
  };
  decorate();
  let y = contentTop;
  for (const line of wrap([s.place, new Date().toISOString().slice(0, 10)].filter(Boolean).join(", "), 10)) {
    drawText(line, margin + width, y, 10, false, "right"); y += 14;
  }
  y += 40;
  const write = (text: string, size = 11, bold = false) => {
    for (const line of wrap(text, size)) {
      if (y > bottom) { pdf.addPage(); decorate(); y = contentTop; }
      drawText(line, margin, y, size, bold);
      y += size + 5;
    }
    y += 10;
  };
  if (s.title) write(fillTemplate(s.title, l.facts), 16, true);
  if (s.salutation) write(fillTemplate(s.salutation, l.facts));
  for (const p of paragraphs(l)) write(p);
  const signature = [s.signoff, s.signatureName || signer, s.signatureTitle || signerTitle, s.signatureContact].filter(Boolean);
  const signatureHeight = signature.reduce((h, text) => h + wrap(text).length * 16 + 10, 30) + (s.signoff ? 24 : 0);
  if (y + signatureHeight > bottom && signatureHeight < bottom - contentTop) { pdf.addPage(); decorate(); y = contentTop; }
  y += 24;
  signature.forEach((text, i) => { write(text); if (i === 0 && s.signoff) y += 24; });
  pdf.save(`${fileBase(l)}.pdf`);
}
