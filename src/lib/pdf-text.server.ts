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
