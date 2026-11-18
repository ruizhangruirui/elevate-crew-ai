import { Pool } from "pg";
import assert from "node:assert/strict";
// Run only against an isolated database after applying repository migrations.
const url = process.env["OFFER_TEST_DATABASE_URL"];
if (!url) throw new Error("Set OFFER_TEST_DATABASE_URL to an isolated migrated database");
const pool = new Pool({ connectionString: url });
const db = await pool.connect();
let n = 0;
const check = (b: boolean) => {
  assert.ok(b);
  n++;
};
async function rejects(fn: () => Promise<unknown>) {
  await db.query("SAVEPOINT expected_failure");
  await assert.rejects(fn);
  await db.query("ROLLBACK TO SAVEPOINT expected_failure");
  n++;
}
try {
  await db.query("BEGIN");
  const org = (await db.query("select id from orgs limit 1")).rows[0].id;
  await db.query(
    "insert into org_nodes(id,name,type) values ('offer-test-lab','Test Lab','Lab'); insert into org_nodes(id,parent_id,name,type) values ('offer-test-team','offer-test-lab','Test Team','Team')",
  );
  const ids: Record<string, string> = {};
  for (const role of ["recruiter", "manager", "hr_director"]) {
    const roles =
      role === "manager" ? ["hm", "ld"] : role === "recruiter" ? ["rec", "other"] : ["hrd"];
    for (const label of roles) {
      ids[label] = (
        await db.query(
          "insert into app_users(email,name,role,password_hash,scope_node_ids) values ($1,$2,$3,'unused',$4) returning id",
          [label + "@offer-test.invalid", "Test " + label, role, ["offer-test-lab"]],
        )
      ).rows[0].id;
    }
  }
  const rp = (
    await db.query(
      "insert into people(org_id,name,company_email,org_node_id,is_leader) values ($1,'Test rec','rec@offer-test.invalid','offer-test-team',false) returning id",
      [org],
    )
  ).rows[0].id;
  const sup = (
    await db.query(
      "insert into people(org_id,name,company_email,org_node_id,is_leader) values ($1,'Test ld','ld@offer-test.invalid','offer-test-lab',true) returning id",
      [org],
    )
  ).rows[0].id;
  const direction = (await db.query("select id from directions limit 1")).rows[0].id;
  const role = (
    await db.query(
      "insert into roles(direction_id,title,org_node_id,recruiter_person_id,supervisor_person_id) values ($1,'Test position','offer-test-team',$2,$3) returning id",
      [direction, rp, sup],
    )
  ).rows[0].id;
  const candidate = (
    await db.query(
      "insert into candidates(role_id,name,email) values ($1,'Synthetic Candidate','candidate@offer-test.invalid') returning id",
      [role],
    )
  ).rows[0].id;
  let revision = 0;
  let offer = "";
  const terms = {
    candidate_name: "Synthetic Candidate",
    job_title: "Test Engineer",
    job_level: "5",
    salary_information: "60000 EUR/year",
    additional_salary: "1000 EUR/year",
    contract_term: "fixed_term",
    duration_months: "12",
    start_date: "2027-01-01",
    end_date: "2027-12-31",
    supervisor_id: sup,
    workload: "80",
    contract_type: "Employee",
    project_code: "TEST",
    technical_interviewer: "Technical",
    hr_interviewer: "HR",
    comprehensive_interviewer: "Panel",
  };
  const payload = {
    terms,
    hiring_manager_user_id: ids["hm"],
    lab_director_user_id: ids["ld"],
    hrd_user_id: ids["hrd"],
  };
  async function mutate(actor: string, command: string, note = "") {
    const result = await db.query("select mutate_offer_request($1,$2,$3,$4,$5::jsonb,$6) id", [
      ids[actor],
      candidate,
      revision,
      command,
      JSON.stringify(payload),
      note,
    ]);
    offer = result.rows[0].id;
    const row = (await db.query("select * from offer_requests where id=$1", [offer])).rows[0];
    revision = row.revision;
    await db.query("SELECT set_config('app.offer_workflow','no',true)");
    return row;
  }
  check((await mutate("rec", "create")).state === "draft");
  check((await mutate("rec", "submit")).state === "hiring_manager");
  await rejects(() => mutate("hrd", "approve"));
  await rejects(() => mutate("other", "save"));
  await rejects(() => mutate("rec", "sent"));
  await rejects(() =>
    db.query("update candidates set stage='Offer sent' where id=$1", [candidate]),
  );
  await rejects(() =>
    db.query("update offer_request_events set note='tampered' where offer_id=$1", [offer]),
  );
  check((await mutate("hm", "approve")).state === "lab_director");
  check((await mutate("ld", "reject", "Revise compensation")).state === "rejected");
  payload.terms.salary_information = "65000 EUR/year";
  check((await mutate("rec", "submit")).round === 2);
  check((await mutate("hm", "approve")).state === "lab_director");
  check((await mutate("ld", "approve")).state === "hrd");
  check((await mutate("hrd", "approve")).state === "approved");
  await rejects(() =>
    db.query("select mutate_offer_request($1,$2,$3,$4,$5::jsonb,$6)", [
      ids["rec"],
      candidate,
      revision - 1,
      "sent",
      JSON.stringify(payload),
      "",
    ]),
  );
  check((await mutate("rec", "sent")).state === "sent");
  check((await mutate("rec", "accepted")).state === "accepted");
  check(
    (await db.query("select outcome,onboarding_on::text from candidates where id=$1", [candidate]))
      .rows[0].onboarding_on === "2027-01-01",
  );
  check(
    (await db.query("select onboard_accepted_offer($1,'2026-12-31') result", [offer])).rows[0]
      .result === false,
  );
  check(
    (await db.query("select onboard_accepted_offer($1,'2027-01-01') result", [offer])).rows[0]
      .result === true,
  );
  check(
    (await db.query("select onboard_accepted_offer($1,'2027-01-01') result", [offer])).rows[0]
      .result === false,
  );
  const person = (
    await db.query(
      "select p.*,p.hire_date::text hire,p.contract_end_on::text ending from people p where approved_offer_id=$1",
      [offer],
    )
  ).rows[0];
  check(person.hire === "2027-01-01");
  check(person.ending === "2027-12-31");
  check(person.contract_duration_months === 12);
  check(person.workload_pct === 80);
  check(person.project_code === "TEST");
  check(person.supervisor_id === sup);
  const events = (
    await db.query("select * from offer_request_events where offer_id=$1 order by revision", [
      offer,
    ])
  ).rows;
  check(
    events.some(
      (e) =>
        e.changes.salary_information?.before === "60000 EUR/year" &&
        e.changes.salary_information?.after === "65000 EUR/year",
    ),
  );
  check(events.length === 11);
  console.log(
    `${n} SQL workflow checks passed; sequential approvals, rejection/revision, stale writes, immutable audit, inclusive duration and idempotent onboarding`,
  );
} finally {
  await db.query("ROLLBACK");
  db.release();
  await pool.end();
}
