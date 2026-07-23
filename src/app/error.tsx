"use client";

// ============================================================================
// File: src/app/error.tsx
// Description: Global error boundary for Vega CRM. Catches client-side
//              exceptions and displays the actual error message instead of
//              the generic "Application error" screen.
// ============================================================================

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Vega CRM client error:", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--bg)",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 500,
          backgroundColor: "var(--panel)",
          border: "1px solid var(--panel-border)",
          borderRadius: 16,
          padding: 32,
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: "var(--rust)" }}>
          Something went wrong
        </h2>
        <p style={{ color: "var(--fg-dim)", fontSize: 14, marginBottom: 16 }}>
          {error?.message || "An unexpected error occurred"}
        </p>
        {error?.stack && (
          <pre
            style={{
              fontSize: 11,
              color: "var(--fg-dim)",
              backgroundColor: "var(--bg)",
              padding: 12,
              borderRadius: 8,
              overflow: "auto",
              maxHeight: 200,
              marginBottom: 16,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {error.stack.substring(0, 500)}
          </pre>
        )}
        <button
          onClick={reset}
          style={{
            backgroundColor: "var(--gold)",
            color: "var(--bg)",
            border: "none",
            borderRadius: 8,
            padding: "10px 16px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}