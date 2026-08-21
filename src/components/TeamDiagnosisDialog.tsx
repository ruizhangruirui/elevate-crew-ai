import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { diagnoseTeam, type TeamDiagnosis } from "@/lib/ai.functions";
import { AddActionButton } from "@/components/AddActionButton";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function TeamDiagnosisDialog({
  nodeId,
  nodeName,
  open,
  onOpenChange,
}: {
  nodeId: string | null;
  nodeName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const run = useServerFn(diagnoseTeam);
  const m = useMutation({
    mutationFn: async () => (await run({ data: { nodeId: nodeId! } })) as TeamDiagnosis,
    onError: (e: Error) => toast.error(e.message),
  });

  const r = m.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{t("sheet.team.diagnosisTitle").replace("{name}", nodeName)}</DialogTitle>
          <DialogDescription>
            {t("sheet.team.diagnosisDesc")}
          </DialogDescription>
        </DialogHeader>

        {!r && (
          <Button onClick={() => m.mutate()} disabled={m.isPending || !nodeId} className="gap-2">
            {m.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {m.isPending ? t("sheet.role.analyzing") : t("sheet.team.startDiagnosis")}
          </Button>
        )}

        {r && (
          <div className="space-y-5 text-sm">
            <p className="rounded-lg border border-brand/40 bg-brand/10 px-4 py-3 font-display text-base leading-relaxed">
              {r.headline}
            </p>

            <Block title={t("sheet.team.strengthsTitle")}>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {r.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </Block>

            <Block title={t("sheet.team.missingRolesTitle")}>
              <ul className="space-y-2">
                {r.missing_roles.map((x, i) => (
                  <li key={i} className="rounded-lg border border-border/60 px-3 py-2">
                    <p className="font-medium">
                      {x.title}
                      <span className="ml-2 rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {t("sheet.team.urgency").replace("{n}", String(x.urgency))}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{x.why}</p>
                    <div className="mt-2">
                      <AddActionButton
                        sourceKind="ai"
                        sourceKey={`ai:${nodeId}:role:${x.title}`}
                        orgNodeId={nodeId}
                        defaultTitle={t("sheet.team.setupAndHire").replace("{name}", nodeName).replace("{title}", x.title)}
                        defaultDetail={x.why}
                        defaultPriority="high"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Block>

            <Block title={t("sheet.team.missingCapabilitiesTitle")}>
              <ul className="space-y-2">
                {r.missing_capabilities.map((x, i) => (
                  <li key={i} className="rounded-lg border border-border/60 px-3 py-2">
                    <p className="font-medium">{x.capability}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{x.action}</p>
                    <div className="mt-2">
                      <AddActionButton
                        sourceKind="ai"
                        sourceKey={`ai:${nodeId}:cap:${x.capability}`}
                        orgNodeId={nodeId}
                        defaultTitle={t("sheet.team.capabilityActionTitle").replace("{name}", nodeName).replace("{capability}", x.capability).replace("{action}", x.action)}
                        defaultDetail={t("sheet.team.fromAiDiagnosis").replace("{name}", nodeName)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Block>

            <Block title={t("sheet.team.hireVsGrowTitle")}>
              <p className="leading-relaxed text-muted-foreground">{r.hire_vs_grow}</p>
            </Block>

            <Block title={t("sheet.team.next90DaysTitle")}>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                {r.next_90_days.map((s, i) => (
                  <li key={i} className="space-y-1">
                    <span>{s}</span>
                    <div>
                      <AddActionButton
                        sourceKind="ai"
                        sourceKey={`ai:${nodeId}:90d:${i}`}
                        orgNodeId={nodeId}
                        defaultTitle={s}
                        defaultDetail={t("sheet.team.next90DaysDetail").replace("{name}", nodeName)}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            </Block>

            <Button variant="outline" size="sm" onClick={() => m.mutate()} disabled={m.isPending}>
              {t("sheet.team.reanalyze")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}
