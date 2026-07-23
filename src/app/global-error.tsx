"use client";

// ============================================================================
// File: src/app/global-error.tsx
// Description: Global error handler that catches errors outside the root
//              layout's error boundary. Must include its own <html><body>.
// ============================================================================

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" style={{ backgroundColor: "#0a0b0f", color: "#e8e8ec" }}>
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 500, backgroundColor: "#1a1d26", border: "1px solid #2a2e3a", borderRadius: 16, padding: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: "#e57373" }}>
            Something went wrong
          </h2>
          <p style={{ color: "#8b8d98", fontSize: 14, marginBottom: 16 }}>
            {error?.message || "An unexpected error occurred"}
          </p>
          {error?.stack && (
            <pre style={{ fontSize: 11, color: "#8b8d98", backgroundColor: "#0a0b0f", padding: 12, borderRadius: 8, overflow: "auto", maxHeight: 200, marginBottom: 16, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {error.stack.substring(0, 500)}
            </pre>
          )}
          <button
            onClick={reset}
            style={{
              backgroundColor: "#c9a96e",
              color: "#0a0b0f",
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
      </body>
    </html>
  );
}