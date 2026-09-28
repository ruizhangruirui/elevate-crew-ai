import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { login, needsSetup, setupOwner } from "@/lib/auth.functions";
import { setToken } from "@/lib/session-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "登录 · 战略岗位与人才管理系统" },
      { name: "description", content: "登录以查看研究方向、目标岗位架构与人才覆盖情况。" },
      { property: "og:title", content: "登录 · 战略岗位与人才管理系统" },
      { property: "og:description", content: "登录以查看研究方向、目标岗位架构与人才覆盖情况。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { session } = useAuth();
  const { t } = useI18n();
  const setup = useQuery({ queryKey: ["auth", "needs-setup"], queryFn: () => needsSetup() });
  const isSetup = setup.data === true;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) navigate({ to: "/", replace: true });
  }, [session, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = isSetup
        ? await setupOwner({ data: { name, email, password } })
        : await login({ data: { email, password } });
      setToken(res.token);
      qc.clear();
      await qc.invalidateQueries({ queryKey: ["auth"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.actionFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="panel w-full max-w-md p-8">
        <div
          className="grid size-11 place-items-center rounded-xl font-display text-sm font-bold text-primary-foreground"
          style={{ backgroundImage: "var(--gradient-brand)" }}
        >
          ST
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold">{t("auth.brandTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isSetup ? t("auth.setupHint") : t("auth.brandSubtitle")}
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          {isSetup && (
            <div className="space-y-2">
              <Label htmlFor="name">{t("access.name")}</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={isSetup ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy || setup.isLoading}>
            {isSetup ? t("auth.createOwner") : t("auth.signIn")}
          </Button>
        </form>
        {!isSetup && <p className="mt-5 text-center text-xs text-muted-foreground">{t("auth.askOwner")}</p>}
      </div>
    </div>
  );
}
