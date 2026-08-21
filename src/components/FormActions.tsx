import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

/**
 * 全站统一的表单底部操作区：
 * 左侧一句「怎么保存 / 能不能撤回」的说明，右侧固定「取消 + 保存」。
 */
export function FormActions({
  onCancel,
  onSave,
  pending,
  disabled,
  saveLabel,
  hint,
}: {
  onCancel: () => void;
  onSave: () => void;
  pending?: boolean;
  disabled?: boolean;
  saveLabel?: string;
  hint?: string;
}) {
  const { t } = useI18n();
  return (
    <DialogFooter className="items-center gap-3 sm:justify-between">
      <p className="text-left text-[11px] leading-relaxed text-muted-foreground">
        {hint ?? t("ui.saveHint")}
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          {t("ui.cancel")}
        </Button>
        <Button onClick={onSave} disabled={pending || disabled}>
          {pending ? t("ui.saving") : (saveLabel ?? t("ui.save"))}
        </Button>
      </div>
    </DialogFooter>
  );
}
