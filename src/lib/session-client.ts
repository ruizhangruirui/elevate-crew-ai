import { createMiddleware } from "@tanstack/react-start";

const KEY = "app-session-token";

export function getToken() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function setToken(t: string) {
  window.localStorage.setItem(KEY, t);
}
export function clearToken() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Attaches the signed-in session token to every server function call. */
export const attachAppSession = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const token = getToken();
  return next({ headers: token ? { "x-app-session": token } : {} });
});
