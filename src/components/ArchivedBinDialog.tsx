import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { toastError, toastSaved } from "@/lib/ui-feedback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ArchivedRow = { id: string; title: string; description: string | null };

async function fetchArchived() {
  const [dirs, roles] = await Promise.all([
    supabase.from("directions").select("id,title,description").eq("archived", true).order("title"),
    supabase.from("roles").select("id,title,description").eq("archived", true).order("title"),
  ]);
  if (dirs.error) throw dirs.error;
  if (roles.error) throw roles.error;
  return {
    directions: (dirs.data ?? []) as ArchivedRow[],
    roles: (roles.data ?? []) as ArchivedRow[],
  };
}

export function ArchivedBinDialog() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const archived = useQuery({ queryKey: ["archived-bin"], queryFn: fetchArchived, enabled: open });

  const restore = useMutation({
    mutationFn: async ({ table, id }: { table: "directions" | "roles"; id: string }) => {
      const { error } = await supabase.from(table).update({ archived: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toastSaved(t("ui.restored"));
      qc.invalidateQueries({ refetchType: "all" });
    },
    onError: toastError,
  });

  const list = archived.data;
  const empty = list && list.directions.length === 0 && list.roles.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <Archive className="size-4" /> {t("ui.archiveBin")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("ui.archiveBin")}</DialogTitle>
        </DialogHeader>
        <p className="text-xs leading-relaxed text-muted-foreground">{t("ui.archiveBinHint")}</p>

        {!list && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        {empty && <p className="text-sm text-muted-foreground">{t("ui.archiveBinEmpty")}</p>}

        {list && list.directions.length > 0 && (
          <Section title={t("ui.archivedDirections")}>
            {list.directions.map((d) => (
              <Row
                key={d.id}
                row={d}
                label={t("ui.restore")}
                pending={restore.isPending}
                onRestore={() => restore.mutate({ table: "directions", id: d.id })}
              />
            ))}
          </Section>
        )}

        {list && list.roles.length > 0 && (
          <Section title={t("ui.archivedRoles")}>
            {list.roles.map((r) => (
              <Row
                key={r.id}
                row={r}
                label={t("ui.restore")}
                pending={restore.isPending}
                onRestore={() => restore.mutate({ table: "roles", id: r.id })}
              />
            ))}
          </Section>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({
  row,
  label,
  pending,
  onRestore,
}: {
  row: ArchivedRow;
  label: string;
  pending: boolean;
  onRestore: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-surface-raised/40 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{row.title}</p>
        {row.description && (
          <p className="truncate text-xs text-muted-foreground">{row.description}</p>
        )}
      </div>
      <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" disabled={pending} onClick={onRestore}>
        <RotateCcw className="size-3" /> {label}
      </Button>
    </div>
  );
}
