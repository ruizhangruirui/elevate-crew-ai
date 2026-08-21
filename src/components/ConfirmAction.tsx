import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * 破坏性操作统一二次确认。
 * 用法：<ConfirmAction title="…" description="…" onConfirm={fn}><Button/></ConfirmAction>
 */
export function ConfirmAction({
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  children,
}: {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const resolvedConfirmLabel = confirmLabel ?? t("sheet.confirm.defaultConfirmLabel");
  const resolvedCancelLabel = cancelLabel ?? t("sheet.confirm.defaultCancelLabel");
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild onClick={(e) => e.stopPropagation()}>
        {children}
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display">{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{resolvedCancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-danger text-destructive-foreground hover:bg-danger/90"
            onClick={(e) => {
              e.stopPropagation();
              onConfirm();
            }}
          >
            {resolvedConfirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
