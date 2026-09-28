import { createMiddleware } from "@tanstack/react-start";

/** Requires a signed-in app user; provides a server-side database client. */
export const requireAppAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { requireUser, admin } = await import("./auth.server");
  const user = await requireUser();
  const supabase = await admin();
  return next({ context: { supabase, userId: user.id, user } });
});
