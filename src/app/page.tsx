"use client";

// ============================================================================
// File: src/app/page.tsx
// Description: Root page — redirects to /dashboard (middleware handles auth
//              check and will redirect to /login if not authenticated).
// ============================================================================

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--bg)",
      }}
    >
      <div style={{ color: "var(--fg-dim)", fontSize: 14 }}>Loading...</div>
    </div>
  );
}