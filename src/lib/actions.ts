import { supabase } from "@/integrations/supabase/client";

export type ActionSourceKind = "capability" | "vacancy" | "ai" | "data" | "manual";
export type ActionStatus = "todo" | "doing" | "done" | "cancelled";
export type ActionPriority = "high" | "normal" | "low";

export type ActionItem = {
  id: string;
  title: string;
  detail: string | null;
  source_kind: string;
  source_key: string | null;
  role_id: string | null;
  person_id: string | null;
  org_node_id: string | null;
  owner: string | null;
  due_on: string | null;
  priority: string;
  status: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export const sourceLabel: Record<string, string> = {
  capability: "能力缺口",
  vacancy: "岗位空缺",
  ai: "AI 诊断",
  data: "数据补全",
  manual: "手动创建",
};

export const statusLabel: Record<string, string> = {
  todo: "待办",
  doing: "进行中",
  done: "已完成",
  cancelled: "已取消",
};

export const priorityLabel: Record<string, string> = {
  high: "高",
  normal: "中",
  low: "低",
};

export async function fetchActions() {
  const { data, error } = await supabase
    .from("actions")
    .select("*")
    .order("status")
    .order("due_on", { nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ActionItem[];
}

export type NewAction = {
  title: string;
  detail?: string | null;
  source_kind: ActionSourceKind;
  source_key?: string | null;
  role_id?: string | null;
  person_id?: string | null;
  org_node_id?: string | null;
  owner?: string | null;
  due_on?: string | null;
  priority?: ActionPriority;
};

export async function createAction(input: NewAction) {
  const { error } = await supabase.from("actions").insert({
    ...input,
    detail: input.detail ?? null,
    owner: input.owner?.trim() ? input.owner.trim() : null,
    due_on: input.due_on || null,
    priority: input.priority ?? "normal",
  });
  if (error) throw error;
}

export async function setActionStatus(id: string, status: ActionStatus) {
  const { error } = await supabase
    .from("actions")
    .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteAction(id: string) {
  const { error } = await supabase.from("actions").delete().eq("id", id);
  if (error) throw error;
}

export function isOverdue(a: ActionItem) {
  if (!a.due_on || a.status === "done" || a.status === "cancelled") return false;
  return a.due_on < new Date().toISOString().slice(0, 10);
}

export function actionSummary(list: ActionItem[]) {
  const open = list.filter((a) => a.status === "todo" || a.status === "doing");
  return {
    open: open.length,
    overdue: open.filter(isOverdue).length,
    done: list.filter((a) => a.status === "done").length,
    high: open.filter((a) => a.priority === "high").length,
  };
}

/** 默认截止日：从今天起 N 天 */
export function inDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
