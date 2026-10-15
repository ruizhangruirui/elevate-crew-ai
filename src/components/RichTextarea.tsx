import { useRef } from "react";
import { Bold, Italic, Underline } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

const COLORS = ["#000000", "#1f4e79", "#2e75b6", "#c00000", "#548235", "#7f7f7f"];
const SIZES = [9, 10, 11, 12, 14, 16, 18, 24];

/** Textarea with a small toolbar that wraps the selection in letter markup. */
export function RichTextarea({ value, onChange, rows = 3, id }: { value: string; onChange: (v: string) => void; rows?: number; id?: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLTextAreaElement>(null);
  const wrap = (open: string, close: string) => {
    const el = ref.current;
    if (!el) return;
    const a = el.selectionStart, b = el.selectionEnd;
    const next = value.slice(0, a) + open + value.slice(a, b) + close + value.slice(b);
    onChange(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + open.length, b + open.length); });
  };
  return (
    <div className="rounded-md border border-input">
      <div className="flex flex-wrap items-center gap-1 border-b border-border/60 px-1.5 py-1">
        <Button type="button" variant="ghost" size="icon" className="size-7" title={t("rt.bold")} onClick={() => wrap("[b]", "[/b]")}><Bold className="size-3.5" /></Button>
        <Button type="button" variant="ghost" size="icon" className="size-7" title={t("rt.italic")} onClick={() => wrap("[i]", "[/i]")}><Italic className="size-3.5" /></Button>
        <Button type="button" variant="ghost" size="icon" className="size-7" title={t("rt.underline")} onClick={() => wrap("[u]", "[/u]")}><Underline className="size-3.5" /></Button>
        <span className="mx-1 h-4 w-px bg-border" />
        {COLORS.map((c) => (
          <button key={c} type="button" title={c} aria-label={`${t("rt.color")} ${c}`} onClick={() => wrap(`[color=${c}]`, "[/color]")}
            className="size-4 rounded-full border border-border" style={{ background: c }} />
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        <select aria-label={t("rt.size")} className="h-7 rounded border border-input bg-background px-1 text-xs" value=""
          onChange={(e) => { if (e.target.value) wrap(`[size=${e.target.value}]`, "[/size]"); }}>
          <option value="">{t("rt.size")}</option>
          {SIZES.map((s) => <option key={s} value={s}>{s} pt</option>)}
        </select>
      </div>
      <Textarea ref={ref} id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className="rounded-none border-0 font-mono text-xs focus-visible:ring-0" />
    </div>
  );
}
