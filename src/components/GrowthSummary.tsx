import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Award, TrendingUp } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { Person } from "@/lib/talent";
import { fetchGrowthData, latestRating, perfTone } from "@/lib/growth";

export function perfLabel(t: (k: string) => string, key: string | null): string {
  const map: Record<string, string> = {
    exceeds: t("sheet.person.exceedsExpectation"),
    meets: t("sheet.person.meetsExpectation"),
    below: t("sheet.person.belowExpectation"),
  };
  return (key && map[key]) || t("growth.card.none");
}

export function readinessLabel(t: (k: string) => string, key: string | null): string {
  const map: Record<string, string> = {
    ready: t("sheet.person.readyNow"),
    ready_1y: t("sheet.person.ready1yFull"),
    ready_2y: t("sheet.person.ready2yFull"),
  };
  return (key && map[key]) || t("growth.card.none");
}

export function ratingChipClass(rating: string | null): string {
  const tone = perfTone(rating);
  return tone === "ok"
    ? "border-ok/50 bg-ok/10 text-ok"
    : tone === "danger"
      ? "border-danger/50 bg-danger/10 text-danger"
      : "border-border/70 text-muted-foreground";
}

function Cell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface-raised/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/** Compact per-person Performance & Growth summary, shown on the person page. */
export function GrowthSummary({ person }: { person: Person }) {
  const { t } = useI18n();
  const { data } = useQuery({ queryKey: ["growth-data"], queryFn: fetchGrowthData });

  const records = (data?.records ?? []).filter((r) => r.person_id === person.id);
  const milestones = (data?.milestones ?? []).filter((m) => m.person_id === person.id);
  const promotions = milestones.filter((m) => m.kind === "promotion");
  const awards = milestones.filter((m) => m.kind === "award" || m.kind === "certification");
  const rating = latestRating(person, data?.records ?? []);
  const lastPromo = promotions[0] ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-xs ${ratingChipClass(rating)}`}>
          {t("growth.card.latest")}: {perfLabel(t, rating)}
        </span>
        <span className="rounded-full border border-border/70 px-2.5 py-1 text-xs text-muted-foreground">
          {t("growth.card.gridPos")}: {perfLabel(t, rating)} · {readinessLabel(t, person.readiness ?? null)}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Cell label={t("growth.card.reviews")} value={records.length} />
        <Cell label={t("growth.card.promotions")} value={promotions.length} />
        <Cell label={t("growth.card.awards")} value={awards.length} />
      </div>

      {lastPromo && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <TrendingUp className="size-3.5 text-ok" />
          {t("growth.card.lastPromotion")}: {lastPromo.title}
          {lastPromo.from_level && lastPromo.to_level
            ? ` (L${lastPromo.from_level} → L${lastPromo.to_level})`
            : ""}{" "}
          · {lastPromo.effective_on}
        </p>
      )}
      {awards[0] && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Award className="size-3.5 text-brand" />
          {awards[0].title} · {awards[0].effective_on}
        </p>
      )}

      <Link
        to="/growth"
        className="inline-flex items-center gap-1 text-xs text-brand underline-offset-2 hover:underline"
      >
        {t("growth.card.viewAll")} <ArrowUpRight className="size-3.5" />
      </Link>
    </div>
  );
}
