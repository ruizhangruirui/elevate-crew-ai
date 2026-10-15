/**
 * Lightweight formatting markup for letter templates (stored as plain text so
 * placeholders and both deployment modes keep working):
 *   [b]bold[/b]  [i]italic[/i]  [u]underline[/u]
 *   [color=#c00000]red[/color]  [size=14]14pt[/size]
 */
export type Run = { text: string; bold: boolean; italic: boolean; underline: boolean; color?: string | undefined; size?: number | undefined };

const TAG = /\[(\/?)(b|i|u|color|size)(?:=([#\w.]+))?\]/gi;

export function parseRich(line: string, base: Partial<Run> = {}): Run[] {
  const runs: Run[] = [];
  const st = { b: 0, i: 0, u: 0 };
  const colors: string[] = [];
  const sizes: number[] = [];
  let last = 0;
  const push = (text: string) => {
    if (!text) return;
    runs.push({
      text,
      bold: !!base.bold || st.b > 0,
      italic: !!base.italic || st.i > 0,
      underline: !!base.underline || st.u > 0,
      color: colors.at(-1) ?? base.color,
      size: sizes.at(-1) ?? base.size,
    });
  };
  for (const m of line.matchAll(TAG)) {
    push(line.slice(last, m.index));
    last = (m.index ?? 0) + m[0].length;
    const close = m[1] === "/";
    const tag = (m[2] ?? "").toLowerCase();
    if (tag === "b" || tag === "i" || tag === "u") st[tag] = Math.max(0, st[tag] + (close ? -1 : 1));
    else if (tag === "color") {
      if (close) colors.pop();
      else if (/^#[0-9a-f]{6}$/i.test(m[3] ?? "")) colors.push(m[3]!);
    } else if (tag === "size") {
      if (close) sizes.pop();
      else { const n = Number(m[3]); if (n >= 6 && n <= 48) sizes.push(n); }
    }
  }
  push(line.slice(last));
  return runs;
}

export const stripRich = (s: string) => s.replace(TAG, "");
