import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { archivePerson, EXIT_REASONS } from "@/lib/lifecycle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ArchivePersonDialog({
  personId,
  personName,
  children,
  onDone,
}: {
  personId: string;
  personName: string;
  children: ReactNode;
  onDone?: () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("voluntary");
  const [detail, setDetail] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const run = useMutation({
    mutationFn: () => archivePerson(personId, { reason, detail, effective_on: date }),
    onSuccess: () => {
      toast.success(t("lc.archive.done"));
      setOpen(false);
      setDetail("");
      qc.invalidateQueries({ refetchType: "all" });
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{t("lc.archive.title").replace("{name}", personName)}</DialogTitle>
        </DialogHeader>
        <p className="text-xs leading-relaxed text-muted-foreground">{t("lc.archive.desc")}</p>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("lc.archive.reason")}</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXIT_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t(`lc.reason.${r}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("lc.archive.date")}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("lc.archive.detail")}</Label>
            <Textarea
              rows={3}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder={t("lc.archive.detailPlaceholder")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="destructive" onClick={() => run.mutate()} disabled={run.isPending}>
            {t("lc.archive.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
