import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { offerTermsSchema } from "./offer-workflow";
export const listOffers = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        query: z.string().max(200).default(""),
        state: z.string().default("all"),
        lab: z.string().default("all"),
        page: z.number().int().min(1).default(1),
        mine: z.boolean().default(false),
        archived: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { listOffersServer } = await import("./offer-workflow.server");
    return listOffersServer(data);
  });
export const getOffer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { getOfferServer } = await import("./offer-workflow.server");
    return getOfferServer(data);
  });
export const startOffer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ candidate_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { startOfferServer } = await import("./offer-workflow.server");
    return startOfferServer(data);
  });
export const mutateOffer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        revision: z.number().int(),
        command: z.enum([
          "save",
          "submit",
          "approve",
          "reject",
          "sent",
          "accepted",
          "withdraw",
          "set_stage",
        ]),
        stage: z.enum(["Offer approval", "Offer sent", "Offer accepted"]).optional(),
        terms: offerTermsSchema.optional(),
        hiring_manager_user_id: z.string().default(""),
        lab_director_user_id: z.string().default(""),
        hrd_user_id: z.string().default(""),
        note: z.string().trim().max(4000).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { mutateOfferServer } = await import("./offer-workflow.server");
    return mutateOfferServer(data);
  });
export const archiveOffer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), archived: z.boolean() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { archiveOfferServer } = await import("./offer-workflow.server");
    return archiveOfferServer(data);
  });
export const deleteOffer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { deleteOfferServer } = await import("./offer-workflow.server");
    return deleteOfferServer(data);
  });
export const datalinkOffer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), action: z.enum(["submit", "refresh"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { datalinkOfferServer } = await import("./offer-workflow.server");
    return datalinkOfferServer(data);
  });
export const datalinkEnabled = createServerFn({ method: "POST" }).handler(async () => {
  const { datalinkEnabledServer } = await import("./offer-workflow.server");
  return datalinkEnabledServer();
});
