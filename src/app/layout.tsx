// ============================================================================
// File: src/app/layout.tsx
// Description: Root layout for Vega CRM. Wraps the entire app in AppProvider
//              for theme (dark/light) and locale (i18n) context.
// ============================================================================

import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "./components/ThemeProvider";

export const metadata: Metadata = {
  title: "Vega CRM",
  description: "Multi-tenant CRM — track phone calls, emails, and business intelligence",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ backgroundColor: "var(--bg)", color: "var(--fg)" }}>
      <body style={{ margin: 0, minHeight: "100vh" }}>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}