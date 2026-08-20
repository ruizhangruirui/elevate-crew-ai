import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ListPlus } from "lucide-react";
import { createAction, fetchActions, inDays, type ActionPriority, type ActionSourceKind } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * 把任意一条分析结论变成可跟进的待办。
 * sourceKey 用于识别「这条结论已经建过待办了」，避免重复。
 */
export function AddActionButton({
  sourceKind,
  sourceKey,
  defaultTitle,
  defaultDetail,
  defaultPriority = "normal",
  roleId,
  personId,
  orgNodeId,
  label = "转为待办",
  size = "sm",
}: {
  sourceKind: ActionSourceKind;
  sourceKey: string;
  defaultTitle: string;
  defaultDetail?: string;
  defaultPriority?: ActionPriority;
  roleId?: string | null;
  personId?: string | null;
  orgNodeId?: string | null;
  label?: string;
  size?: "sm" | "xs";
}) {
  const qc = useQueryClient();
  const { data: actions } = useQuery({ queryKey: ["actions"], queryFn: fetchActions });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: defaultTitle,
    detail: defaultDetail ?? "",
    owner: "",
    due_on: inDays(30),
    priority: defaultPriority as ActionPriority,
  });

  const existing = (actions ?? []).find(
    (a) => a.source_key === sourceKey && a.status !== "cancelled",
  );

  const create = useMutation({
    mutationFn: () =>
      createAction({
        title: form.title,
        detail: form.detail,
        source_kind: sourceKind,
        source_key: sourceKey,
        role_id: roleId ?? null,
        person_id: personId ?? null,
        org_node_id: orgNodeId ?? null,
        owner: form.owner,
        due_on: form.due_on,
        priority: form.priority,
      }),
    onSuccess: () => {
      toast.success("已加入待办");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["actions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (existing) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-ok">
        <CheckCircle2 className="size-3.5" />
        {existing.status === "done" ? "已完成" : "已在待办"}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 rounded border border-border/70 px-2 py-0.5 text-muted-foreground transition-colors hover:border-brand/60 hover:text-foreground ${
          size === "xs" ? "text-[10px]" : "text-[11px]"
        }`}
      >
        <ListPlus className="size-3.5" />
        {label}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>转为待办</DialogTitle>
            <DialogDescription>
              指定负责人和时间，这条结论就会出现在待办中心，直到被处理掉。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>事项</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>背景说明</Label>
              <Textarea
                rows={3}
                value={form.detail}
                onChange={(e) => setForm({ ...form, detail: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>负责人</Label>
                <Input
                  placeholder="选填"
                  value={form.owner}
                  onChange={(e) => setForm({ ...form, owner: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>截止日期</Label>
                <Input
                  type="date"
                  value={form.due_on}
                  onChange={(e) => setForm({ ...form, due_on: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>优先级</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm({ ...form, priority: v as ActionPriority })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">高</SelectItem>
                    <SelectItem value="normal">中</SelectItem>
                    <SelectItem value="low">低</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => create.mutate()}
              disabled={!form.title.trim() || create.isPending}
            >
              加入待办
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
