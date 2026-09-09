// ============================================================================
// File: src/app/layout.tsx
// Description: Root layout for Vega CRM. Wraps the entire app in AppProvider
//              for theme (dark/light) and locale (i18n) context.
// ============================================================================

import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "./components/ThemeProvider";
import { ToastProvider } from "./components/Toast";

export const metadata: Metadata = {
  title: "Vega CRM",
  description: "Multi-tenant CRM — track phone calls, emails, and business intelligence",
};

// Blocking pre-paint script: resolves the theme (localStorage → prefers-color-scheme → dark)
// and sets data-theme BEFORE first paint, eliminating the flash-of-unstyled-content.
const themeInitScript = "try { var t = localStorage.getItem('vega-crm-theme'); if (t !== 'light' && t !== 'dark') { t = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark'; } document.documentElement.setAttribute('data-theme', t); } catch (e) {}";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ color: "var(--fg)" }} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body style={{
        margin: 0,
        minHeight: "100vh",
        backgroundColor: "var(--bg)",
        backgroundImage: "var(--bg-gradient)",
        backgroundAttachment: "fixed",
      }}>
        <AppProvider>
          <ToastProvider>{children}</ToastProvider>
        </AppProvider>
      </body>
    </html>
  );
}