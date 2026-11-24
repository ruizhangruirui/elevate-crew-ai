import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";

/** Sub-navigation shared by Recruiting and its Offer approval sub-page. */
export function RecruitingTabs({ active }: { active: "candidates" | "offers" | "talent" }) {
  const { lang } = useI18n();
  const { user } = useAuth();
  const l = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const isManager = user?.role === "manager";
  const tab = (on: boolean) =>
    `border-b-2 px-3 py-2 text-sm font-medium transition-colors ${on ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-foreground"}`;
  return (
    <nav className="mb-4 flex gap-1 border-b border-border/60" aria-label="Recruiting">
      {!isManager && <Link to="/recruiting" className={tab(active === "candidates")}>{l("岗位与候选人", "Positions & candidates")}</Link>}
      {!isManager && <Link to="/recruiting/offers" search={{}} className={tab(active === "offers")}>Offer approval</Link>}
      <Link to="/recruiting/talent" className={tab(active === "talent")}>{l("人才库", "Talent pool")}</Link>
    </nav>
  );
}
