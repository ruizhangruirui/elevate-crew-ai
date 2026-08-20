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
import { ConfirmAction } from "@/components/ConfirmAction";
import { StatTile } from "@/components/StatTile";
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
import { fetchOrgNodes } from "@/lib/org-tree";
import {
  actionSummary,
  fetchActions,
  isOverdue,
  priorityLabel,
  type ActionItem,
} from "@/lib/actions";
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
  return (
    <AppShell
      title="战略岗位视图"
      subtitle="从未来战略出发，定义关键研究 / 工作方向和目标岗位架构，并识别现实人才覆盖、Gap 与风险。"
    >
      <StrategyBoard />
    </AppShell>
  );
}

function StrategyBoard() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["workspace"], queryFn: fetchWorkspace });
  const orgNodes = useQuery({ queryKey: ["org-nodes"], queryFn: fetchOrgNodes });
  const actions = useQuery({ queryKey: ["actions"], queryFn: fetchActions });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openRoleId, setOpenRoleId] = useState<string | null>(null);

  useEffect(() => {
    if (data && !activeId && data.directions[0]) setActiveId(data.directions[0].id);
  }, [data, activeId]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["workspace"] });

  const archiveRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("roles").update({ archived: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("岗位已归档");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data) return <div className="text-sm text-muted-foreground">加载中…</div>;

  const { org, directions, roles, people } = data;
  const active = directions.find((d) => d.id === activeId) ?? directions[0] ?? null;
  const activeRoles = active ? roles.filter((r) => r.direction_id === active.id) : [];

  const totalSeats = roles.reduce((n, r) => n + r.target_count, 0);
  const totalGap = roles.reduce((n, r) => n + coverageOf(r, people).gap, 0);

  const dirStats = (dirId: string) => {
    const rs = roles.filter((r) => r.direction_id === dirId);
    const gap = rs.reduce((n, r) => n + coverageOf(r, people).gap, 0);
    return { count: rs.length, gap };
  };

  return (
    <div className="space-y-10">
      <ActionStrip list={actions.data ?? []} />

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
                {org?.tagline ?? "战略组织"}
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
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="关键方向" value={directions.length} />
              <StatTile label="目标岗位类型" value={roles.length} />
              <StatTile label="目标 Seat" value={totalSeats} />
              <StatTile label="当前 Gap" value={totalGap} tone={totalGap ? "danger" : "ok"} />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <Link to="/org" className="text-brand hover:underline">
                编制与团队结构 →
              </Link>
              <Link to="/capability" search={{ scope: undefined }} className="text-brand hover:underline">
                能力覆盖与缺口 →
              </Link>
              <Link to="/people" className="text-brand hover:underline">
                全员名单 →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Directions */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">关键研究 / 工作方向</h2>
            <p className="mt-1 text-sm text-muted-foreground">点击方向进入对应目标岗位架构。</p>
          </div>
          {org && <NewDirectionDialog orgId={org.id} onDone={invalidate} />}
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
                      {s.count} 岗位类型
                    </span>
                    <span
                      className={`rounded-md px-2 py-1 font-medium ${
                        s.gap ? "bg-danger/12 text-danger" : "bg-ok/12 text-ok"
                      }`}
                    >
                      {s.gap ? `${s.gap} Critical Gap` : "全覆盖"}
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
              <h2 className="font-display text-xl font-semibold">目标岗位架构</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {active.title} · {active.description}
              </p>
            </div>
            <NewRoleDialog directionId={active.id} onDone={invalidate} />
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activeRoles.map((role) => (
              <RoleCard
                key={role.id}
                role={role}
                filled={coverageOf(role, people).filled}
                gap={coverageOf(role, people).gap}
                members={people.filter((p) => p.role_id === role.id).map((p) => p.name)}
                teams={Array.from(
                  new Set(
                    people
                      .filter((p) => p.role_id === role.id && p.org_node_id)
                      .map(
                        (p) =>
                          (orgNodes.data ?? []).find((n) => n.id === p.org_node_id)?.name ?? "",
                      )
                      .filter(Boolean),
                  ),
                )}
                onArchive={() => archiveRole.mutate(role.id)}
                onOpen={() => setOpenRoleId(role.id)}
              />
            ))}
            {activeRoles.length === 0 && (
              <p className="text-sm text-muted-foreground">该方向下还没有目标岗位。</p>
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

function ActionStrip({ list }: { list: ActionItem[] }) {
  return <ActionStripInner list={list} />;
}

function EditOrgDialog({ org, onDone }: { org: Org; onDone: () => void }) {
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
      toast.success("组织信息已更新");
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
          <Pencil className="size-3" /> 编辑
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑战略组织</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>组织名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>副标题</Label>
            <Input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="例如：战略组织"
            />
          </div>
          <div className="space-y-2">
            <Label>组织使命 / 描述</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>标签（用、或逗号分隔）</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !name.trim()}
          >
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActionStripInner({ list }: { list: ActionItem[] }) {
  const s = actionSummary(list);
  const top = list
    .filter((a) => a.status === "todo" || a.status === "doing")
    .sort((a, b) => {
      const rank = (x: ActionItem) =>
        (isOverdue(x) ? 0 : 1) * 10 + (x.priority === "high" ? 0 : x.priority === "normal" ? 1 : 2);
      return rank(a) - rank(b);
    })
    .slice(0, 4);

  if (s.open === 0) return null;

  return (
    <section className="panel p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">需要跟进</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {s.open} 项进行中
            {s.overdue > 0 && <span className="text-danger"> · {s.overdue} 项已逾期</span>}
            {s.high > 0 && <span className="text-warn"> · {s.high} 项高优先级</span>}
          </p>
        </div>
        <Link to="/actions" className="text-xs text-brand hover:underline">
          待办中心 →
        </Link>
      </div>
      <ul className="mt-4 space-y-2">
        {top.map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border/60 bg-surface-raised/40 px-3 py-2 text-sm"
          >
            <span className="min-w-0 flex-1 truncate">{a.title}</span>
            {a.owner && <span className="text-xs text-muted-foreground">{a.owner}</span>}
            <span
              className={`text-xs ${isOverdue(a) ? "text-danger" : "text-muted-foreground"}`}
            >
              {a.due_on ?? "无期限"}
              {isOverdue(a) && " · 逾期"}
            </span>
            <span className="rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {priorityLabel[a.priority] ?? a.priority}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RoleCard({
  role,
  filled,
  gap,
  members,
  teams,
  onArchive,
  onOpen,
}: {
  role: Role;
  filled: number;
  gap: number;
  members: string[];
  teams: string[];
  onArchive: () => void;
  onOpen: () => void;
}) {
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
    <article className="panel flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <span className={`rounded-md px-2 py-1 text-[11px] font-medium ${stateStyle}`}>
          {stateLabel}
        </span>
        <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          {criticalityLabel[role.criticality] ?? role.criticality}
        </span>
      </div>

      <h3 className="mt-4 font-display text-lg font-semibold">{role.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{role.description}</p>

      <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
        <Cell label="目标级别" value={`${role.level_min}–${role.level_max}`} />
        <Cell label="目标人数" value={role.target_count} />
        <Cell label="当前覆盖" value={`${filled}/${role.target_count}`} />
        <Cell label="Gap" value={gap} danger={gap > 0} />
      </div>

      <div className="mt-4">
        <Progress value={pct} className="h-1.5" />
      </div>

      {teams.length > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Building2 className="size-3.5" />
          承载团队：{teams.join("、")}
        </p>
      )}

      {members.length > 0 && (
        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="size-3.5" />
          {members.join("、")}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-5">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onOpen}>
          查看岗位画像 <ArrowUpRight className="size-3.5" />
        </Button>
        <ConfirmAction
          title={`确认归档岗位「${role.title}」？`}
          description={
            <>
              <p>归档后该岗位会从战略岗位视图和组织能力视图中移除，其画像所承载的能力将不再计入覆盖统计。</p>
              <p>已归属该岗位的人员不会被删除，但会显示为未分配岗位。</p>
            </>
          }
          confirmLabel="确认归档"
          onConfirm={onArchive}
        >
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Archive className="size-3.5" /> 归档
          </Button>
        </ConfirmAction>
      </div>
    </article>
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
      toast.success("方向已更新");
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
      toast.success("方向已归档");
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
            <span className="sr-only">方向操作</span>
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
            <Pencil className="size-3.5" /> 编辑方向
          </DropdownMenuItem>
          <DropdownMenuItem className="text-danger" onSelect={() => setConfirming(true)}>
            <Archive className="size-3.5" /> 归档方向
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑研究 / 工作方向</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>方向名称</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>方向描述</Label>
              <Textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => save.mutate()} disabled={!title.trim() || save.isPending}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>归档「{direction.title}」？</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>归档后该方向会从战略岗位视图与能力视图中消失。</p>
            {roleCount > 0 && (
              <p className="text-danger">
                该方向下仍挂着 {roleCount} 个目标岗位类型，它们将一并不再展示。
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              取消
            </Button>
            <Button
              className="bg-danger text-white hover:bg-danger/90"
              onClick={() => archive.mutate()}
              disabled={archive.isPending}
            >
              确认归档
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NewDirectionDialog({ orgId, onDone }: { orgId: string; onDone: () => void }) {
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
      toast.success("已新增研究方向");
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
          <Plus className="size-4" /> 新增研究方向
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增研究 / 工作方向</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>方向名称</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>方向描述</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={!title.trim() || create.isPending}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewRoleDialog({ directionId, onDone }: { directionId: string; onDone: () => void }) {
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
      toast.success("已新增战略岗位");
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
          <Plus className="size-4" /> 新增战略岗位
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增战略岗位</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>岗位名称</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>岗位描述</Label>
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>最低级别</Label>
              <Input
                type="number"
                value={form.level_min}
                onChange={(e) => setForm({ ...form, level_min: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>最高级别</Label>
              <Input
                type="number"
                value={form.level_max}
                onChange={(e) => setForm({ ...form, level_max: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>目标人数</Label>
              <Input
                type="number"
                value={form.target_count}
                onChange={(e) => setForm({ ...form, target_count: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>关键度</Label>
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
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={!form.title.trim() || create.isPending}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
