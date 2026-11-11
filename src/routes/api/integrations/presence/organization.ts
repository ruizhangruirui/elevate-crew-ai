import { createFileRoute } from "@tanstack/react-router";

import { buildOrganization, respondPresence } from "@/lib/presence-api.server";

export const Route = createFileRoute("/api/integrations/presence/organization")({
  server: {
    handlers: {
      GET: async ({ request }) => respondPresence(request, "organization", (rows) => buildOrganization(rows.nodes)),
    },
  },
});
