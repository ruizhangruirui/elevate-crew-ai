import { createFileRoute } from "@tanstack/react-router";

import { buildEmployees, buildOrganization, respondPresence } from "@/lib/presence-api.server";

/**
 * Incremental sync feed: people and org nodes changed since the `since`
 * cursor (ISO timestamp returned by a previous call). Archived employees and
 * nodes are included so consumers can mark them inactive. Hard deletes are
 * not tracked — re-sync a full snapshot periodically.
 */
export const Route = createFileRoute("/api/integrations/presence/changes")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        respondPresence(
          request,
          "changes",
          (rows) => [
            ...buildEmployees(rows.people, rows.nodes).map((e) => ({ kind: "employee" as const, ...e })),
            ...buildOrganization(rows.nodes).map((n) => ({ kind: "org_node" as const, ...n })),
          ],
          { incremental: true },
        ),
    },
  },
});
