import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Archive,
  Users,
  ArrowUpRight,
  Building2,
  Pencil,
  MoreHorizontal,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useI18n } from "@/lib/i18n";
import { ConfirmAction } from "@/components/ConfirmAction";
import { RoleDetailSheet } from "@/components/RoleDetailSheet";
import {
  coverageOf,
  criticalityLabel,
  fetchWorkspace,
  type Direction,
  type Org,
  type Role,
} from "@/lib/talent";
import { supabase } from "@/integrations/supabase/client";
import { fetchOrgNodes, type OrgNode } from "@/lib/org-tree";
import { ArchivedBinDialog } from "@/components/ArchivedBinDialog";
import { FormActions } from "@/components/FormActions";
import { toastError, toastSaved, toastUndoable } from "@/lib/ui-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "战略岗位视图 · 战略岗位与人才管理系统" },
      {
        name: "description",
        content: "从未来战略出发，定义关键研究方向与目标岗位架构，识别人才覆盖、Gap 与风险。",
      },
      { property: "og:title", content: "战略岗位视图 · 战略岗位与人才管理系统" },
      {
        property: "og:description",
        content: "从未来战略出发，定义关键研究方向与目标岗位架构，识别人才覆盖、Gap 与风险。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { t } = useI18n();
  return (
    <AppShell
      title={t("nav.index")}
      subtitle={t("idx.subtitle")}
    >
      <StrategyBoard />
    </AppShell>
  );
}

function StrategyBoard() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const orgNodes = useQuery({ queryKey: ["org-nodes"], queryFn: fetchOrgNodes });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openRoleId, setOpenRoleId] = useState<string | null>(null);

  useEffect(() => {
    if (data && !activeId && data.directions[0]) setActiveId(data.directions[0].id);
  }, [data, activeId]);

  const invalidate = () => qc.invalidateQueries({ refetchType: "all" });

  const archiveRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("roles").update({ archived: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      toastUndoable(
        t("idx.roleArchived"),
        t("ui.undo"),
        async () => {
          await supabase.from("roles").update({ archived: false }).eq("id", id);
          invalidate();
        },
        t("ui.undoHint"),
      );
      invalidate();
    },
    onError: toastError,
  });

  if (!data) return <div className="text-sm text-muted-foreground">{t("common.loading")}</div>;

  const { org, directions, roles, people } = data;
  const active = directions.find((d) => d.id === activeId) ?? directions[0] ?? null;
  const activeRoles = active ? roles.filter((r) => r.direction_id === active.id) : [];

  const totalSeats = roles.reduce((n, r) => n + r.target_count, 0);
  const activeRoleIds = new Set(roles.map((role) => role.id));
  const totalFilled = people.filter(
    (person) =>
      person.status === "onboard" &&
      person.role_id !== null &&
      activeRoleIds.has(person.role_id),
  ).length;
  const totalGap = Math.max(0, totalSeats - totalFilled);

  const dirStats = (dirId: string) => {
    const rs = roles.filter((r) => r.direction_id === dirId);
    const roleIds = new Set(rs.map((role) => role.id));
    const seats = rs.reduce((n, role) => n + role.target_count, 0);
    const filled = people.filter(
      (person) =>
        person.status === "onboard" &&
        person.role_id !== null &&
        roleIds.has(person.role_id),
    ).length;
    const gap = Math.max(0, seats - filled);
    return { count: rs.length, gap };
  };

  return (
    <div className="space-y-10">
      {/* Org overview */}
      <section className="panel relative overflow-hidden p-8">
        <div
          className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full opacity-25 blur-3xl"
          style={{ backgroundImage: "var(--gradient-brand)" }}
        />
        <div className="relative grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                {org?.tagline ?? t("idx.orgTaglineDefault")}
              </p>
              {org && <EditOrgDialog org={org} onDone={invalidate} />}
            </div>
            <h2 className="mt-2 font-display text-4xl font-bold">
              <span className="brand-gradient-text">{org?.name}</span>
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {org?.description}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {org?.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-brand/40 bg-brand/10 px-3 py-1 text-xs font-medium text-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="self-start">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">

              <Link to="/org" className="text-brand hover:underline">
                {t("idx.linkOrg")}
              </Link>
              <Link to="/capability" search={{ scope: undefined }} className="text-brand hover:underline">
                {t("idx.linkCapability")}
              </Link>
              <Link to="/people" className="text-brand hover:underline">
                {t("idx.linkPeople")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Directions */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">{t("idx.directionsHeading")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("idx.directionsHint")}</p>
          </div>
          <div className="flex items-center gap-1">
            <ArchivedBinDialog />
            {org && <NewDirectionDialog orgId={org.id} onDone={invalidate} />}
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {directions.map((d) => {
            const s = dirStats(d.id);
            const selected = d.id === active?.id;
            return (
              <div
                key={d.id}
                className={`panel group relative h-full transition-all duration-200 hover:-translate-y-0.5 ${
                  selected ? "border-brand/70 shadow-[var(--glow-brand)]" : "hover:border-brand/40"
                }`}
              >
                <button
                  onClick={() => setActiveId(d.id)}
                  className="block h-full w-full p-5 text-left"
                >
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="rounded-md bg-surface-raised px-2 py-1 text-muted-foreground">
                      {t("idx.roleTypesCount").replace("{count}", String(s.count))}
                    </span>
                    <span
                      className={`rounded-md px-2 py-1 font-medium ${
                        s.gap ? "bg-danger/12 text-danger" : "bg-ok/12 text-ok"
                      }`}
                    >
                      {s.gap ? t("idx.criticalGapCount").replace("{count}", String(s.gap)) : t("idx.fullCoverage")}
                    </span>
                  </div>
                  <h3 className="mt-3 pr-7 font-display text-base font-semibold">{d.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {d.description}
                  </p>
                </button>
                <DirectionMenu direction={d} roleCount={s.count} onDone={invalidate} />
              </div>
            );
          })}
        </div>
      </section>

      {/* Roles */}
      {active && (
        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold">{t("idx.rolesHeading")}</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {active.title} · {active.description}
              </p>
            </div>
            <NewRoleDialog directionId={active.id} onDone={invalidate} />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {activeRoles.map((role) => (
              <RoleCard
                key={role.id}
                role={role}
                orgNodes={orgNodes.data ?? []}
                filled={coverageOf(role, people).filled}
                gap={coverageOf(role, people).gap}
                members={people.filter((p) => p.role_id === role.id).map((p) => p.name)}
                teams={Array.from(
                  new Set(
                    [
                      (orgNodes.data ?? []).find((n) => n.id === role.org_node_id)?.name ?? "",
                      ...people
                        .filter((p) => p.role_id === role.id && p.org_node_id)
                        .map(
                          (p) =>
                            (orgNodes.data ?? []).find((n) => n.id === p.org_node_id)?.name ?? "",
                        ),
                    ].filter(Boolean),
                  ),
                )}
                onArchive={() => archiveRole.mutate(role.id)}
                onOpen={() => setOpenRoleId(role.id)}
                onSaved={invalidate}
              />
            ))}

            {activeRoles.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("idx.noRolesInDirection")}</p>
            )}
          </div>
        </section>
      )}

      <RoleDetailSheet
        role={roles.find((r) => r.id === openRoleId) ?? null}
        people={people}
        directionTitle={
          directions.find((d) => d.id === roles.find((r) => r.id === openRoleId)?.direction_id)?.title ?? ""
        }
        open={!!openRoleId}
        onOpenChange={(v) => !v && setOpenRoleId(null)}
        onDone={invalidate}
      />
    </div>
  );
}

function EditOrgDialog({ org, onDone }: { org: Org; onDone: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(org.name);
  const [tagline, setTagline] = useState(org.tagline ?? "");
  const [description, setDescription] = useState(org.description ?? "");
  const [tags, setTags] = useState((org.tags ?? []).join("、"));

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("orgs")
        .update({
          name: name.trim(),
          tagline: tagline.trim() || null,
          description: description.trim() || null,
          tags: tags
            .split(/[、,，\n]/)
            .map((t) => t.trim())
            .filter(Boolean),
        })
        .eq("id", org.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toastSaved(t("idx.orgUpdated"));
      setOpen(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setName(org.name);
          setTagline(org.tagline ?? "");
          setDescription(org.description ?? "");
          setTags((org.tags ?? []).join("、"));
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Pencil className="size-3" /> {t("idx.edit")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("idx.editOrgTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("idx.orgName")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("idx.tagline")}</Label>
            <Input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder={t("idx.taglinePlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("idx.orgMission")}</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("idx.tagsLabel")}</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
        </div>
        <FormActions
          onCancel={() => setOpen(false)}
          onSave={() => save.mutate()}
          pending={save.isPending}
          disabled={!name.trim()}
        />
      </DialogContent>
    </Dialog>
  );
}

function RoleCard({
  role,
  orgNodes,
  filled,
  gap,
  members,
  teams,
  onArchive,
  onOpen,
  onSaved,
}: {
  role: Role;
  orgNodes: OrgNode[];
  filled: number;
  gap: number;
  members: string[];
  teams: string[];
  onArchive: () => void;
  onOpen: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const pct = Math.min(100, Math.round((filled / Math.max(1, role.target_count)) * 100));
  const state = gap === 0 ? "full" : filled === 0 ? "empty" : "partial";
  const stateStyle =
    state === "full"
      ? "bg-ok/12 text-ok"
      : state === "partial"
        ? "bg-warn/12 text-warn"
        : "bg-danger/12 text-danger";
  const stateLabel = state === "full" ? "Fully Covered" : state === "partial" ? "Partially Covered" : "Not Covered";

  return (
    <article className="panel group relative flex h-full flex-col p-3.5">
      <RoleMenu role={role} orgNodes={orgNodes} onArchive={onArchive} onSaved={onSaved} />
      <div className="flex items-start justify-between gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${stateStyle}`}>
          {stateLabel}
        </span>
        <span className="pr-6 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          {criticalityLabel[role.criticality] ?? role.criticality}
        </span>
      </div>

      <h3 className="mt-2.5 font-display text-sm font-semibold leading-snug">{role.title}</h3>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        {role.description}
      </p>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground tabular-nums">
        <span>
          {t("idx.targetLevel")} L{role.level_min}–{role.level_max}
        </span>
        <span>
          {t("idx.currentCoverage")} {filled}/{role.target_count}
        </span>
        <span className={gap > 0 ? "text-danger" : "text-ok"}>Gap {gap}</span>
      </div>

      <div className="mt-2">
        <Progress value={pct} className="h-1" />
      </div>

      {teams.length > 0 && (
        <p className="mt-2 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
          <Building2 className="size-3 shrink-0" />
          <span className="truncate">
            {t("idx.teamsLabel")}
            {teams.join("、")}
          </span>
        </p>
      )}

      {members.length > 0 && (
        <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
          <Users className="size-3 shrink-0" />
          <span className="truncate">{members.join("、")}</span>
        </p>
      )}

      <div className="mt-auto pt-3">
        <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={onOpen}>
          {t("idx.viewRoleProfile")} <ArrowUpRight className="size-3" />
        </Button>
      </div>
    </article>
  );
}


function RoleMenu({
  role,
  orgNodes,
  onArchive,
  onSaved,
}: {
  role: Role;
  orgNodes: OrgNode[];
  onArchive: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(role.title);
  const [description, setDescription] = useState(role.description ?? "");
  const [levelMin, setLevelMin] = useState(String(role.level_min));
  const [levelMax, setLevelMax] = useState(String(role.level_max));
  const [targetCount, setTargetCount] = useState(String(role.target_count));
  const [criticality, setCriticality] = useState(role.criticality);
  const [nodeId, setNodeId] = useState(role.org_node_id ?? "__none");

  const reset = () => {
    setTitle(role.title);
    setDescription(role.description ?? "");
    setLevelMin(String(role.level_min));
    setLevelMax(String(role.level_max));
    setTargetCount(String(role.target_count));
    setCriticality(role.criticality);
    setNodeId(role.org_node_id ?? "__none");
  };

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("roles")
        .update({
          title: title.trim(),
          description: description.trim() || null,
          level_min: Number(levelMin) || role.level_min,
          level_max: Number(levelMax) || role.level_max,
          target_count: Math.max(1, Number(targetCount) || 1),
          criticality,
          org_node_id: nodeId === "__none" ? null : nodeId,
        })
        .eq("id", role.id);
      if (error) throw error;
    },

    onSuccess: () => {
      toastSaved(t("idx.roleUpdated"));
      setEditing(false);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 size-7 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="size-4" />
            <span className="sr-only">{t("idx.roleActionsSr")}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onSelect={() => {
              reset();
              setEditing(true);
            }}
          >
            <Pencil className="size-3.5" /> {t("idx.editRole")}
          </DropdownMenuItem>
          <ConfirmAction
            title={t("idx.confirmArchiveRoleTitle").replace("{title}", role.title)}
            description={
              <>
                <p>{t("idx.archiveRoleDesc1")}</p>
                <p>{t("idx.archiveRoleDesc2")}</p>
              </>
            }
            confirmLabel={t("idx.confirmArchive")}
            onConfirm={onArchive}
          >
            <DropdownMenuItem className="text-danger" onSelect={(e) => e.preventDefault()}>
              <Archive className="size-3.5" /> {t("idx.archiveRole")}
            </DropdownMenuItem>
          </ConfirmAction>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("idx.editRoleTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("idx.roleName")}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("idx.roleDescription")}</Label>
              <Textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>{t("idx.levelMin")}</Label>
                <Input
                  type="number"
                  value={levelMin}
                  onChange={(e) => setLevelMin(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("idx.levelMax")}</Label>
                <Input
                  type="number"
                  value={levelMax}
                  onChange={(e) => setLevelMax(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("idx.targetHeadcount")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={targetCount}
                  onChange={(e) => setTargetCount(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("idx.criticality")}</Label>
              <Select value={criticality} onValueChange={setCriticality}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(criticalityLabel).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("idx.assignTeam")}</Label>
              <Select value={nodeId} onValueChange={setNodeId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("idx.noTeam")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">{t("idx.noTeam")}</SelectItem>
                  {orgNodes.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.type === "Team" ? "— " : ""}
                      {n.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-muted-foreground">
              {t("idx.roleProfileHint")}
            </p>
          </div>
          <FormActions
            onCancel={() => setEditing(false)}
            onSave={() => save.mutate()}
            pending={save.isPending}
            disabled={!title.trim()}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function Cell({
  label,
  value,
  danger,
}: {
  label: string;
  value: string | number;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface-raised/50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p
        className={`mt-0.5 font-display text-base font-semibold tabular-nums ${danger ? "text-danger" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function DirectionMenu({
  direction,
  roleCount,
  onDone,
}: {
  direction: Direction;
  roleCount: number;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [title, setTitle] = useState(direction.title);
  const [description, setDescription] = useState(direction.description ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("directions")
        .update({ title: title.trim(), description: description.trim() || null })
        .eq("id", direction.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toastSaved(t("idx.directionUpdated"));
      setEditing(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("directions")
        .update({ archived: true })
        .eq("id", direction.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toastUndoable(
        t("idx.directionArchived"),
        t("ui.undo"),
        async () => {
          await supabase.from("directions").update({ archived: false }).eq("id", direction.id);
          onDone();
        },
        t("ui.undoHint"),
      );
      setConfirming(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 size-7 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="size-4" />
            <span className="sr-only">{t("idx.directionActionsSr")}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onSelect={() => {
              setTitle(direction.title);
              setDescription(direction.description ?? "");
              setEditing(true);
            }}
          >
            <Pencil className="size-3.5" /> {t("idx.editDirection")}
          </DropdownMenuItem>
          <DropdownMenuItem className="text-danger" onSelect={() => setConfirming(true)}>
            <Archive className="size-3.5" /> {t("idx.archiveDirection")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("idx.editDirectionTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("idx.directionName")}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("idx.directionDescription")}</Label>
              <Textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <FormActions
            onCancel={() => setEditing(false)}
            onSave={() => save.mutate()}
            pending={save.isPending}
            disabled={!title.trim()}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("idx.archiveDirectionConfirmTitle").replace("{title}", direction.title)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>{t("idx.archiveDirectionDesc1")}</p>
            {roleCount > 0 && (
              <p className="text-danger">
                {t("idx.archiveDirectionDesc2").replace("{count}", String(roleCount))}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {t("idx.cancel")}
            </Button>
            <Button
              className="bg-danger text-destructive-foreground hover:bg-danger/90"
              onClick={() => archive.mutate()}
              disabled={archive.isPending}
            >
              {t("idx.confirmArchive")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NewDirectionDialog({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("directions")
        .insert({ org_id: orgId, title, description });
      if (error) throw error;
    },
    onSuccess: () => {
      toastSaved(t("idx.directionCreated"));
      setOpen(false);
      setTitle("");
      setDescription("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <Plus className="size-4" /> {t("idx.newDirection")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("idx.newDirectionTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("idx.directionName")}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("idx.directionDescription")}</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <FormActions
          onCancel={() => setOpen(false)}
          onSave={() => create.mutate()}
          pending={create.isPending}
          disabled={!title.trim()}
        />
      </DialogContent>
    </Dialog>
  );
}

function NewRoleDialog({ directionId, onDone }: { directionId: string; onDone: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    level_min: "14",
    level_max: "16",
    target_count: "1",
    criticality: "important",
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("roles").insert({
        direction_id: directionId,
        title: form.title,
        description: form.description,
        level_min: Number(form.level_min),
        level_max: Number(form.level_max),
        target_count: Number(form.target_count),
        criticality: form.criticality,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toastSaved(t("idx.roleCreated"));
      setOpen(false);
      setForm({
        title: "",
        description: "",
        level_min: "14",
        level_max: "16",
        target_count: "1",
        criticality: "important",
      });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-4" /> {t("idx.newRole")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("idx.newRole")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("idx.roleName")}</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("idx.roleDescription")}</Label>
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>{t("idx.lowestLevel")}</Label>
              <Input
                type="number"
                value={form.level_min}
                onChange={(e) => setForm({ ...form, level_min: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("idx.highestLevel")}</Label>
              <Input
                type="number"
                value={form.level_max}
                onChange={(e) => setForm({ ...form, level_max: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("idx.targetHeadcount")}</Label>
              <Input
                type="number"
                value={form.target_count}
                onChange={(e) => setForm({ ...form, target_count: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("idx.criticality")}</Label>
            <Select
              value={form.criticality}
              onValueChange={(v) => setForm({ ...form, criticality: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="strategic_critical">Strategic Critical</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="important">Important</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <FormActions
          onCancel={() => setOpen(false)}
          onSave={() => create.mutate()}
          pending={create.isPending}
          disabled={!form.title.trim()}
        />

      </DialogContent>
    </Dialog>
  );
}
