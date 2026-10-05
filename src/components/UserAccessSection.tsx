import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { createUser, deleteUser, listUsers, resetUserPassword, updateUser } from "@/lib/auth.functions";
import { useAuth } from "@/hooks/useAuth";
import { ConfirmAction } from "@/components/ConfirmAction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Node = { id: string; name: string; type: string; archived: boolean };
type Role = "owner" | "hr" | "manager" | "recruiter";
type U = {
  id: string;
  email: string;
  name: string;
  role: Role;
  scope_node_ids: string[];
  status: string;
  must_change_password: boolean;
  last_login_at: string | null;
};

export function UserAccessSection({ nodes }: { nodes: Node[] }) {
  const { t } = useI18n();
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listUsers);
  const del = useServerFn(deleteUser);
  const users = useQuery({ queryKey: ["app-users"], queryFn: () => list() });
  const [editing, setEditing] = useState<U | "new" | null>(null);
  const [resetting, setResetting] = useState<U | null>(null);
  const nodeName = new Map(nodes.map((n) => [n.id, n.name]));
  const roleLabel = (r: string) => t(`access.role.${r}`);

  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-users"] });
      toast.success(t("access.deleted"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">{t("set.access.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("access.desc")}</p>
        </div>
        <Button className="gap-2" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> {t("access.add")}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("access.name")}</TableHead>
            <TableHead>{t("access.email")}</TableHead>
            <TableHead>{t("access.role")}</TableHead>
            <TableHead>{t("access.scope")}</TableHead>
            <TableHead>{t("access.status")}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {((users.data ?? []) as U[]).map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">
                {u.name}
                {u.id === me?.id && <span className="ml-1 text-xs text-muted-foreground">({t("access.you")})</span>}
              </TableCell>
              <TableCell className="text-muted-foreground">{u.email}</TableCell>
              <TableCell>{roleLabel(u.role)}</TableCell>
              <TableCell className="text-muted-foreground">
                {u.role === "manager"
                  ? u.scope_node_ids.map((id) => nodeName.get(id) ?? id).join(", ") || "-"
                  : u.role === "recruiter" ? t("access.role.recruiter") : t("access.allData")}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  <Badge variant={u.status === "active" ? "default" : "secondary"}>
                    {t(`access.status.${u.status}`)}
                  </Badge>
                  {u.must_change_password && <Badge variant="outline">{t("access.initialPw")}</Badge>}
                </div>
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <Button size="icon" variant="ghost" aria-label={t("access.edit")} onClick={() => setEditing(u)}>
                  <Pencil className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" aria-label={t("access.resetPw")} onClick={() => setResetting(u)}>
                  <KeyRound className="size-4" />
                </Button>
                {u.id !== me?.id && (
                  <ConfirmAction
                    title={t("access.confirmDelete").replace("{name}", u.name)}
                    description={<p>{t("access.confirmDeleteDesc")}</p>}
                    confirmLabel={t("access.delete")}
                    onConfirm={() => remove.mutate(u.id)}
                  >
                    <Button size="icon" variant="ghost" aria-label={t("access.delete")}>
                      <Trash2 className="size-4" />
                    </Button>
                  </ConfirmAction>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {(["owner", "hr", "manager", "recruiter"] as const).map((r) => (
          <div key={r} className="rounded-lg border border-border/60 p-4">
            <p className="text-sm font-medium">{roleLabel(r)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t(`access.roleDesc.${r}`)}</p>
          </div>
        ))}
      </div>

      {editing && (
        <UserDialog
          user={editing === "new" ? null : editing}
          nodes={nodes.filter((n) => !n.archived)}
          selfId={me?.id}
          onClose={() => setEditing(null)}
        />
      )}
      {resetting && <ResetDialog user={resetting} onClose={() => setResetting(null)} />}
    </>
  );
}

function UserDialog({
  user,
  nodes,
  selfId,
  onClose,
}: {
  user: U | null;
  nodes: Node[];
  selfId?: string | undefined;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const create = useServerFn(createUser);
  const update = useServerFn(updateUser);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "manager");
  const [scope, setScope] = useState<string[]>(user?.scope_node_ids ?? []);
  const [status, setStatus] = useState(user?.status ?? "active");
  const [password, setPassword] = useState("");
  const isSelf = user?.id === selfId;

  const save = useMutation({
    mutationFn: async () => {
      if (user) {
        await update({ data: { id: user.id, name, role, scope_node_ids: scope, status: status as "active" | "disabled" } });
      } else {
        await create({ data: { name, email, role, scope_node_ids: scope, password } });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-users"] });
      toast.success(t("access.saved"));
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user ? t("access.edit") : t("access.add")}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-2">
            <Label>{t("access.name")}</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("access.email")}</Label>
            <Input required type="email" disabled={!!user} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("access.role")}</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)} disabled={isSelf}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["owner", "hr", "manager", "recruiter"] as const).map((r) => (
                    <SelectItem key={r} value={r}>{t(`access.role.${r}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {user && (
              <div className="space-y-2">
                <Label>{t("access.status")}</Label>
                <Select value={status} onValueChange={setStatus} disabled={isSelf}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t("access.status.active")}</SelectItem>
                    <SelectItem value="disabled">{t("access.status.disabled")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {role === "manager" && (
            <div className="space-y-2">
              <Label>{t("access.scope")}</Label>
              <p className="text-xs text-muted-foreground">{t("access.scopeHint")}</p>
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {nodes.map((n) => {
                  const on = scope.includes(n.id);
                  return (
                    <button
                      type="button"
                      key={n.id}
                      onClick={() => setScope(on ? scope.filter((x) => x !== n.id) : [...scope, n.id])}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {n.name} <span className="opacity-60">· {n.type}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {!user && (
            <div className="space-y-2">
              <Label>{t("access.initialPassword")}</Label>
              <Input required minLength={8} type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t("access.initialPasswordHint")}</p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>{t("access.cancel")}</Button>
            <Button type="submit" disabled={save.isPending}>{t("set.org.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetDialog({ user, onClose }: { user: U; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const reset = useServerFn(resetUserPassword);
  const [password, setPassword] = useState("");
  const save = useMutation({
    mutationFn: () => reset({ data: { id: user.id, password } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-users"] });
      toast.success(t("access.pwReset"));
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("access.resetPw")} · {user.name}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-2">
            <Label>{t("access.tempPassword")}</Label>
            <Input required minLength={8} type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("access.tempPasswordHint")}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>{t("access.cancel")}</Button>
            <Button type="submit" disabled={save.isPending}>{t("access.resetPw")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
