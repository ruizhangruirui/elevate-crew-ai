import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Award, TrendingUp, GraduationCap, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StatTile } from "@/components/StatTile";
import { useI18n } from "@/lib/i18n";
import { fetchWorkspace, type Person } from "@/lib/talent";
import {
  fetchGrowthData,
  growthStats,
  nineBox,
  PERF_KEYS,
  READINESS_KEYS,
  latestRating,
} from "@/lib/growth";
import { perfLabel, readinessLabel, ratingChipClass } from "@/components/GrowthSummary";

export const Route = createFileRoute("/growth")({
  head: () => ({
    meta: [
      { title: "绩效与成长 · 战略岗位与人才管理系统" },
      {
        name: "description",
        content: "组织级绩效评估覆盖率、人才九宫格、晋升与奖项成长轨迹。",
      },
      { property: "og:title", content: "绩效与成长 · 战略岗位与人才管理系统" },
      {
        property: "og:description",
        content: "组织级绩效评估覆盖率、人才九宫格、晋升与奖项成长轨迹。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GrowthPage,
});

function PersonChip({ person, rating }: { person: Person; rating: string | null }) {
  return (
    <Link
      to="/people/$personId"
      params={{ personId: person.id }}
      className={`inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[11px] transition-colors hover:bg-accent ${ratingChipClass(rating)}`}
    >
      <span className="truncate">{person.name}</span>
      {person.level ? <span className="text-muted-foreground">L{person.level}</span> : null}
    </Link>
  );
}

function GrowthPage() {
  const { t } = useI18n();
  const ws = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const growth = useQuery({ queryKey: ["growth-data"], queryFn: fetchGrowthData });

  const people = useMemo(
    () => (ws.data?.people ?? []).filter((p) => p.status === "onboard"),
    [ws.data],
  );
  const records = growth.data?.records ?? [];
  const milestones = growth.data?.milestones ?? [];

  const stats = useMemo(
    () => growthStats(people, records, milestones),
    [people, records, milestones],
  );
  const grid = useMemo(() => nineBox(people, records), [people, records]);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const loading = ws.isLoading || growth.isLoading;

  return (
    <AppShell title={t("growth.title")} subtitle={t("growth.subtitle")}>
      {loading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <div className="space-y-8">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatTile
              label={t("growth.stat.coverage")}
              value={`${stats.coverage}%`}
              tone={stats.coverage >= 70 ? "ok" : stats.coverage >= 40 ? "warn" : "danger"}
            />
            <StatTile
              label={t("growth.stat.exceeds")}
              value={stats.ratingCounts["exceeds"] ?? 0}
              tone="ok"
            />
            <StatTile
              label={t("growth.stat.below")}
              value={stats.ratingCounts["below"] ?? 0}
              tone={(stats.ratingCounts["below"] ?? 0) > 0 ? "danger" : "default"}
            />
            <StatTile label={t("growth.stat.promotions")} value={stats.promotions12m.length} />
            <StatTile label={t("growth.stat.readyNow")} value={stats.readyNow} tone="ok" />
          </div>

          {/* 9-box grid */}
          <section className="rounded-xl border border-border/70 bg-surface-raised/40 p-4 md:p-5">
            <h2 className="font-display text-lg font-semibold">{t("growth.grid.title")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("growth.grid.hint")}</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[620px] border-separate border-spacing-1">
                <thead>
                  <tr>
                    <th className="w-24 text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {t("growth.grid.axisPerf")} \ {t("growth.grid.axisReadiness")}
                    </th>
                    {READINESS_KEYS.map((rd) => (
                      <th
                        key={rd}
                        className="text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
                      >
                        {readinessLabel(t, rd)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERF_KEYS.map((perf) => (
                    <tr key={perf}>
                      <th className="align-top text-left text-xs font-medium text-muted-foreground">
                        {perfLabel(t, perf)}
                      </th>
                      {READINESS_KEYS.map((rd) => {
                        const cell = grid.get(`${perf}:${rd}`) ?? [];
                        const highlight =
                          perf === "exceeds" && rd === "ready"
                            ? "border-ok/50 bg-ok/5"
                            : perf === "below" && rd === "ready_2y"
                              ? "border-danger/40 bg-danger/5"
                              : "border-border/60";
                        return (
                          <td
                            key={rd}
                            className={`min-w-[160px] rounded-lg border p-2 align-top ${highlight}`}
                          >
                            {cell.length === 0 ? (
                              <span className="text-xs text-muted-foreground">
                                {t("growth.grid.empty")}
                              </span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {cell.slice(0, 8).map((p) => (
                                  <PersonChip key={p.id} person={p} rating={perf} />
                                ))}
                                {cell.length > 8 && (
                                  <span className="text-[11px] text-muted-foreground">
                                    {t("growth.grid.more").replace(
                                      "{n}",
                                      String(cell.length - 8),
                                    )}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* growth timeline */}
            <section className="rounded-xl border border-border/70 bg-surface-raised/40 p-4 md:p-5">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                <Sparkles className="size-4 text-brand" /> {t("growth.timeline.title")}
              </h2>
              {milestones.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">{t("growth.timeline.empty")}</p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {milestones.slice(0, 12).map((m) => {
                    const p = byId.get(m.person_id);
                    return (
                      <li
                        key={m.id}
                        className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 p-3"
                      >
                        {m.kind === "promotion" ? (
                          <TrendingUp className="mt-0.5 size-4 shrink-0 text-ok" />
                        ) : m.kind === "certification" ? (
                          <GraduationCap className="mt-0.5 size-4 shrink-0 text-brand" />
                        ) : (
                          <Award className="mt-0.5 size-4 shrink-0 text-warn" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm">
                            {p ? (
                              <Link
                                to="/people/$personId"
                                params={{ personId: p.id }}
                                className="font-medium underline-offset-2 hover:underline"
                              >
                                {p.name}
                              </Link>
                            ) : (
                              <span className="font-medium">—</span>
                            )}{" "}
                            <span className="text-muted-foreground">· {m.title}</span>
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {t(`pp.ms.kind.${m.kind}`)} · {m.effective_on}
                            {m.from_level && m.to_level
                              ? ` · L${m.from_level} → L${m.to_level}`
                              : ""}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* recent reviews */}
            <section className="rounded-xl border border-border/70 bg-surface-raised/40 p-4 md:p-5">
              <h2 className="font-display text-lg font-semibold">{t("growth.reviews.title")}</h2>
              {records.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">{t("growth.reviews.empty")}</p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {records.slice(0, 12).map((r) => {
                    const p = byId.get(r.person_id);
                    return (
                      <li
                        key={r.id}
                        className="rounded-lg border border-border/60 bg-background/40 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium">
                            {p ? (
                              <Link
                                to="/people/$personId"
                                params={{ personId: p.id }}
                                className="underline-offset-2 hover:underline"
                              >
                                {p.name}
                              </Link>
                            ) : (
                              "—"
                            )}
                            <span className="ml-2 text-xs text-muted-foreground">{r.period}</span>
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] ${ratingChipClass(r.rating)}`}
                          >
                            {perfLabel(t, r.rating)}
                          </span>
                        </div>
                        {r.summary && (
                          <p className="mt-1 text-xs text-foreground/85">{r.summary}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          {/* review gaps */}
          <section className="rounded-xl border border-border/70 bg-surface-raised/40 p-4 md:p-5">
            <h2 className="font-display text-lg font-semibold">{t("growth.gap.title")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("growth.gap.hint")}</p>
            {stats.unreviewed.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{t("growth.gap.none")}</p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {stats.unreviewed.map((p) => (
                  <PersonChip key={p.id} person={p} rating={latestRating(p, records)} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
