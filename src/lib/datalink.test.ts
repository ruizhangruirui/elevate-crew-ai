import { describe, it } from "node:test";
import { strictEqual } from "node:assert/strict";
import { needsOfferApproval } from "./datalink";

describe("offer approval link", () => {
  it("shows for Offer", () => strictEqual(needsOfferApproval("offer"), true));
  it("hides once offer accepted", () => strictEqual(needsOfferApproval("offer_accepted"), false));
  it("hides for active candidates", () => strictEqual(needsOfferApproval("active"), false));
});
