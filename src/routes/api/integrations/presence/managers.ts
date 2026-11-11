import { createFileRoute } from "@tanstack/react-router";

import { buildManagers, respondPresence } from "@/lib/presence-api.server";

export const Route = createFileRoute("/api/integrations/presence/managers")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        respondPresence(request, "managers", (rows) =>
          buildManagers(rows.people, rows.nodes).map((m) => ({ ...m, updated_at: null })),
        ),
    },
  },
});
