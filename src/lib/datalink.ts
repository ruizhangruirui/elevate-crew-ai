/** Datalink: company tool where recruiters run the offer approval process. */
export const DATALINK_URL =
  "https://datalink-de.gtsdata.huawei.com/datalinkpro/web/#/form/formList?spaceId=Dlink_97046&appId=13280046&quickFormId=DDD283E74AC0496E866348EFBE201CB1&isView=true&currentMenu=5";

/** The "Start offer approval" link is offered once the decision is to issue an offer. */
export const needsOfferApproval = (outcome: string) => outcome === "offer";
