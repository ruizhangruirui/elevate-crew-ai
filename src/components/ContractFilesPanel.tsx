import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Eye, FileText, Trash2, Upload } from "lucide-react";
import { db } from "@/lib/db-client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ConfirmAction";
import { formatDate } from "@/lib/dates";

const MAX_BYTES = 10 * 1024 * 1024;

type ContractFile = { id: string; file_name: string; mime_type: string | null; size_bytes: number; uploaded_by: string | null; created_at: string };

function mimeOf(f: ContractFile) {
  if (f.mime_type) return f.mime_type;
  const ext = f.file_name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** HR-only contract documents for one person (stored in the app database). */
export function ContractFilesPanel({ personId }: { personId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const key = ["person-contracts", personId];
  const files = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await (db as any)
        .from("person_contracts")
        .select("id,file_name,mime_type,size_bytes,uploaded_by,created_at")
        .eq("person_id", personId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContractFile[];
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX_BYTES) throw new Error(t("cm.file.tooLarge"));
      const file_data = await toBase64(file);
      const { error } = await (db as any).from("person_contracts").insert({
        person_id: personId, file_name: file.name, mime_type: file.type || null, size_bytes: file.size, file_data,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("cm.file.uploaded")); qc.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (db as any).from("person_contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("cm.file.deleted")); qc.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [preview, setPreview] = useState<{ file: ContractFile; url: string } | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  async function fileUrl(f: ContractFile): Promise<string | null> {
    const { data, error } = await (db as any).from("person_contracts").select("file_data").eq("id", f.id).single();
    if (error || !data) { toast.error(error?.message ?? "Error"); return null; }
    const bin = atob(data.file_data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: mimeOf(f) }));
  }

  async function openPreview(f: ContractFile) {
    const url = await fileUrl(f);
    if (url) setPreview({ file: f, url });
  }

  async function download(f: ContractFile) {
    const url = await fileUrl(f);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url; a.download = f.file_name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="mt-4 border-t border-border/40 pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{t("cm.file.title")} <span className="text-xs text-muted-foreground">· {t("pp.f.hrOnly")}</span></p>
        <input
          ref={input}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ""; }}
        />
        <Button size="sm" variant="outline" className="gap-1.5" disabled={upload.isPending} onClick={() => input.current?.click()}>
          <Upload className="size-3.5" /> {upload.isPending ? t("cm.file.uploading") : t("cm.file.upload")}
        </Button>
      </div>
      {(files.data ?? []).length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{t("cm.file.none")}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border/40">
          {(files.data ?? []).map((f) => (
            <li key={f.id} className="flex items-center gap-2 py-1.5 text-sm">
              <FileText className="size-4 shrink-0 text-brand" />
              <span className="min-w-0 flex-1 truncate">{f.file_name}</span>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {(f.size_bytes / 1024 / 1024).toFixed(1)} MB · {formatDate(f.created_at)}{f.uploaded_by ? ` · ${f.uploaded_by}` : ""}
              </span>
              <Button size="icon" variant="ghost" className="size-7" aria-label={t("cm.file.preview")} onClick={() => openPreview(f)}>
                <Eye className="size-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="size-7" aria-label={t("cm.file.download")} onClick={() => download(f)}>
                <Download className="size-3.5" />
              </Button>
              <ConfirmAction title={t("cm.file.deleteTitle")} description={f.file_name} onConfirm={() => remove.mutate(f.id)}>
                <Button size="icon" variant="ghost" className="size-7 hover:text-danger" aria-label={t("cm.file.delete")}>
                  <Trash2 className="size-3.5" />
                </Button>
              </ConfirmAction>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{preview?.file.file_name}</DialogTitle>
          </DialogHeader>
          {preview && (() => {
            const mime = mimeOf(preview.file);
            if (mime === "application/pdf")
              return <iframe src={preview.url} title={preview.file.file_name} className="h-[75vh] w-full rounded border border-border/40" />;
            if (mime.startsWith("image/"))
              return <img src={preview.url} alt={preview.file.file_name} className="mx-auto max-h-[75vh] object-contain" />;
            return (
              <div className="space-y-3 py-6 text-center text-sm text-muted-foreground">
                <p>{t("cm.file.noPreview")}</p>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => download(preview.file)}>
                  <Download className="size-3.5" /> {t("cm.file.download")}
                </Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
