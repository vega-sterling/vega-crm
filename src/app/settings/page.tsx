"use client";

// ============================================================================
// File: src/app/settings/page.tsx
// Description: User settings page — theme switching (dark/light) and language
//              selection (i18n). Uses the AppProvider context.
// ============================================================================

import { useApp } from "@/app/components/ThemeProvider";
import { layout, panel, typeography, forms, buttons } from "@/app/lib/styles";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const { theme, setTheme, locale, setLocale, t, locales } = useApp();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <div style={layout.page}>
      <h1 style={typeography.title}>{t("settings.title")}</h1>

      {/* Appearance Section */}
      <div style={{ ...panel.container, marginBottom: 24 }}>
        <div style={panel.header}>
          <h2 style={typeography.subtitle}>{t("settings.theme")}</h2>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
          <button
            onClick={() => setTheme("dark")}
            style={{
              ...buttons.secondary,
              borderColor: theme === "dark" ? "var(--gold)" : "var(--panel-border)",
              backgroundColor: theme === "dark" ? "var(--panel-elevated)" : "transparent",
            }}
          >
            🌙 {t("settings.dark_mode")}
          </button>
          <button
            onClick={() => setTheme("light")}
            style={{
              ...buttons.secondary,
              borderColor: theme === "light" ? "var(--gold)" : "var(--panel-border)",
              backgroundColor: theme === "light" ? "var(--panel-elevated)" : "transparent",
            }}
          >
            ☀️ {t("settings.light_mode")}
          </button>
        </div>
      </div>

      {/* Language Section */}
      <div style={{ ...panel.container, marginBottom: 24 }}>
        <div style={panel.header}>
          <h2 style={typeography.subtitle}>{t("settings.language")}</h2>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
          {locales.map((l) => (
            <button
              key={l.code}
              onClick={() => setLocale(l.code)}
              style={{
                ...buttons.secondary,
                borderColor: locale === l.code ? "var(--gold)" : "var(--panel-border)",
                backgroundColor: locale === l.code ? "var(--panel-elevated)" : "transparent",
                fontSize: 14,
              }}
            >
              {l.flag} {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Security Section */}
      <div style={{ ...panel.container, marginBottom: 24 }}>
        <div style={panel.header}>
          <h2 style={typeography.subtitle}>{t("settings.security")}</h2>
        </div>
        <p style={typeography.muted}>
          <a href="/setup-2fa" style={{ color: "var(--gold)" }}>
            {t("auth.2fa_setup_title")} →
          </a>
        </p>
      </div>

      {/* Account Section */}
      <div style={panel.container}>
        <div style={panel.header}>
          <h2 style={typeography.subtitle}>{t("settings.account")}</h2>
        </div>
        <p style={typeography.muted}>Manage your account preferences here.</p>
      </div>
    </div>
  );
}