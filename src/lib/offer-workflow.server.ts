import { z } from "zod";
import { admin, requireUser, managerScope, type AppUser } from "./auth.server";
import {
  canDecideOffer,
  canEditOffer,
  currentOfferApprover,
  fullOfferAccess,
  emptyOfferTerms,
  offerTermsSchema,
  validateOfferTerms,
  nextOfferState,
  type OfferAccount,
  type OfferTerms,
  type OfferRequest,
  type OfferEvent,
} from "./offer-workflow";

type RawOffer = Omit<
  OfferRequest,
  | "candidate_name"
  | "job_title"
  | "lab_name"
  | "recruiter_name"
  | "can_edit"
  | "can_decide"
  | "recipient"
> & { terms: OfferTerms };
type Node = { id: string; name: string; parent_id: string | null; type: string };
type Person = {
  id: string;
  name: string;
  company_email: string | null;
  org_node_id: string | null;
  is_leader: boolean;
  is_plr: boolean;
};
async function context() {
  const user = await requireUser();
  const db = await admin();
  const [us, ns, ps, rs] = await Promise.all([
    db.from("app_users").select("id,name,email,role,scope_node_ids").eq("status", "active"),
    db.from("org_nodes").select("id,name,parent_id,type").eq("archived", false),
    db
      .from("people")
      .select("id,name,company_email,org_node_id,is_leader,is_plr")
      .eq("archived", false)
      .neq("status", "left"),
    db
      .from("roles")
      .select(
        "id,title,job_title,org_node_id,recruiter_person_id,supervisor_person_id,level_min,contract_type,visible_to_person_ids,archived,approval_status",
      ),
  ]);
  for (const result of [us, ns, ps, rs]) if (result.error) throw new Error(result.error.message);
  const accounts = (us.data ?? []) as OfferAccount[];
  const nodes = (ns.data ?? []) as Node[];
  const people = (ps.data ?? []) as Person[];
  const roles = rs.data ?? [];
  const scope =
    user.role === "manager" || (user.role === "hr" && user.scope_node_ids.length)
      ? await managerScope(user)
      : null;
  return { user, db, accounts, nodes, people, roles, scope };
}
type Ctx = Awaited<ReturnType<typeof context>>;
function inLab(node: string | null, lab: string, nodes: Node[]) {
  const visited = new Set<string>();
  while (node && !visited.has(node)) {
    if (node === lab) return true;
    visited.add(node);
    node = nodes.find((n) => n.id === node)?.parent_id ?? null;
  }
  return false;
}
function accountForPerson(p: Person | undefined, accounts: OfferAccount[]) {
  if (!p) return null;
  const matches = p.company_email
    ? accounts.filter((u) => u.email.toLowerCase() === p.company_email?.toLowerCase())
    : accounts.filter((u) => u.name === p.name);
  return matches.length === 1 ? (matches[0] ?? null) : null;
}
function eligible(ctx: Ctx, o: RawOffer) {
  const managers = ctx.accounts.filter(
    (u) =>
      u.role === "manager" && u.scope_node_ids.some((id) => inLab(o.org_node_id, id, ctx.nodes)),
  );
  const labDirectors = ctx.accounts.filter(
    (u) =>
      u.role === "manager" &&
      ctx.people.some(
        (p) =>
          ((p.is_leader && p.org_node_id === o.lab_id) ||
            (p.is_plr && inLab(p.org_node_id, o.lab_id, ctx.nodes))) &&
          accountForPerson(p, ctx.accounts)?.id === u.id,
      ),
  );
  const hrds = ctx.accounts.filter((u) => u.role === "hr_director");
  return { hiring_manager: managers, lab_director: labDirectors, hrd: hrds };
}
function full(ctx: Ctx, o: RawOffer) {
  return fullOfferAccess(ctx.user, o, !ctx.scope || ctx.scope.nodeIds.has(o.org_node_id ?? ""));
}
function visible(ctx: Ctx, o: RawOffer) {
  if (full(ctx, o)) return true;
  if (!ctx.scope && ctx.user.role === "recruiter") return true;
  if (ctx.scope?.nodeIds.has(o.org_node_id ?? "")) return true;
  const me = ctx.people
    .filter((p) => accountForPerson(p, ctx.accounts)?.id === ctx.user.id)
    .map((p) => p.id);
  return ctx.roles.some(
    (r) =>
      r.id === o.role_id && (r.visible_to_person_ids ?? []).some((id: string) => me.includes(id)),
  );
}
function present(ctx: Ctx, o: RawOffer): OfferRequest {
  const recipient = ctx.accounts.find((u) => u.id === currentOfferApprover(o));
  return {
    ...o,
    terms: full(ctx, o) ? o.terms : null,
    candidate_name: o.terms.candidate_name,
    job_title: o.terms.job_title,
    lab_name: ctx.nodes.find((n) => n.id === o.lab_id)?.name ?? "—",
    recruiter_name: ctx.accounts.find((u) => u.id === o.recruiter_user_id)?.name ?? "—",
    can_edit: canEditOffer(ctx.user, o),
    can_decide: canDecideOffer(ctx.user, o),
    recipient: recipient ? { name: recipient.name, email: recipient.email } : null,
  };
}
export async function listOffersServer(data: {
  query: string;
  state: string;
  lab: string;
  page: number;
  mine: boolean;
}) {
  const ctx = await context();
  const { data: rows, error } = await ctx.db
    .from("offer_requests")
    .select("*")
    .order("updated_at", { ascending: false })
    .order("id");
  if (error) throw new Error(error.message);
  const q = data.query.toLowerCase().trim();
  const accessible = (rows ?? [])
    .filter((o) => visible(ctx, o as unknown as RawOffer))
    .map((o) => present(ctx, o as unknown as RawOffer));
  const filtered = accessible.filter(
    (o) =>
      (data.state === "all" || o.state === data.state) &&
      (data.lab === "all" || o.lab_id === data.lab) &&
      (!data.mine || currentOfferApprover(o) === ctx.user.id) &&
      (!q ||
        [o.candidate_name, o.job_title, o.recruiter_name].some((v) => v.toLowerCase().includes(q))),
  );
  const page = Math.min(data.page, Math.max(1, Math.ceil(filtered.length / 10)));
  return {
    rows: filtered.slice((page - 1) * 10, page * 10),
    total: filtered.length,
    page,
    labs: [
      ...new Map(accessible.map((o) => [o.lab_id, { id: o.lab_id, name: o.lab_name }])).values(),
    ],
  };
}
export async function getOfferServer(data: { id: string }) {
  const ctx = await context();
  const { data: row, error } = await ctx.db
    .from("offer_requests")
    .select("*")
    .eq("id", data.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const o = row as unknown as RawOffer | null;
  if (!o || !visible(ctx, o)) throw new Error("Offer unavailable");
  const permitted = full(ctx, o);
  const { data: history, error: historyError } = permitted
    ? await ctx.db
        .from("offer_request_events")
        .select("*")
        .eq("offer_id", o.id)
        .order("revision", { ascending: false })
    : { data: [], error: null };
  if (historyError) throw new Error(historyError.message);
  const choices = eligible(ctx, o);
  const role = ctx.roles.find((r) => r.id === o.role_id);
  const hm = accountForPerson(
    ctx.people.find((p) => p.id === role?.supervisor_person_id),
    choices.hiring_manager,
  );
  return {
    offer: present(ctx, o),
    history: (history ?? []) as unknown as OfferEvent[],
    choices: permitted ? choices : { hiring_manager: [], lab_director: [], hrd: [] },
    defaults: permitted
      ? {
          hiring_manager_user_id: hm?.id ?? "",
          lab_director_user_id:
            choices.lab_director.length === 1 ? (choices.lab_director[0]?.id ?? "") : "",
          hrd_user_id: choices.hrd.length === 1 ? (choices.hrd[0]?.id ?? "") : "",
        }
      : { hiring_manager_user_id: "", lab_director_user_id: "", hrd_user_id: "" },
    supervisors: permitted
      ? ctx.people
          .filter((p) => inLab(p.org_node_id, o.lab_id, ctx.nodes))
          .map((p) => ({ id: p.id, name: p.name }))
      : [],
  };
}
async function callMutation(
  db: Awaited<ReturnType<typeof admin>>,
  actor: AppUser,
  candidateId: string,
  revision: number,
  command: string,
  payload: unknown,
  note: string,
) {
  const { data, error } = await db.rpc("mutate_offer_request", {
    p_actor: actor.id,
    p_candidate: candidateId,
    p_expected: revision,
    p_command: command,
    p_payload: payload as never,
    p_note: note,
  });
  if (error) throw new Error(error.message);
  return data as string;
}
export async function startOfferServer(data: { candidate_id: string }) {
  const ctx = await context();
  const { data: existing, error: exError } = await ctx.db
    .from("offer_requests")
    .select("*")
    .eq("candidate_id", data.candidate_id)
    .maybeSingle();
  if (exError) throw new Error(exError.message);
  if (existing && existing.state !== "withdrawn") {
    if (!visible(ctx, existing as unknown as RawOffer)) throw new Error("Offer unavailable");
    return { id: existing.id };
  }
  const admin = ctx.user.role === "owner" || ctx.user.role === "hr_director";
  if (!admin && ctx.user.role !== "recruiter")
    throw new Error("Only the assigned recruiter can start an offer");
  const { data: c, error } = await ctx.db
    .from("candidates")
    .select("id,name,role_id,contract_type")
    .eq("id", data.candidate_id)
    .maybeSingle();
  if (error || !c) throw new Error("Candidate unavailable");
  const role = ctx.roles.find((r) => r.id === c.role_id);
  if (!role || role.archived || role.approval_status === "pending")
    throw new Error("Position unavailable or awaiting approval");
  if (
    !admin &&
    accountForPerson(
      ctx.people.find((p) => p.id === role.recruiter_person_id),
      ctx.accounts,
    )?.id !== ctx.user.id
  )
    throw new Error("Only the position recruiter can start an offer");
  const terms = {
    ...emptyOfferTerms,
    candidate_name: c.name,
    job_title: role.job_title ?? role.title,
    job_level: String(role.level_min),
    supervisor_id: role.supervisor_person_id ?? "",
    contract_type:
      c.contract_type ??
      (role.contract_type === "intern"
        ? "Intern"
        : role.contract_type === "leased"
          ? "Leased via Connect 44"
          : "Employee"),
  };
  const id = await callMutation(ctx.db, ctx.user, c.id, 0, "create", { terms }, "");
  return { id };
}
export async function mutateOfferServer(data: {
  id: string;
  revision: number;
  command: "save" | "submit" | "approve" | "reject" | "sent" | "accepted" | "withdraw";
  terms?: OfferTerms | undefined;
  hiring_manager_user_id: string;
  lab_director_user_id: string;
  hrd_user_id: string;
  note: string;
}) {
  const ctx = await context();
  const { data: row, error } = await ctx.db
    .from("offer_requests")
    .select("*")
    .eq("id", data.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const o = row as unknown as RawOffer | null;
  if (!o || !visible(ctx, o)) throw new Error("Offer unavailable");
  nextOfferState(o.state, data.command);
  if (["approve", "reject"].includes(data.command)) {
    if (!canDecideOffer(ctx.user, o)) throw new Error("Only the current named approver can decide");
    if (data.command === "reject" && !data.note) throw new Error("Enter a rejection reason");
  } else if (!canEditOffer(ctx.user, o))
    throw new Error("Only the assigned recruiter can edit this offer");
  if (["save", "submit"].includes(data.command)) {
    if (!data.terms) throw new Error("Offer terms are required");
    validateOfferTerms(data.terms, data.command === "submit");
    if (
      data.terms.supervisor_id &&
      !ctx.people.some(
        (p) => p.id === data.terms?.supervisor_id && inLab(p.org_node_id, o.lab_id, ctx.nodes),
      )
    )
      throw new Error("Supervisor must belong to this Lab");
    const choices = eligible(ctx, o);
    for (const [id, group] of [
      [data.hiring_manager_user_id, choices.hiring_manager],
      [data.lab_director_user_id, choices.lab_director],
      [data.hrd_user_id, choices.hrd],
    ] as const) {
      if (id && !group.some((u) => u.id === id))
        throw new Error("Choose an eligible approver for this Lab");
      if (data.command === "submit" && !id) throw new Error("Choose all three approvers");
    }
  }
  const id = await callMutation(
    ctx.db,
    ctx.user,
    o.candidate_id,
    data.revision,
    data.command,
    {
      terms: data.terms,
      hiring_manager_user_id: data.hiring_manager_user_id,
      lab_director_user_id: data.lab_director_user_id,
      hrd_user_id: data.hrd_user_id,
    },
    data.note,
  );
  return { id };
}
