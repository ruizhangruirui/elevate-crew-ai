import { createFileRoute } from "@tanstack/react-router";

import { buildEmployees, respondPresence } from "@/lib/presence-api.server";

export const Route = createFileRoute("/api/integrations/presence/employees")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        respondPresence(request, "employees", (rows) => buildEmployees(rows.people, rows.nodes)),
    },
  },
});
