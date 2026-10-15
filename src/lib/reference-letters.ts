import { parseRich, stripRich, type Run } from "@/lib/rich-text";
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
  /** Employee postal address (HR enters it on request); printed top-left. */
  employee_address?: string;
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
  guide: "ref_template_guide",
} as const;

export const DEFAULT_TEMPLATES: Record<keyof typeof TEMPLATE_KEYS, string> = {
  current:
    "This is to confirm that {name} has been employed with us since {hire_date} as {job_title} in {lab} / {team}, with a workload of {workload}.",
  left:
    "This is to confirm that {name} was employed with us from {hire_date} to {exit_date} as {job_title} in {lab} / {team}, with a workload of {workload}. {name} left the company: {exit_reason}.",
  closing: "We thank {name} for the contribution and wish every success in the future.",
  guide: "Please describe: main responsibilities and projects; key achievements; professional skills; collaboration and conduct; and an overall recommendation.",
};

export const PLACEHOLDERS = Object.keys({
  name: 1, lab: 1, team: 1, hire_date: 1, job_title: 1, workload: 1, exit_date: 1, exit_reason: 1,
} satisfies Record<Exclude<keyof RefFacts, "employee_address">, 1>);

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
    rows: { current: get("current"), left: get("left"), closing: get("closing"), guide: get("guide") },
    text: {
      guide: get("guide")?.name || DEFAULT_TEMPLATES.guide,
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

/** A rendered letter: employee block top-left, HRD signature + company bottom-left. */
export type LetterDoc = {
  title: string;
  salutation: string;
  recipient: string[];
  paragraphs: string[];
  fileBase: string;
};


const splitLines = (text: string) => text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

function paragraphs(l: ReferenceLetter) {
  return [l.intro_text, l.supervisor_text ?? "", l.closing_text ?? ""].flatMap(splitLines);
}

export function referenceDoc(l: ReferenceLetter, s: LetterStationery): LetterDoc {
  return {
    title: fillTemplate(s.title, l.facts),
    salutation: fillTemplate(s.salutation, l.facts),
    recipient: [l.facts.name, ...splitLines(l.facts.employee_address ?? "")],
    paragraphs: paragraphs(l),
    fileBase: `Reference_Letter_${l.facts.name.replace(/\s+/g, "_")}`,
  };
}

function signatureLines(s: LetterStationery) {
  return [s.signoff, s.signatureName, s.signatureTitle, s.signatureContact].flatMap(splitLines);
}
function companyLines(s: LetterStationery) {
  return [s.company, s.address].flatMap(splitLines);
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadDocx(d: LetterDoc) {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, Header, Footer, ImageRun, HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, HorizontalPositionAlign, VerticalPositionAlign, TextWrappingType } = await import("docx");
  const lh = await letterhead();
  const s = lh.stationery;
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
  const footerLines = splitLines(s.footer);
  const signature = signatureLines(s);
  const company = companyLines(s);
  const today = new Date().toISOString().slice(0, 10);
  const runsOf = (text: string, base: Partial<Run> = {}) =>
    parseRich(text, base).map((r) => new TextRun({ text: r.text, bold: r.bold, italics: r.italic, ...(r.underline ? { underline: {} } : {}), ...(r.color ? { color: r.color.slice(1) } : {}), ...(r.size ? { size: r.size * 2 } : {}) }));
  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: lh.logo ? 2000 : 1440, right: 1440, bottom: Math.max(1440, 720 + footerLines.length * 240), left: 1440, header: 400, footer: 400 } } },
        ...(headerKids.length ? { headers: { default: new Header({ children: headerKids }) } } : {}),
        ...(footerLines.length ? { footers: { default: new Footer({ children: footerLines.map((text) => new Paragraph({ alignment: AlignmentType.CENTER, children: runsOf(text, { size: 9 }) })) }) } } : {}),
        children: [
          ...d.recipient.map((text) => new Paragraph({ children: [new TextRun(text)] })),
          new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 240 }, children: [new TextRun([s.place, today].filter(Boolean).join(", "))] }),
          ...splitLines(d.title).map((text) => new Paragraph({ keepNext: true, spacing: { before: 400, after: 400 }, children: runsOf(text, { bold: true, size: 16 }) })),
          ...splitLines(d.salutation).map((text) => new Paragraph({ keepNext: true, spacing: { after: 240 }, children: runsOf(text) })),
          ...d.paragraphs.map((p) => new Paragraph({ spacing: { after: 240 }, children: runsOf(p) })),
          ...signature.map((text, i) => new Paragraph({ keepNext: true, spacing: { before: i === 0 ? 600 : 0, after: i === 0 && s.signoff ? 480 : 60 }, children: runsOf(text) })),
          ...company.map((text, i) => new Paragraph({ keepNext: i < company.length - 1, spacing: { before: i === 0 ? 240 : 0 }, children: runsOf(text, { size: 9, bold: text === s.company }) })),
        ],
      },
    ],
  });
  save(await Packer.toBlob(doc), `${d.fileBase}.docx`);
}

export async function downloadPdf(d: LetterDoc) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 72;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const lh = await letterhead();
  const s = lh.stationery;
  const footerLines = splitLines(s.footer);
  const bottom = pageH - Math.max(margin, footerLines.length * 12 + 32);
  // Canvas fallback keeps non-Latin text readable without remote font requests.
  const fontStyle = (bold: boolean, italic: boolean) => (bold && italic ? "bolditalic" : bold ? "bold" : italic ? "italic" : "normal");
  const drawText = (text: string, x: number, y: number, size: number, bold = false, align: "left" | "right" | "center" = "left", italic = false, color = "#000000") => {
    pdf.setFont("helvetica", fontStyle(bold, italic)).setFontSize(size).setTextColor(color);
    if (!/[^\u0020-\u00ff]/.test(text)) { pdf.text(text, x, y, { align }); pdf.setTextColor("#000000"); return; }
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Cannot render letter text");
    const font = `${italic ? "italic " : ""}${bold ? "bold " : ""}${size * 3}px Arial, sans-serif`;
    ctx.font = font;
    canvas.width = Math.ceil(ctx.measureText(text).width) + 6;
    canvas.height = Math.ceil(size * 4.5);
    ctx.font = font;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = color;
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
  const measure = (r: Run, size: number) => {
    if (!/[^ -ÿ]/.test(r.text)) { pdf.setFont("helvetica", fontStyle(r.bold, r.italic)).setFontSize(size); return pdf.getTextWidth(r.text); }
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return r.text.length * size;
    ctx.font = `${r.italic ? "italic " : ""}${r.bold ? "bold " : ""}${size}px Arial, sans-serif`;
    return ctx.measureText(r.text).width;
  };
  /** Centered rich-text line (used for the footer). */
  const drawRichLine = (text: string, cx: number, yy: number, size: number) => {
    const runs = parseRich(text, { size });
    const ws = runs.map((r) => measure(r, r.size ?? size));
    let x = cx - ws.reduce((a, b) => a + b, 0) / 2;
    runs.forEach((r, i) => {
      const w = ws[i] ?? 0;
      drawText(r.text, x, yy, r.size ?? size, r.bold, "left", r.italic, r.color ?? "#000000");
      if (r.underline) { pdf.setLineWidth(0.5).setDrawColor(r.color ?? "#000000").line(x, yy + 1.5, x + w, yy + 1.5); }
      x += w;
    });
  };
  let contentTop = margin;
  const decorate = () => {
    if (lh.mark) {
      const m = fit(lh.mark, 360, 360);
      pdf.addImage(lh.mark.url, "PNG", (pageW - m.width) / 2, (pageH - m.height) / 2, m.width, m.height);
    }
    contentTop = margin;
    if (lh.logo) {
      const size = fit(lh.logo, 140, 44);
      pdf.addImage(lh.logo.url, "PNG", pageW - margin - size.width, 28, size.width, size.height);
      contentTop = Math.max(margin, 28 + size.height + 30);
    }
    footerLines.forEach((line, i, all) => drawRichLine(line, pageW / 2, pageH - 28 - (all.length - 1 - i) * 12, 9));
  };
  decorate();
  let y = contentTop;
  const write = (text: string, size = 11, bold = false, gap = 10) => {
    for (const line of wrap(text, size)) {
      if (y > bottom) { pdf.addPage(); decorate(); y = contentTop; }
      drawText(line, margin, y, size, bold);
      y += size + 5;
    }
    y += gap;
  };
  const writeRich = (text: string, base: Partial<Run> = {}, gap = 10) => {
    const pieces = parseRich(text, base).flatMap((r) =>
      r.text.split(/(\s+|[^\u0000-\u00ff])/).filter(Boolean).map((t) => ({ ...r, text: t })));
    let line: { r: Run; w: number; size: number }[] = [];
    let lineW = 0;
    const flush = () => {
      while (line.length && /^\s+$/.test(line[line.length - 1]?.r.text ?? "x")) line.pop();
      if (!line.length) return;
      const h = Math.max(...line.map((p) => p.size));
      if (y > bottom) { pdf.addPage(); decorate(); y = contentTop; }
      let x = margin;
      for (const p of line) {
        if (!/^\s+$/.test(p.r.text)) {
          drawText(p.r.text, x, y, p.size, p.r.bold, "left", p.r.italic, p.r.color ?? "#000000");
          if (p.r.underline) { pdf.setLineWidth(0.5).setDrawColor(p.r.color ?? "#000000").line(x, y + 1.5, x + p.w, y + 1.5); }
        }
        x += p.w;
      }
      y += h + 5; line = []; lineW = 0;
    };
    for (const r of pieces) {
      const size = r.size ?? 11;
      const w = measure(r, size);
      if (lineW + w > width && line.length) { flush(); if (/^\s+$/.test(r.text)) continue; }
      line.push({ r, w, size }); lineW += w;
    }
    flush();
    y += gap;
  };
  for (const line of d.recipient) write(line, 11, false, 0);
  y += 14;
  drawText([s.place, new Date().toISOString().slice(0, 10)].filter(Boolean).join(", "), margin + width, y, 10, false, "right");
  y += 40;
  for (const tl of splitLines(d.title)) writeRich(tl, { bold: true, size: 16 });
  for (const sl of splitLines(d.salutation)) writeRich(sl);
  for (const p of d.paragraphs) writeRich(p);
  const signature = signatureLines(s);
  const company = companyLines(s);
  const blockH = [...signature, ...company].reduce((h, text) => h + wrap(stripRich(text)).length * 16 + 4, 60) + (s.signoff ? 24 : 0);
  if (y + blockH > bottom && blockH < bottom - contentTop) { pdf.addPage(); decorate(); y = contentTop; }
  y += 24;
  signature.forEach((text, i) => { writeRich(text, {}, 2); if (i === 0 && s.signoff) y += 24; });
  y += 12;
  company.forEach((text) => writeRich(text, { size: 9, bold: text === s.company }, 0));
  pdf.save(`${d.fileBase}.pdf`);
}

/* ---------------------- Employment certificate ---------------------- */

export const CERT_KEY = "emp_cert_settings";
export const CERT_PLACEHOLDERS = ["name", "hire_date", "role", "workload", "weekly_hours"] as const;
export type CertFacts = Record<(typeof CERT_PLACEHOLDERS)[number], string> & { employee_address: string };
export const DEFAULT_CERT = {
  title: "Employment Certificate",
  salutation: "To whom it may concern,",
  body: "This is to certify that {name} has been employed with our company since {hire_date} as {role}, with a workload of {workload} ({weekly_hours} hours per week).",
  closing: "This certificate is issued at the request of the employee.",
  fullTimeHours: "42",
};
export type CertSettings = typeof DEFAULT_CERT;

export async function fetchCertSettings() {
  const { data, error } = await supabase.from("config_items").select("*").eq("category", CERT_KEY);
  if (error) throw error;
  const row = ((data ?? []) as unknown as RefTemplateRow[])[0] ?? null;
  const settings = { ...DEFAULT_CERT };
  try {
    const parsed = JSON.parse(row?.name ?? "{}") as Record<string, unknown>;
    for (const k of Object.keys(settings) as (keyof CertSettings)[]) if (typeof parsed[k] === "string") settings[k] = parsed[k] as string;
  } catch { /* keep defaults */ }
  return { row, settings };
}

export function certDoc(f: CertFacts, c: CertSettings): LetterDoc {
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in f ? (f as Record<string, string>)[k] || "—" : m));
  return {
    title: fill(c.title),
    salutation: fill(c.salutation),
    recipient: [f.name, ...splitLines(f.employee_address)],
    paragraphs: [c.body, c.closing].map(fill).flatMap(splitLines),
    fileBase: `Employment_Certificate_${f.name.replace(/\s+/g, "_")}`,
  };
}
