import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Mail,
  Search,
  Check,
  X,
  Send,
  Save,
  History,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { listOffers, getOffer, mutateOffer } from "@/lib/offer-workflow.functions";
import {
  OFFER_STATES,
  type OfferTerms,
  type OfferAccount,
  type OfferRequest,
} from "@/lib/offer-workflow";
import { fetchApprovalMailTemplate, buildApprovalMailto } from "@/lib/approval-mail";
import type { OfferEvent } from "@/lib/offer-workflow";
import type { ActionItem } from "@/lib/actions";
import { formatDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmAction } from "@/components/ConfirmAction";

const stateNames: Record<string, [string, string]> = {
  draft: ["草稿", "Draft"],
  hiring_manager: ["Hiring Manager 审批", "Hiring Manager approval"],
  lab_director: ["Lab Director 审批", "Lab Director approval"],
  hrd: ["HRD 审批", "HRD approval"],
  approved: ["已批准 · 待发送", "Approved · ready to send"],
  rejected: ["已拒绝 · 待修订", "Rejected · revise"],
  sent: ["Offer 已发送", "Offer sent"],
  accepted: ["Offer 已接受 · 待入职", "Offer accepted · to onboard"],
  onboarded: ["已入职", "Onboarded"],
  withdrawn: ["已撤回", "Withdrawn"],
};
const fields: Record<keyof OfferTerms, [string, string]> = {
  candidate_name: ["候选人姓名", "Candidate name"],
  job_title: ["Job Title", "Job Title"],
  job_level: ["职级", "Job level"],
  salary_information: ["薪资信息（含币种、周期）", "Salary information (currency & period)"],
  additional_salary: ["额外薪资 / 津贴", "Additional salary / allowances"],
  contract_term: ["合同期限类型", "Contract term"],
  duration_months: ["合同期限（月）", "Duration (months)"],
  start_date: ["入职日期", "Start date"],
  end_date: ["合同截止日期", "Contract end date"],
  supervisor_id: ["主管", "Supervisor"],
  workload: ["工作量（%）", "Workload (%)"],
  contract_type: ["合同类型", "Contract type"],
  project_code: ["项目代码", "Project code"],
  technical_interviewer: ["技术面试官", "Technical interviewer"],
  hr_interviewer: ["HR 面试官", "HR interviewer"],
  comprehensive_interviewer: ["综合面试官", "Comprehensive interviewer"],
};
const stateTone = (s: string) =>
  ["approved", "accepted", "onboarded"].includes(s)
    ? "bg-ok/12 text-ok"
    : s === "withdrawn"
      ? "bg-muted text-muted-foreground"
      : s === "rejected"
        ? "bg-danger/10 text-danger"
        : "bg-brand/12 text-brand";
export function OfferApprovalBoard({
  selectedId,
  onSelect,
}: {
  selectedId?: string | undefined;
  onSelect: (id: string | undefined) => void;
}) {
  const { lang } = useI18n();
  const l = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const [query, setQuery] = useState("");
  const [state, setState] = useState("all");
  const [lab, setLab] = useState("all");
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const { data, error, isFetching } = useQuery({
    queryKey: ["offers", query, state, lab, mine, page],
    queryFn: () => listOffers({ data: { query, state, lab, mine, page } }),
    refetchInterval: 60_000,
  });
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline" size="sm">
          <Link to="/recruiting">
            <ChevronLeft className="size-4" />
            {l("招聘", "Recruiting")}
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="h-9 w-52 pl-9"
              aria-label={l("搜索 Offer", "Search offers")}
              placeholder={l("姓名 / 岗位 / Recruiter", "Name / job / recruiter")}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={state}
            onValueChange={(v) => {
              setState(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-52" aria-label={l("审批进度", "Approval state")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{l("全部进度", "All states")}</SelectItem>
              {OFFER_STATES.map((s) => (
                <SelectItem key={s} value={s}>
                  {stateNames[s]?.[lang === "zh" ? 0 : 1]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={lab}
            onValueChange={(v) => {
              setLab(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-40" aria-label="Lab">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{l("全部 Lab", "All Labs")}</SelectItem>
              {data?.labs.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={mine}
              onChange={(e) => {
                setMine(e.target.checked);
                setPage(1);
              }}
            />
            {l("待我处理", "My pending items")}
          </label>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error.message}
        </p>
      )}
      <div className="space-y-3" aria-busy={isFetching}>
        {data?.rows.map((o) => (
          <OfferRow key={o.id} offer={o} onOpen={() => onSelect(o.id)} />
        ))}
      </div>
      {data?.total === 0 && (
        <p className="py-12 text-center text-muted-foreground">{l("暂无 Offer", "No offers")}</p>
      )}
      <div className="flex items-center justify-between border-t border-border pt-4 text-sm text-muted-foreground">
        <span>
          {l("共", "Total")} {data?.total ?? 0}
        </span>
        <div className="flex items-center gap-3">
          <Button
            size="icon"
            variant="outline"
            aria-label={l("上一页", "Previous page")}
            disabled={!data || data.page <= 1}
            onClick={() => setPage((data?.page ?? 1) - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span>
            {data?.page ?? 1} / {Math.max(1, Math.ceil((data?.total ?? 0) / 10))}
          </span>
          <Button
            size="icon"
            variant="outline"
            aria-label={l("下一页", "Next page")}
            disabled={!data || data.page * 10 >= data.total}
            onClick={() => setPage((data?.page ?? 1) + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      {selectedId && <OfferApprovalDialog id={selectedId} onClose={() => onSelect(undefined)} />}
    </div>
  );
}
function OfferRow({ offer: o, onOpen }: { offer: OfferRequest; onOpen: () => void }) {
  const { lang } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <article className="card-glass overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Button
          variant="ghost"
          className="h-auto min-w-0 flex-1 justify-start gap-2 whitespace-normal text-left"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <ChevronDown className={`size-4 shrink-0 ${open ? "" : "-rotate-90"}`} />
          <span>
            <span className="block font-semibold">{o.candidate_name}</span>
            <span className="text-xs text-muted-foreground">
              {o.job_title} · {o.lab_name}
            </span>
          </span>
        </Button>
        <span className={`rounded px-2 py-1 text-xs ${stateTone(o.state)}`}>
          {stateNames[o.state]?.[lang === "zh" ? 0 : 1]}
        </span>
        <Button variant="outline" size="sm" onClick={onOpen}>
          {lang === "zh" ? "打开表单" : "Open offer"}
        </Button>
      </div>
      {open && (
        <div className="flex flex-wrap justify-between gap-3 border-t border-border/60 px-5 py-3 text-sm">
          <span>Recruiter: {o.recruiter_name}</span>
          <span>
            {lang === "zh" ? "审批轮次" : "Round"}: {o.round} ·{" "}
            {lang === "zh" ? "版本" : "Revision"}: {o.revision}
          </span>
          <span>{formatDate(o.updated_at)}</span>
          <span>{o.recipient?.name ?? "—"}</span>
        </div>
      )}
    </article>
  );
}
export function OfferApprovalDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { lang } = useI18n();
  const { data, error } = useQuery({
    queryKey: ["offer", id],
    queryFn: () => getOffer({ data: { id } }),
  });
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="block max-h-[92dvh] w-[calc(100vw-1rem)] space-y-4 overflow-y-auto overscroll-contain sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Offer approval · {data?.offer.candidate_name ?? "…"}</DialogTitle>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-danger">
            {error.message}
          </p>
        )}
        {data && <OfferForm key={`${id}-${data.offer.revision}`} data={data} />}
        {!data && !error && <p>{lang === "zh" ? "加载中…" : "Loading…"}</p>}
      </DialogContent>
    </Dialog>
  );
}
function OfferForm({ data }: { data: Awaited<ReturnType<typeof getOffer>> }) {
  const { lang } = useI18n();
  const l = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const qc = useQueryClient();
  const o = data.offer;
  const [terms, setTerms] = useState(o.terms);
  const [hm, setHm] = useState(o.hiring_manager_user_id ?? data.defaults.hiring_manager_user_id);
  const [ld, setLd] = useState(o.lab_director_user_id ?? data.defaults.lab_director_user_id);
  const [hrd, setHrd] = useState(o.hrd_user_id ?? data.defaults.hrd_user_id);
  const [note, setNote] = useState("");
  const { data: mailTpl } = useQuery({
    queryKey: ["approval-mail-template"],
    queryFn: fetchApprovalMailTemplate,
  });
  const mutation = useMutation({
    mutationFn: (
      command: "save" | "submit" | "approve" | "reject" | "sent" | "accepted" | "withdraw",
    ) =>
      mutateOffer({
        data: {
          id: o.id,
          revision: o.revision,
          command,
          ...(terms ? { terms } : {}),
          hiring_manager_user_id: hm,
          lab_director_user_id: ld,
          hrd_user_id: hrd,
          note,
        },
      }),
    onSuccess: () => {
      toast.success(l("已保存并更新审批进度", "Saved and workflow updated"));
      qc.invalidateQueries({ refetchType: "all" });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["offer", o.id] });
    },
  });
  const dirty =
    JSON.stringify(terms) !== JSON.stringify(o.terms) ||
    hm !== (o.hiring_manager_user_id ?? data.defaults.hiring_manager_user_id) ||
    ld !== (o.lab_director_user_id ?? data.defaults.lab_director_user_id) ||
    hrd !== (o.hrd_user_id ?? data.defaults.hrd_user_id);
  const label = (k: keyof OfferTerms) => fields[k][lang === "zh" ? 0 : 1];
  const field = (k: keyof OfferTerms, type = "text") => (
    <div className="space-y-1" key={k}>
      <Label htmlFor={`offer-${k}`} className="text-xs">
        {label(k)}
        {k !== "additional_salary" ? " *" : ""}
      </Label>
      <Input
        id={`offer-${k}`}
        type={type}
        value={terms?.[k] ?? ""}
        disabled={!o.can_edit || mutation.isPending}
        min={type === "number" ? 1 : undefined}
        onChange={(e) => setTerms((prev) => (prev ? { ...prev, [k]: e.target.value } : prev))}
        className="h-9"
      />
    </div>
  );
  const picker = (
    title: string,
    value: string,
    set: (s: string) => void,
    options: { id: string; name: string }[],
    optional = false,
  ) => (
    <div className="space-y-1">
      <Label className="text-xs">
        {title}
        {optional ? "" : " *"}
      </Label>
      <Select
        value={value || "none"}
        disabled={!o.can_edit || mutation.isPending}
        onValueChange={(v) => set(v === "none" ? "" : v)}
      >
        <SelectTrigger className="h-9" aria-label={title}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">—</SelectItem>
          {options.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  const accountOptions = (options: OfferAccount[], value: string) =>
    options.some((u) => u.id === value) || !value
      ? options
      : [
          ...options,
          {
            id: value,
            name: l("原审批人（当前不可选）", "Previous approver (unavailable)"),
            email: "",
            role: "",
            scope_node_ids: [],
          },
        ];
  const mailAction = {
    title: `Offer · ${o.candidate_name} · ${stateNames[o.state]?.[lang === "zh" ? 0 : 1]}`,
    due_on: null,
  } as ActionItem;
  const mailto = buildApprovalMailto({
    action: mailAction,
    to: o.recipient?.email ? [o.recipient.email] : [],
    recipient: o.recipient?.name ?? "",
    link:
      typeof window === "undefined"
        ? ""
        : `${window.location.origin}/recruiting/offers?offer=${o.id}`,
    description: `${o.job_title} · ${o.lab_name} · ${l("审批轮次", "Round")} ${o.round}`,
    lang,
    template: mailTpl?.template,
  });
  const nameOf = (list: OfferAccount[], id: string) => list.find((u) => u.id === id)?.name ?? "";
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="order-2 min-w-0 space-y-5 lg:order-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`rounded px-2 py-1 text-sm ${stateTone(o.state)}`}>
            {stateNames[o.state]?.[lang === "zh" ? 0 : 1]}
          </span>
          <span className="text-xs text-muted-foreground">
            {l("轮次", "Round")} {o.round} · {l("版本", "Revision")} {o.revision}
          </span>
          {o.recipient && (
            <Button asChild variant="outline" size="sm">
              <a href={mailto}>
                <Mail className="size-4" />
                {l("邮件通知下一位", "Notify next")}: {o.recipient.name}
              </a>
            </Button>
          )}
        </div>
        {terms ? (
          <>
            <Fold title={l("岗位与组织", "Position & organization")}>
              <div className="grid gap-3 sm:grid-cols-3">
                {field("candidate_name")}
                {field("job_title")}
                {field("job_level", "number")}
                <div>
                  <Label className="text-xs">Lab</Label>
                  <p className="mt-2 text-sm">{o.lab_name}</p>
                </div>
                <div>
                  <Label className="text-xs">Recruiter</Label>
                  <p className="mt-2 text-sm">{o.recruiter_name}</p>
                </div>
                {field("project_code")}
              </div>
            </Fold>
            <Fold title={l("薪资与合同", "Compensation & contract")}>
              <div className="grid gap-3 sm:grid-cols-2">
                {field("salary_information")}
                {field("additional_salary")}
                {picker(
                  label("contract_type"),
                  terms.contract_type,
                  (v) => setTerms({ ...terms, contract_type: v }),
                  [
                    "Employee",
                    "Leased Employee",
                    "Leased via Connect 44",
                    "Leased via Hays",
                    "Intern",
                    "Consultant",
                    terms.contract_type,
                  ]
                    .filter((v, i, a) => !!v && a.indexOf(v) === i)
                    .map((v) => ({ id: v, name: v })),
                )}
                {picker(
                  label("contract_term"),
                  terms.contract_term,
                  (v) =>
                    setTerms({
                      ...terms,
                      contract_term: v === "fixed_term" ? "fixed_term" : "open_ended",
                      ...(v !== "fixed_term" ? { end_date: "", duration_months: "" } : {}),
                    }),
                  [
                    { id: "fixed_term", name: l("固定期限", "Fixed term") },
                    { id: "open_ended", name: l("无固定期限", "Open ended") },
                  ],
                )}
                {field("start_date", "date")}
                {terms.contract_term === "fixed_term" && (
                  <>
                    {field("end_date", "date")}
                    {field("duration_months", "number")}
                  </>
                )}
                {field("workload", "number")}
                {picker(
                  label("supervisor_id"),
                  terms.supervisor_id,
                  (v) => setTerms({ ...terms, supervisor_id: v }),
                  data.supervisors,
                )}
              </div>
            </Fold>
            <Fold title={l("面试与审批人", "Interviewers & approvers")}>
              <div className="grid gap-3 sm:grid-cols-3">
                {field("technical_interviewer")}
                {field("hr_interviewer")}
                {field("comprehensive_interviewer")}
                {picker(
                  stateNames["hiring_manager"]?.[lang === "zh" ? 0 : 1] ?? "Hiring Manager",
                  hm,
                  setHm,
                  accountOptions(data.choices.hiring_manager, hm),
                )}
                {picker(
                  `${stateNames["lab_director"]?.[lang === "zh" ? 0 : 1] ?? "Lab Director"} (${l("选填", "optional")})`,
                  ld,
                  setLd,
                  accountOptions(data.choices.lab_director, ld),
                  true,
                )}
                {picker("HRD approval", hrd, setHrd, accountOptions(data.choices.hrd, hrd))}
              </div>
            </Fold>
          </>
        ) : (
          <p className="border-y border-border py-4 text-sm text-muted-foreground">
            {l(
              "你可以查看审批进度，但没有 Offer 条款及薪资的查看权限。",
              "You can view progress, but not confidential offer terms or compensation.",
            )}
          </p>
        )}
        {o.can_decide && (
          <div className="space-y-2">
            <Label htmlFor="offer-note">
              {l("审批意见（拒绝必填）", "Decision note (required for rejection)")}
            </Label>
            <Textarea
              id="offer-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          {o.can_edit && (
            <>
              <ConfirmAction
                title={l("保存 Offer 修订", "Save offer revision")}
                description={
                  <p>
                    {l(
                      "修改会保留日志，并清除当前审批效力，需要重新提交审批。",
                      "Changes are logged and invalidate the current approval. Resubmit for approval.",
                    )}
                  </p>
                }
                confirmLabel={l("保存修订", "Save revision")}
                onConfirm={() => mutation.mutate("save")}
              >
                <Button variant="outline" disabled={mutation.isPending}>
                  <Save className="size-4" />
                  {l("保存草稿", "Save draft")}
                </Button>
              </ConfirmAction>
              <ConfirmAction
                title={l("提交新一轮审批", "Submit new approval round")}
                description={<p>Hiring Manager → {ld ? "Lab Director → " : ""}HRD</p>}
                confirmLabel={l("提交审批", "Submit")}
                onConfirm={() => mutation.mutate("submit")}
              >
                <Button disabled={mutation.isPending}>
                  <Send className="size-4" />
                  {l("提交审批", "Submit for approval")}
                </Button>
              </ConfirmAction>
            </>
          )}
          {o.can_decide && (
            <>
              <ConfirmAction
                title={l("拒绝 Offer", "Reject offer")}
                description={<p>{note}</p>}
                confirmLabel={l("确认拒绝", "Reject")}
                onConfirm={() => mutation.mutate("reject")}
              >
                <Button variant="outline" disabled={!note.trim() || mutation.isPending}>
                  <X className="size-4" />
                  {l("拒绝", "Reject")}
                </Button>
              </ConfirmAction>
              <ConfirmAction
                title={l("批准当前版本", "Approve current revision")}
                description={
                  <p>
                    {l(
                      "批准后将流转至下一位审批人；HRD 批准后交回 Recruiter。",
                      "Moves to the next approver, or back to the recruiter after HRD approval.",
                    )}
                  </p>
                }
                confirmLabel={l("确认批准", "Approve")}
                onConfirm={() => mutation.mutate("approve")}
              >
                <Button disabled={mutation.isPending}>
                  <Check className="size-4" />
                  {l("批准", "Approve")}
                </Button>
              </ConfirmAction>
            </>
          )}
          {o.can_edit && (
            <ConfirmAction
              title={l("撤回 Offer 审批", "Withdraw offer approval")}
              description={
                <p>
                  {l(
                    "审批流程将终止，候选人回到发起审批前的阶段；审批记录会保留，之后可重新发起。",
                    "The approval stops and the candidate returns to the previous stage. History is kept and you can start again later.",
                  )}
                </p>
              }
              confirmLabel={l("确认撤回", "Withdraw")}
              onConfirm={() => mutation.mutate("withdraw")}
            >
              <Button variant="outline" disabled={mutation.isPending}>
                {l("撤回审批", "Withdraw")}
              </Button>
            </ConfirmAction>
          )}
          {o.can_edit && o.state === "approved" && (
            <ConfirmAction
              title={l("确认 Offer 已发送", "Confirm offer sent")}
              description={<p>{o.candidate_name}</p>}
              confirmLabel={l("确认已发送", "Confirm sent")}
              onConfirm={() => mutation.mutate("sent")}
            >
              <Button disabled={dirty || mutation.isPending}>
                <Send className="size-4" />
                Offer sent
              </Button>
            </ConfirmAction>
          )}
          {o.can_edit && o.state === "sent" && (
            <ConfirmAction
              title={l("确认 Offer 已接受", "Confirm offer accepted")}
              description={
                <p>
                  {l(
                    "进入待入职；入职日期到期后整合批准的 Offer 资料。",
                    "Moves to To onboard; approved terms are integrated when the start date arrives.",
                  )}{" "}
                  {formatDate(o.terms?.start_date)}
                </p>
              }
              confirmLabel="Offer accepted"
              onConfirm={() => mutation.mutate("accepted")}
            >
              <Button disabled={dirty || mutation.isPending}>
                <Check className="size-4" />
                Offer accepted
              </Button>
            </ConfirmAction>
          )}
        </div>
        {o.terms && (
          <Fold
            title={l("审批与修改日志", "Approval & change history")}
            icon={<History className="size-4" />}
          >
            <div className="space-y-3">
              {data.history.map((e) => (
                <div key={e.id} className="border-b border-border/60 pb-3 text-xs">
                  <p className="flex flex-wrap justify-between gap-2 font-medium">
                    <span>
                      {e.actor_name} · {e.kind} · {l("轮次", "Round")} {e.round} · v{e.revision}
                    </span>
                    <time>
                      {new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-GB", {
                        dateStyle: "medium",
                        timeStyle: "long",
                        timeZone: "Europe/Zurich",
                      }).format(new Date(e.created_at))}{" "}
                      (Zurich)
                    </time>
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {e.from_state ?? "—"} → {e.to_state}
                  </p>
                  {e.note && <p className="mt-1 whitespace-pre-wrap">{e.note}</p>}
                  {Object.entries(e.changes).map(([k, v]) => (
                    <p key={k} className="mt-1 break-words">
                      <span className="font-medium">
                        {fields[k as keyof OfferTerms]?.[lang === "zh" ? 0 : 1] ?? k}
                      </span>
                      :{" "}
                      {typeof v.before === "object"
                        ? JSON.stringify(v.before)
                        : String(v.before ?? "—")}{" "}
                      →{" "}
                      {typeof v.after === "object"
                        ? JSON.stringify(v.after)
                        : String(v.after ?? "—")}
                    </p>
                  ))}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-brand">
                      {l("当时的完整表单", "Full form at this revision")}
                    </summary>
                    <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                      {Object.entries(e.terms_snapshot).map(([k, v]) => (
                        <div key={k}>
                          <dt className="text-muted-foreground">
                            {fields[k as keyof OfferTerms]?.[lang === "zh" ? 0 : 1] ?? k}
                          </dt>
                          <dd className="break-words">{v || "—"}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                </div>
              ))}
            </div>
          </Fold>
        )}
        {o.state === "onboarded" && (
          <Button asChild variant="link">
            <Link to="/recruiting" search={{ role: o.role_id }}>
              <ExternalLink className="size-4" />
              {l("查看入职候选人", "View onboarded candidate")}
            </Link>
          </Button>
        )}
      </div>
      <aside className="order-1 lg:order-2">
        <OfferFlow
          offer={o}
          history={data.history}
          names={{
            hiring_manager: nameOf(data.choices.hiring_manager, hm),
            lab_director: nameOf(data.choices.lab_director, ld),
            hrd: nameOf(data.choices.hrd, hrd),
          }}
        />
      </aside>
    </div>
  );
}
function Fold({ title, children, icon }: { title: string; children: ReactNode; icon?: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="border-t border-border pt-3">
      <Button
        variant="ghost"
        className="mb-2 h-auto w-full justify-start gap-2 px-0 py-1 text-sm font-semibold"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <ChevronDown className={`size-4 ${open ? "" : "-rotate-90"}`} />
        {icon}
        {title}
      </Button>
      {open && children}
    </section>
  );
}

const flowOrder = [
  "draft",
  "hiring_manager",
  "lab_director",
  "hrd",
  "approved",
  "sent",
  "accepted",
  "onboarded",
];
function OfferFlow({
  offer: o,
  history,
  names,
}: {
  offer: OfferRequest;
  history: OfferEvent[];
  names: { hiring_manager: string; lab_director: string; hrd: string };
}) {
  const { lang } = useI18n();
  const l = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const cur = o.state === "rejected" || o.state === "withdrawn" ? 0 : flowOrder.indexOf(o.state);
  const steps: { key: string; title: string; who: string }[] = [
    {
      key: "draft",
      title: l("Recruiter 填写 Offer", "Recruiter prepares offer"),
      who: o.recruiter_name,
    },
    { key: "hiring_manager", title: "Hiring Manager", who: names.hiring_manager },
    {
      key: "lab_director",
      title: "Lab Director",
      who: names.lab_director || l("选填 · 未指定则跳过", "Optional · skipped if empty"),
    },
    { key: "hrd", title: "HR Director", who: names.hrd },
    { key: "sent", title: l("发送 Offer", "Send offer"), who: o.recruiter_name },
    {
      key: "accepted",
      title: l("Offer 接受 · 待入职", "Offer accepted · to onboard"),
      who: o.candidate_name,
    },
  ];
  const stepIdx = (k: string) =>
    k === "sent" ? flowOrder.indexOf("approved") : flowOrder.indexOf(k);
  const holder = ["rejected", "withdrawn", "draft", "approved"].includes(o.state)
    ? o.recruiter_name
    : o.state === "sent"
      ? o.candidate_name
      : o.recipient?.name || (names as Record<string, string>)[o.state] || "";
  const verb = (e: OfferEvent) =>
    ({
      create: l("发起流程", "started the process"),
      save: l("修改了 Offer", "edited the offer"),
      submit:
        e.round > 1
          ? l("修改后重新提交审批", "resubmitted for approval")
          : l("提交审批", "submitted for approval"),
      approve: l("批准", "approved"),
      reject: l("拒绝", "rejected"),
      withdraw: l("撤回审批", "withdrew the approval"),
      sent: l("确认 Offer 已发送", "confirmed offer sent"),
      accepted: l("确认 Offer 已接受", "confirmed offer accepted"),
      onboarded: l("已入职", "onboarded"),
    })[e.kind] ?? e.kind;
  const stage = (s: string | null) => (s ? (stateNames[s]?.[lang === "zh" ? 0 : 1] ?? s) : "");
  const timeline = [...history].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const fmt = (d: string) =>
    new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Zurich",
    }).format(new Date(d));
  return (
    <div className="card-glass space-y-5 rounded-xl border border-border p-4 lg:sticky lg:top-0">
      <div>
        <p className="text-xs text-muted-foreground">{l("当前在谁手上", "Currently with")}</p>
        <p className="mt-1 text-base font-semibold text-brand">{holder || "—"}</p>
        <p className="text-xs text-muted-foreground">{stage(o.state)}</p>
      </div>
      <ol className="relative space-y-0">
        {steps.map((s, i) => {
          const idx = stepIdx(s.key);
          const active =
            o.state === s.key ||
            (s.key === "draft" && ["draft", "rejected", "withdrawn"].includes(o.state)) ||
            (s.key === "sent" && o.state === "approved") ||
            (s.key === "accepted" && o.state === "sent");
          const done = !active && cur > idx;
          const rejectedHere = s.key === "draft" && o.state === "rejected";
          return (
            <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
              {i < steps.length - 1 && (
                <span
                  className={`absolute left-[13px] top-7 h-[calc(100%-1.5rem)] w-0.5 ${done ? "bg-ok" : "bg-border"}`}
                />
              )}
              <span
                className={`relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold ${
                  done
                    ? "border-ok bg-ok text-primary-foreground"
                    : active
                      ? rejectedHere
                        ? "border-danger bg-danger/10 text-danger"
                        : "border-brand bg-brand/12 text-brand ring-4 ring-brand/15"
                      : "border-border bg-background text-muted-foreground"
                }`}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <p
                  className={`text-sm font-medium ${active ? "text-foreground" : done ? "" : "text-muted-foreground"}`}
                >
                  {s.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.who || l("未指定", "Not assigned")}
                </p>
                {active && (
                  <p
                    className={`mt-1 text-xs font-medium ${rejectedHere ? "text-danger" : "text-brand"}`}
                  >
                    {rejectedHere
                      ? l("被拒绝 · 待修订", "Rejected · revise")
                      : l("进行中", "In progress")}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {timeline.length > 0 && (
        <div className="border-t border-border pt-4">
          <p className="mb-3 text-xs font-semibold text-muted-foreground">
            {l("流程节点", "Process timeline")}
          </p>
          <ol className="space-y-3 border-l border-border pl-4">
            {timeline.map((e, i) => (
              <li key={e.id} className="relative text-xs">
                <span
                  className={`absolute -left-[21px] top-1 size-2.5 rounded-full ${
                    e.kind === "reject"
                      ? "bg-danger"
                      : e.kind === "approve" || e.kind === "accepted"
                        ? "bg-ok"
                        : "bg-brand"
                  }`}
                />
                <p>
                  <span className="font-semibold">
                    {i + 1}. {e.actor_name}
                  </span>{" "}
                  {e.kind === "approve" && e.from_state ? `(${stage(e.from_state)}) ` : ""}
                  {verb(e)}
                  {e.kind === "approve" || e.kind === "submit" ? ` → ${stage(e.to_state)}` : ""}
                </p>
                {e.note && <p className="mt-0.5 italic text-muted-foreground">“{e.note}”</p>}
                <time className="text-muted-foreground">{fmt(e.created_at)}</time>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
