/** Datalink offer approval process (company tool). Stages are in process order. */
export const DATALINK_URL =
  "https://datalink-de.gtsdata.huawei.com/datalinkpro/web/#/form/formList?spaceId=Dlink_97046&appId=13280046&quickFormId=DDD283E74AC0496E866348EFBE201CB1&isView=true&currentMenu=5";

export const DATALINK_STAGES = [
  "initiated",
  "hiring_manager",
  "lab_director",
  "hrd",
  "offer_confirmation",
  "onboarding_confirmation",
  "completed",
] as const;
export type DatalinkStage = (typeof DATALINK_STAGES)[number];

export const isDatalinkStage = (v: unknown): v is DatalinkStage =>
  typeof v === "string" && (DATALINK_STAGES as readonly string[]).includes(v);

/** Datalink applies once the candidate has accepted the offer. */
export const needsDatalink = (outcome: string) => outcome === "offer" || outcome === "to_onboard";

/** 0-based index of the current stage, -1 when not started. */
export const datalinkStep = (stage: string | null | undefined) =>
  isDatalinkStage(stage) ? DATALINK_STAGES.indexOf(stage) : -1;
