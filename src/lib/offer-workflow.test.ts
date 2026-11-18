import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  nextOfferState,
  canEditOffer,
  canDecideOffer,
  fullOfferAccess,
  validateOfferTerms,
  emptyOfferTerms,
  normalizedCandidate,
  recruitingStageOptions,
} from "./offer-workflow";
const offer = {
  recruiter_user_id: "rec",
  hiring_manager_user_id: "hm",
  lab_director_user_id: "ld",
  hrd_user_id: "hrd",
  state: "hiring_manager",
};
describe("Offer approval rules", () => {
  it("approves Hiring Manager then Lab Director then HRD before sending", () => {
    assert.equal(nextOfferState("hiring_manager", "approve"), "lab_director");
    assert.equal(nextOfferState("lab_director", "approve"), "hrd");
    assert.equal(nextOfferState("hrd", "approve"), "approved");
  });
  it("blocks sending before all approvals", () =>
    assert.throws(() => nextOfferState("hrd", "sent")));
  it("acceptance requires offer sent", () => {
    assert.throws(() => nextOfferState("approved", "accepted"));
    assert.equal(nextOfferState("sent", "accepted"), "accepted");
  });
  it("offer stage can jump directly, except after onboarding or withdrawal", () => {
    assert.equal(nextOfferState("draft", "set_stage"), "draft");
    assert.equal(nextOfferState("accepted", "set_stage"), "accepted");
    assert.throws(() => nextOfferState("onboarded", "set_stage"));
  });
  it("offer approval can be withdrawn until it is accepted", () => {
    assert.equal(nextOfferState("hiring_manager", "withdraw"), "withdrawn");
    assert.equal(nextOfferState("sent", "withdraw"), "withdrawn");
    assert.throws(() => nextOfferState("accepted", "withdraw"));
  });
  it("revisions restart the entire approval round", () => {
    assert.equal(nextOfferState("approved", "save"), "draft");
    assert.equal(nextOfferState("sent", "submit"), "hiring_manager");
  });
  it("any current approver can reject", () => {
    for (const s of ["hiring_manager", "lab_director", "hrd"] as const)
      assert.equal(nextOfferState(s, "reject"), "rejected");
  });
  it("only assigned recruiter edits terms", () => {
    assert.equal(canEditOffer({ id: "rec", role: "recruiter" }, offer), true);
    for (const u of [
      { id: "other", role: "recruiter" },
      { id: "hm", role: "manager" },
      { id: "hr", role: "hr" },
    ])
      assert.equal(canEditOffer(u, offer), false);
  });
  it("only current approver can decide, no early HRD approval", () => {
    assert.equal(canDecideOffer({ id: "hm", role: "manager" }, offer), true);
    assert.equal(canDecideOffer({ id: "hrd", role: "hr_director" }, offer), false);
    assert.equal(canDecideOffer({ id: "hm", role: "hr" }, offer), false);
  });
  it("accepted offers cannot be revised", () => {
    assert.equal(
      canEditOffer({ id: "rec", role: "recruiter" }, { ...offer, state: "accepted" }),
      false,
    );
    assert.throws(() => nextOfferState("accepted", "save"));
  });
  it("salary visible to participants and in-scope HR, not other viewers", () => {
    assert.equal(fullOfferAccess({ id: "hr", role: "hr" }, offer, true), true);
    assert.equal(fullOfferAccess({ id: "hr", role: "hr" }, offer, false), false);
    assert.equal(fullOfferAccess({ id: "other", role: "recruiter" }, offer, true), false);
    assert.equal(fullOfferAccess({ id: "ld", role: "manager" }, offer, false), true);
  });
  it("adds required stages and removes generic Offer stage", () =>
    assert.deepEqual(recruitingStageOptions(["CV Screen", "Offer"]), [
      "CV Screen",
      "Offer approval",
      "Offer sent",
      "Offer accepted",
    ]));
  it("preserves legacy offered/accepted as stages rather than statuses", () => {
    assert.deepEqual(normalizedCandidate({ outcome: "offer", stage: "Offer" }), {
      outcome: "active",
      stage: "Offer sent",
    });
    assert.equal(
      normalizedCandidate({ outcome: "offer_accepted", stage: null }).stage,
      "Offer accepted",
    );
  });
  it("uses inclusive contract duration: Jan 1 to Dec 31 is 12 months", () => {
    validateOfferTerms(
      {
        ...emptyOfferTerms,
        candidate_name: "Example",
        contract_term: "fixed_term",
        start_date: "2026-01-01",
        end_date: "2026-12-31",
        duration_months: "12",
      },
      false,
    );
    assert.throws(() =>
      validateOfferTerms(
        {
          ...emptyOfferTerms,
          candidate_name: "Example",
          contract_term: "fixed_term",
          start_date: "2026-01-01",
          end_date: "2026-12-31",
          duration_months: "11",
        },
        false,
      ),
    );
  });
  it("rejects invalid dates and end before hire", () => {
    assert.throws(() =>
      validateOfferTerms(
        { ...emptyOfferTerms, candidate_name: "Example", start_date: "2026-02-30" },
        false,
      ),
    );
    assert.throws(() =>
      validateOfferTerms(
        {
          ...emptyOfferTerms,
          candidate_name: "Example",
          contract_term: "fixed_term",
          start_date: "2026-11-20",
          end_date: "2026-11-19",
        },
        false,
      ),
    );
  });
  it("open-ended contract has no end date", () =>
    assert.throws(() =>
      validateOfferTerms(
        { ...emptyOfferTerms, candidate_name: "Example", end_date: "2027-01-01" },
        false,
      ),
    ));
  it("requires complete terms for approval", () =>
    assert.throws(() =>
      validateOfferTerms({ ...emptyOfferTerms, candidate_name: "Example" }, true),
    ));
});
