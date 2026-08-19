import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { diagnoseTeam, type TeamDiagnosis } from "@/lib/ai.functions";
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
          <DialogTitle className="font-display text-xl">{nodeName} · 组织能力诊断</DialogTitle>
          <DialogDescription>
            结合战略方向、现有岗位、成员评估与近期组织建设活动，判断这个团队还缺什么岗位、什么能力，
            以及先招人还是先培养。
          </DialogDescription>
        </DialogHeader>

        {!r && (
          <Button onClick={() => m.mutate()} disabled={m.isPending || !nodeId} className="gap-2">
            {m.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {m.isPending ? "分析中…" : "开始 AI 诊断"}
          </Button>
        )}

        {r && (
          <div className="space-y-5 text-sm">
            <p className="rounded-lg border border-brand/40 bg-brand/10 px-4 py-3 font-display text-base leading-relaxed">
              {r.headline}
            </p>

            <Block title="已经站住的">
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {r.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </Block>

            <Block title="还缺的岗位">
              <ul className="space-y-2">
                {r.missing_roles.map((x, i) => (
                  <li key={i} className="rounded-lg border border-border/60 px-3 py-2">
                    <p className="font-medium">
                      {x.title}
                      <span className="ml-2 rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        紧迫度 {x.urgency}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{x.why}</p>
                  </li>
                ))}
              </ul>
            </Block>

            <Block title="还缺的能力与建议动作">
              <ul className="space-y-2">
                {r.missing_capabilities.map((x, i) => (
                  <li key={i} className="rounded-lg border border-border/60 px-3 py-2">
                    <p className="font-medium">{x.capability}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{x.action}</p>
                  </li>
                ))}
              </ul>
            </Block>

            <Block title="先招人还是先培养">
              <p className="leading-relaxed text-muted-foreground">{r.hire_vs_grow}</p>
            </Block>

            <Block title="未来 90 天">
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                {r.next_90_days.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </Block>

            <Button variant="outline" size="sm" onClick={() => m.mutate()} disabled={m.isPending}>
              重新分析
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
