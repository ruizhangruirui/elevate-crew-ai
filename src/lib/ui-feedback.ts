import { toast } from "sonner";

/**
 * 全站统一反馈规则：
 * - 保存成功 → 绿色提示，说明「改了什么」
 * - 可逆操作（归档 / 移除）→ 提示里带「撤销」
 */
export function toastSaved(message: string, description?: string) {
  toast.success(message, description ? { description } : undefined);
}

export function toastUndoable(
  message: string,
  undoLabel: string,
  onUndo: () => void,
  description?: string,
) {
  toast.success(message, {
    description,
    duration: 8000,
    action: { label: undoLabel, onClick: onUndo },
  });
}

export function toastError(e: unknown) {
  toast.error(e instanceof Error ? e.message : String(e));
}
