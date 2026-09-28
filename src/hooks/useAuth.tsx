import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getMe, logout } from "@/lib/auth.functions";
import { clearToken, getToken } from "@/lib/session-client";

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getMe>>>;

export function useAuth() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const q = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => (getToken() ? await getMe() : null),
    enabled: hydrated,
    staleTime: 60_000,
  });
  const user = (q.data ?? null) as CurrentUser | null;
  return {
    session: user,
    user,
    loading: !hydrated || q.isLoading,
    isOwner: user?.role === "owner",
    canManageStructure: user?.role === "owner" || user?.role === "hr",
  };
}

export function useSignOut() {
  const qc = useQueryClient();
  return async () => {
    try {
      await logout();
    } catch {
      /* ignore */
    }
    clearToken();
    await qc.cancelQueries();
    qc.clear();
  };
}
