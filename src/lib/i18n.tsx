import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "zh" | "en";

const STORAGE_KEY = "app-lang";

import type { Dict } from "./i18n-types";
import { coreDict } from "./i18n-dicts/core";
import { indexDict } from "./i18n-dicts/index-page";
import { capabilityDict } from "./i18n-dicts/capability";
import { peopleDict } from "./i18n-dicts/people";
import { actionsDict } from "./i18n-dicts/actions";
import { settingsDict } from "./i18n-dicts/settings";
import { sheetsDict } from "./i18n-dicts/sheets";
import { personPageDict } from "./i18n-dicts/person-page";
import { lifecycleDict } from "./i18n-dicts/lifecycle";
import { growthDict } from "./i18n-dicts/growth";

export const dict: Dict = {
  ...coreDict,
  ...indexDict,
  ...capabilityDict,
  ...peopleDict,
  ...actionsDict,
  ...settingsDict,
  ...sheetsDict,
  ...personPageDict,
  ...lifecycleDict,
};

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string };

const LangContext = createContext<Ctx>({ lang: "zh", setLang: () => {}, t: (k) => dict[k]?.zh ?? k });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("zh");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (stored === "en" || stored === "zh") setLangState(stored);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const t = useCallback((key: string) => dict[key]?.[lang] ?? dict[key]?.zh ?? key, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useI18n() {
  return useContext(LangContext);
}
