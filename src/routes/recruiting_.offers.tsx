import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { OfferApprovalBoard } from "@/components/OfferApprovalBoard";
export const Route = createFileRoute("/recruiting_/offers")({
  validateSearch: z.object({ offer: z.string().uuid().optional() }),
  head: () => ({
    meta: [
      { title: "Offer Approvals · Talent Management" },
      {
        name: "description",
        content: "Track confidential offer terms, sequential hiring approvals and onboarding.",
      },
      { property: "og:title", content: "Offer Approvals · Talent Management" },
      {
        property: "og:description",
        content: "Manage offer approval rounds and auditable hiring decisions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OfferPage,
});
function OfferPage() {
  const { offer } = Route.useSearch();
  const navigate = useNavigate({ from: "/recruiting/offers" });
  return (
    <AppShell title="Offer approval">
      <OfferApprovalBoard
        selectedId={offer}
        onSelect={(id) => navigate({ search: { offer: id } })}
      />
    </AppShell>
  );
}
