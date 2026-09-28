import { Link, useNavigate } from "@tanstack/react-router";
import { LayoutGrid, Users, Settings, LogOut, Loader2, KeyRound, Network, FolderTree, ListChecks, TrendingUp } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { db as supabase } from "@/lib/db-client";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

const nav = [
  { to: "/", key: "nav.index", icon: LayoutGrid },
  { to: "/capability", key: "nav.capability", icon: Network },
  { to: "/org", key: "nav.org", icon: FolderTree },
  { to: "/people", key: "nav.people", icon: Users },
  { to: "/growth", key: "nav.growth", icon: TrendingUp },
  { to: "/actions", key: "nav.actions", icon: ListChecks },
  { to: "/settings", key: "nav.settings", icon: Settings },
] as const;

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { session, user, loading } = useAuth();
  const navigate = useNavigate();
  const { lang, setLang, t } = useI18n();
  const signOut = useSignOut();
  const [pwOpen, setPwOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-6 md:flex">
        <div className="flex items-center gap-3 px-2">
          <div
            className="grid size-9 place-items-center rounded-xl font-display text-sm font-bold text-primary-foreground"
            style={{ backgroundImage: "var(--gradient-brand)" }}
          >
            ST
          </div>
          <div className="leading-tight">
            <p className="font-display text-sm font-semibold">{t("shell.brand")}</p>
            <p className="text-xs text-muted-foreground">{t("shell.brandSub")}</p>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-1 rounded-lg border border-sidebar-border p-1">
          {(["zh", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`flex-1 rounded-md px-2 py-1 text-xs transition-colors ${
                lang === l
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {l === "zh" ? "中文" : "English"}
            </button>
          ))}
        </div>

        <nav className="mt-4 space-y-1">
          {nav.map(({ to, key, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{
                className:
                  "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-[inset_2px_0_0_0_var(--color-brand)]",
              }}
            >
              <Icon className="size-4" />
              {t(key)}
            </Link>
          ))}
        </nav>

        <div className="mt-auto space-y-2 border-t border-sidebar-border pt-4">
          <div className="px-3">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {user?.email} · {t(`access.role.${user?.role ?? "manager"}`)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={() => setPwOpen(true)}
          >
            <KeyRound className="size-4" />
            {t("pw.title")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={async () => {
              await signOut();
              navigate({ to: "/auth", replace: true });
            }}
          >
            <LogOut className="size-4" />
            {t("shell.signOut")}
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {user?.must_change_password && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warn/40 bg-warn/10 px-6 py-2 text-sm md:px-10">
            <span>{t("pw.initialBanner")}</span>
            <Button size="sm" variant="outline" onClick={() => setPwOpen(true)}>
              {t("pw.title")}
            </Button>
          </div>
        )}
        <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
        <header className="border-b border-border/60 px-6 py-8 md:px-10">
          <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
          {subtitle && (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          )}
        </header>
        <div className="px-6 py-8 md:px-10">{children}</div>
      </main>
    </div>
  );
}