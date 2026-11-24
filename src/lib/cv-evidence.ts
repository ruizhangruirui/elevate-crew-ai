/** Keeps only AI-extracted names that actually occur in the CV text (guards against invented schools/employers). */
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function appearsInCv(name: string, cv: string): boolean {
  const n = norm(name);
  if (!n) return false;
  const c = ` ${norm(cv)} `;
  if (c.includes(` ${n} `) || c.includes(n)) return true;
  const words = n.split(" ").filter((w) => w.length > 2);
  if (!words.length) return false;
  const hit = words.filter((w) => c.includes(` ${w} `) || c.includes(w)).length;
  return hit / words.length >= 0.6;
}

/** For "Degree · School" / "Title · Company" entries, verifies the part after "·". */
export function verifyPaired(items: string[], cv: string): string[] {
  return items.filter((it) => {
    const parts = it.split("·").map((p) => p.trim());
    const target = parts.length > 1 ? parts[parts.length - 1]! : parts[0]!;
    return appearsInCv(target, cv);
  });
}

export function verifyNames(items: string[], cv: string): string[] {
  return items.filter((it) => appearsInCv(it, cv));
}
