"use client";

// ============================================================================
// File: src/app/inbox/page.tsx
// Description: Universal email inbox — HubSpot-style. Shows all emails
//              across all contacts/deals in one view. Filter by
//              direction, read/unread, tenant. Reply inline. Search.
// ============================================================================

import { useEffect, useState, useCallback } from "react";
import ProtectedLayout from "../components/ProtectedLayout";
import Spinner from "../components/Spinner";
import { apiFetch } from "../lib/api";
import { layout, panel, typeography, forms, buttons, statusBadge } from "../lib/styles";

interface EmailMessage {
  id: string;
  tenantId: string;
  direction: string;
  fromEmail: string;
  toEmails: string[];
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  isRead: boolean;
  isReplied: boolean;
  sentAt: string | null;
  receivedAt: string | null;
  contactId: string | null;
  contact?: { id: string; firstName: string; lastName: string; email: string } | null;
  dealId: string | null;
  deal?: { id: string; title: string } | null;
  threadId?: string | null;
}

type FilterType = "all" | "inbound" | "outbound" | "unread";

export default function InboxPage() {
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyStatus, setReplyStatus] = useState("");

  const loadEmails = useCallback(async () => {
    try {
      const data = await apiFetch<{ data: EmailMessage[] }>("/api/email/messages");
      setEmails(data.data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load emails");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmails();
  }, [loadEmails]);

  const filtered = emails.filter((e) => {
    if (filter === "inbound" && e.direction !== "inbound") return false;
    if (filter === "outbound" && e.direction !== "outbound") return false;
    if (filter === "unread" && e.isRead) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.subject.toLowerCase().includes(q) ||
        e.fromEmail.toLowerCase().includes(q) ||
        e.toEmails.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleSelectEmail = async (email: EmailMessage) => {
    setSelectedEmail(email);
    setReplyText("");
    setReplyStatus("");
    if (!email.isRead) {
      try {
        await apiFetch(`/api/email/messages/${email.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isRead: true }),
        });
        setEmails((prev) =>
          prev.map((e) => (e.id === email.id ? { ...e, isRead: true } : e))
        );
      } catch {
        // non-critical
      }
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmail || !replyText.trim()) return;
    setSending(true);
    setReplyStatus("");
    try {
      const replyTo = selectedEmail.direction === "inbound"
        ? selectedEmail.fromEmail
        : selectedEmail.toEmails[0];
      await apiFetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: [replyTo],
          subject: `Re: ${selectedEmail.subject}`,
          body: replyText,
          contactId: selectedEmail.contactId,
          dealId: selectedEmail.dealId,
          tenantId: selectedEmail.tenantId,
        }),
      });
      setReplyStatus("✓ Reply sent");
      setReplyText("");
      loadEmails();
    } catch (err: unknown) {
      setReplyStatus(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) {
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }
    if (days < 7) {
      return d.toLocaleDateString("en-US", { weekday: "short" });
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const unreadCount = emails.filter((e) => !e.isRead).length;

  if (loading) {
    return (
      <ProtectedLayout>
        <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
          <Spinner size={40} />
        </div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout>
      <div style={{ ...layout.page, maxWidth: 1200 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 4px" }}>Inbox</h1>
            <span style={{ color: "var(--fg-dim)", fontSize: 14 }}>
              {emails.length} emails{unreadCount > 0 && ` · ${unreadCount} unread`}
            </span>
          </div>
        </div>

        {error && (
          <div style={{
            backgroundColor: "rgba(239,68,68,0.12)",
            color: "var(--rust)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 8,
            padding: 12,
            marginBottom: 24,
            fontSize: 14,
          }}>
            {error}
          </div>
        )}

        {/* Filters + Search */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {(["all", "inbound", "outbound", "unread"] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  ...buttons.small,
                  backgroundColor: filter === f ? "var(--gold)" : "var(--panel-elevated)",
                  color: filter === f ? "var(--bg)" : "var(--fg)",
                  border: filter === f ? "none" : "1px solid var(--panel-border)",
                  textTransform: "capitalize" as const,
                }}
              >
                {f}
                {f === "unread" && unreadCount > 0 && ` (${unreadCount})`}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Search emails..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              ...forms.input,
              maxWidth: 300,
              flex: 1,
            }}
          />
        </div>

        {/* Two-pane layout: list + detail */}
        <div style={{ display: "flex", gap: 0, border: "1px solid var(--panel-border)", borderRadius: 12, overflow: "hidden", minHeight: 500 }}>
          {/* Email list */}
          <div style={{ width: selectedEmail ? "40%" : "100%", borderRight: selectedEmail ? "1px solid var(--panel-border)" : "none", overflow: "auto", maxHeight: "70vh" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--fg-dim)" }}>
                <p style={{ fontSize: 16, marginBottom: 8 }}>No emails</p>
                <p style={{ fontSize: 13 }}>
                  {emails.length === 0
                    ? "Emails will appear here once Google integration is connected and the sync cron is running."
                    : "No emails match the current filter."}
                </p>
              </div>
            ) : (
              filtered.map((email) => (
                <div
                  key={email.id}
                  onClick={() => handleSelectEmail(email)}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--panel-border)",
                    cursor: "pointer",
                    backgroundColor: selectedEmail?.id === email.id
                      ? "var(--panel-elevated)"
                      : !email.isRead
                        ? "rgba(201,169,110,0.06)"
                        : "transparent",
                    transition: "background 0.15s",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 2,
                      }}>
                        {!email.isRead && (
                          <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "var(--gold)", flexShrink: 0 }} />
                        )}
                        <span style={{
                          fontSize: 13,
                          fontWeight: email.isRead ? 400 : 600,
                          color: "var(--fg)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}>
                          {email.direction === "inbound" ? email.fromEmail : `To: ${email.toEmails[0]}`}
                        </span>
                      </div>
                      <div style={{
                        fontSize: 13,
                        fontWeight: email.isRead ? 400 : 600,
                        color: "var(--fg)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}>
                        {email.subject || "(no subject)"}
                      </div>
                      <div style={{
                        fontSize: 12,
                        color: "var(--fg-dim)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        marginTop: 2,
                      }}>
                        {email.bodyText?.substring(0, 80) || ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: "var(--fg-dim)" }}>
                        {formatDate(email.sentAt || email.receivedAt)}
                      </span>
                      <span style={{ ...statusBadge(email.direction === "inbound" ? "var(--emerald)" : "var(--blue)"), fontSize: 10, padding: "2px 6px" }}>
                        {email.direction === "inbound" ? "← In" : "→ Out"}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Email detail pane */}
          {selectedEmail && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", maxHeight: "70vh" }}>
              {/* Email header */}
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--panel-border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px", color: "var(--fg)" }}>
                      {selectedEmail.subject || "(no subject)"}
                    </h2>
                    <div style={{ fontSize: 13, color: "var(--fg-dim)", lineHeight: 1.6 }}>
                      <div><strong style={{ color: "var(--fg)" }}>From:</strong> {selectedEmail.fromEmail}</div>
                      <div><strong style={{ color: "var(--fg)" }}>To:</strong> {selectedEmail.toEmails.join(", ")}</div>
                      {selectedEmail.contact && (
                        <div style={{ marginTop: 4 }}>
                          <a href={`/contacts/${selectedEmail.contact.id}`} style={{ color: "var(--gold)", textDecoration: "none" }}>
                            → {selectedEmail.contact.firstName} {selectedEmail.contact.lastName}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedEmail(null)}
                    style={{
                      ...buttons.small,
                      flexShrink: 0,
                    }}
                  >
                    ✕ Close
                  </button>
                </div>
              </div>

              {/* Email body */}
              <div style={{ flex: 1, padding: "16px 20px", overflow: "auto", fontSize: 14, color: "var(--fg)", lineHeight: 1.6 }}>
                {selectedEmail.bodyHtml ? (
                  <div dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }} />
                ) : (
                  <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>
                    {selectedEmail.bodyText || "(empty body)"}
                  </pre>
                )}
              </div>

              {/* Reply box */}
              <div style={{ padding: "16px 20px", borderTop: "1px solid var(--panel-border)" }}>
                <form onSubmit={handleReply}>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type a reply..."
                    style={{
                      ...forms.textarea,
                      minHeight: 80,
                      marginBottom: 8,
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    {replyStatus && (
                      <span style={{
                        fontSize: 12,
                        color: replyStatus.startsWith("✓") ? "var(--emerald)" : "var(--rust)",
                      }}>
                        {replyStatus}
                      </span>
                    )}
                    <button
                      type="submit"
                      disabled={sending || !replyText.trim()}
                      style={{
                        ...buttons.primary,
                        opacity: sending || !replyText.trim() ? 0.5 : 1,
                        cursor: sending || !replyText.trim() ? "not-allowed" : "pointer",
                      }}
                    >
                      {sending ? "Sending..." : "Send Reply"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedLayout>
  );
}