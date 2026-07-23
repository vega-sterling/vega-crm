"use client";

// ============================================================================
// File: src/app/components/ThemeProvider.tsx
// Description: React context provider for theme (dark/light) and locale (i18n).
//              Persists user preferences to localStorage. Wraps the entire app
//              in the root layout. Provides useTheme() and useLocale() hooks.
// ============================================================================

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { type Locale, t as translate, LOCALES } from "@/lib/i18n";

type Theme = "dark" | "light";

interface AppContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
  locales: typeof LOCALES;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

/** App provider that manages theme and locale state with localStorage persistence. */
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [locale, setLocaleState] = useState<Locale>("en");

  // Load persisted preferences on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("vega-crm-theme") as Theme | null;
    const savedLocale = localStorage.getItem("vega-crm-locale") as Locale | null;
    if (savedTheme) setThemeState(savedTheme);
    if (savedLocale) setLocaleState(savedLocale);
  }, []);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("vega-crm-theme", theme);
  }, [theme]);

  // Persist locale
  useEffect(() => {
    localStorage.setItem("vega-crm-locale", locale);
  }, [locale]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggleTheme = useCallback(() => setThemeState((prev) => (prev === "dark" ? "light" : "dark")), []);
  const setLocale = useCallback((l: Locale) => setLocaleState(l), []);
  const t = useCallback((key: string) => translate(key, locale), [locale]);

  return (
    <AppContext.Provider value={{ theme, setTheme, toggleTheme, locale, setLocale, t, locales: LOCALES }}>
      {children}
    </AppContext.Provider>
  );
}

/** Hook to access theme and locale context. */
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}