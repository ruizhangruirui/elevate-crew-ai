/** Extracts plain text from a PDF (works on workerd and Node). Null if unreadable. */
export async function pdfToText(bytes: Uint8Array): Promise<string | null> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    const clean = String(text).replace(/\s+\n/g, "\n").trim();
    return clean ? clean.slice(0, 40000) : null;
  } catch {
    return null;
  }
}

/** Extracts plain text from a .docx (Word) file. Null if unreadable. */
export async function docxToText(bytes: Uint8Array): Promise<string | null> {
  try {
    const { unzipSync, strFromU8 } = await import("fflate");
    const files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
    const xml = files["word/document.xml"];
    if (!xml) return null;
    const text = strFromU8(xml)
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<\/w:p>|<w:br\/>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return text ? text.slice(0, 40000) : null;
  } catch {
    return null;
  }
}

export type CvReadFailure = "no_file" | "download_failed" | "unsupported_format" | "no_text";
export type CvReadResult = { text: string } | { text: null; reason: CvReadFailure };

/** Minimum readable characters for a CV to count as real evidence. */
export const MIN_CV_CHARS = 200;

/** Detects PDF / DOCX by magic bytes and extracts text. Scanned PDFs yield "no_text". */
export async function cvToText(bytes: Uint8Array): Promise<CvReadResult> {
  const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isPdf && !isZip) return { text: null, reason: "unsupported_format" };
  const text = isPdf ? await pdfToText(bytes) : await docxToText(bytes);
  if (!text) return { text: null, reason: isZip ? "unsupported_format" : "no_text" };
  if (text.replace(/\s/g, "").length < MIN_CV_CHARS) return { text: null, reason: "no_text" };
  return { text };
}
