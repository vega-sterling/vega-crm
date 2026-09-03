"use client";

// ============================================================================
// File: src/app/inbox/page.tsx
// Description: Universal inbox — HubSpot-style. Shows all emails AND SMS
//              across all contacts/deals in one unified, date-sorted view.
//              Filter by channel (All/Email/SMS), direction, read/unread.
//              Reply inline (email via Gmail, SMS via Twilio). Search.
//              Phase 17: Full responsive design — two-pane on desktop,
//              stack + back navigation on tablet/phone.
//              Phase 34: SMS channel merged into the same list and detail
//              pane. SMS has no isRead — it is treated as always-read and
//              is excluded from the 'unread' filter (the unread badge counts
//              emails only).
// ============================================================================

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import ProtectedLayout from "../components/ProtectedLayout";
import Spinner from "../components/Spinner";
import { apiFetch } from "../lib/api";
import { layout, forms, buttons, statusBadge } from "../lib/styles";

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

interface SmsMessage {
  id: string;
  tenantId: string;
  contactId: string | null;
  userId: string | null;
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  status: string; // PENDING | SENT | DELIVERED | FAILED
  externalId: string | null;
  fromNumber: string;
  toNumber: string;
  createdAt: string;
  contact?: { id: string; firstName: string; lastName: string; phone: string | null } | null;
}

/** One row in the unified inbox list. */
interface UnifiedItem {
  channel: "email" | "sms";
  email?: EmailMessage;
  sms?: SmsMessage;
  /** Sort timestamp — sentAt||receivedAt for email, createdAt for SMS. */
  date: string;
}

type FilterType = "all" | "inbound" | "outbound" | "unread";
type ChannelFilter = "all" | "email" | "sms";

/** Status chip color for an SMS status. */
function smsStatusColor(status: string): string {
  switch (status) {
    case "SENT":
    case "DELIVERED":
      return "var(--emerald)";
    case "FAILED":
      return "var(--rust)";
    default:
      return "var(--gold)"; // PENDING
  }
}

export default function InboxPage() {
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [smsMessages, setSmsMessages] = useState<SmsMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<UnifiedItem | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyStatus, setReplyStatus] = useState("");

  const loadMessages = useCallback(async () => {
    try {
      // Fetch both channels in parallel; either can fail without killing the other.
      const [emailRes, smsRes] = await Promise.allSettled([
        apiFetch<{ data: EmailMessage[] }>("/api/email/messages"),
        apiFetch<{ data: SmsMessage[] }>("/api/sms/messages"),
      ]);
      const errors: string[] = [];
      if (emailRes.status === "fulfilled") {
        setEmails(emailRes.value.data || []);
      } else {
        errors.push(emailRes.reason instanceof Error ? emailRes.reason.message : "Failed to load emails");
      }
      if (smsRes.status === "fulfilled") {
        setSmsMessages(smsRes.value.data || []);
      } else {
        errors.push(smsRes.reason instanceof Error ? smsRes.reason.message : "Failed to load SMS messages");
      }
      if (errors.length > 0) setError(errors[0]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Merge both channels into one list sorted by date (newest first).
  const unified: UnifiedItem[] = [
    ...emails.map((e): UnifiedItem => ({
      channel: "email",
      email: e,
      date: e.sentAt || e.receivedAt || "",
    })),
    ...smsMessages.map((s): UnifiedItem => ({
      channel: "sms",
      sms: s,
      date: s.createdAt,
    })),
  ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

  const filtered = unified.filter((item) => {
    // Channel filter
    if (channelFilter === "email" && item.channel !== "email") return false;
    if (channelFilter === "sms" && item.channel !== "sms") return false;
    // Direction / read filters (within the channel selection)
    if (item.channel === "sms" && item.sms) {
      const s = item.sms;
      if (filter === "inbound" && s.direction !== "INBOUND") return false;
      if (filter === "outbound" && s.direction !== "OUTBOUND") return false;
      if (filter === "unread") return false; // SMS is always-read: excluded from unread results
      if (search) {
        const q = search.toLowerCase();
        return (
          s.body.toLowerCase().includes(q) ||
          s.fromNumber.toLowerCase().includes(q) ||
          s.toNumber.toLowerCase().includes(q)
        );
      }
      return true;
    }
    const e = item.email!;
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

  const emailCount = emails.length;
  const smsCount = smsMessages.length;
  // Unread badge counts emails only — SMS has no isRead.
  const unreadCount = emails.filter((e) => !e.isRead).length;

  const handleSelect = async (item: UnifiedItem) => {
    setSelected(item);
    setReplyText("");
    setReplyStatus("");
    // Mark email as read (SMS is always-read — no-op).
    if (item.channel === "email" && item.email && !item.email.isRead) {
      const email = item.email;
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
    if (!selected || !replyText.trim()) return;
    setSending(true);
    setReplyStatus("");
    try {
      if (selected.channel === "sms" && selected.sms) {
        const sms = selected.sms;
        await apiFetch("/api/sms/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId: sms.tenantId,
            to: sms.direction === "INBOUND" ? sms.fromNumber : sms.toNumber,
            body: replyText,
            contactId: sms.contactId ?? undefined,
          }),
        });
      } else if (selected.email) {
        const email = selected.email;
        const replyTo = email.direction === "inbound"
          ? email.fromEmail
          : email.toEmails[0];
        await apiFetch("/api/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: [replyTo],
            subject: `Re: ${email.subject}`,
            body: replyText,
            contactId: email.contactId,
            dealId: email.dealId,
            tenantId: email.tenantId,
          }),
        });
      }
      setReplyStatus("✓ Reply sent");
      setReplyText("");
      loadMessages();
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
              {emailCount} emails · {smsCount} SMS{unreadCount > 0 && ` · ${unreadCount} unread`}
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

        {/* Channel filter (segmented control) + Filters + Search */}
        <div className="inbox-toolbar" style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
          <div className="inbox-channels" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {([
              ["all", `All ${unified.length}`],
              ["email", `Email ${emailCount}`],
              ["sms", `SMS ${smsCount}`],
            ] as [ChannelFilter, string][]).map(([c, label]) => (
              <button
                key={c}
                className="btn-touch"
                onClick={() => setChannelFilter(c)}
                style={{
                  ...buttons.small,
                  backgroundColor: channelFilter === c ? "var(--gold)" : "var(--panel-elevated)",
                  color: channelFilter === c ? "var(--bg)" : "var(--fg)",
                  border: channelFilter === c ? "none" : "1px solid var(--panel-border)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div className="inbox-filters" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {(["all", "inbound", "outbound", "unread"] as FilterType[]).map((f) => (
                <button
                  key={f}
                  className="btn-touch"
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
              className="form-input"
              placeholder="Search messages..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                ...forms.input,
                maxWidth: 300,
                flex: 1,
                minWidth: 0,
              }}
            />
          </div>
        </div>

        {/* Two-pane layout: list + detail */}
        <div className="inbox-container" style={{ display: "flex", gap: 0, border: "1px solid var(--panel-border)", borderRadius: 12, overflow: "hidden", minHeight: 500 }}>
          {/* Message list (email + SMS) */}
          <div
            className="inbox-list"
            style={{
              width: selected ? "40%" : "100%",
              borderRight: selected ? "1px solid var(--panel-border)" : "none",
              overflow: "auto",
              maxHeight: "70vh",
            }}
          >
            {filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--fg-dim)" }}>
                <p style={{ fontSize: 16, marginBottom: 8 }}>No messages</p>
                <p style={{ fontSize: 13 }}>
                  {unified.length === 0
                    ? "Emails will appear here once Google integration is connected and the sync cron is running. SMS messages appear once Twilio is configured."
                    : "No messages match the current filter."}
                </p>
              </div>
            ) : (
              filtered.map((item) => {
                if (item.channel === "sms" && item.sms) {
                  const sms = item.sms;
                  return (
                    <div
                      key={`sms-${sms.id}`}
                      onClick={() => handleSelect(item)}
                      style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid var(--panel-border)",
                        cursor: "pointer",
                        backgroundColor: selected?.channel === "sms" && selected.sms?.id === sms.id
                          ? "var(--panel-elevated)"
                          : "transparent",
                        transition: "background 0.15s",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, backgroundColor: "var(--gold)", color: "var(--bg)", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>
                              💬 SMS
                            </span>
                            <span style={{
                              fontSize: 13,
                              fontWeight: 400,
                              color: "var(--fg)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}>
                              {sms.direction === "INBOUND" ? sms.fromNumber : `To: ${sms.toNumber}`}
                            </span>
                          </div>
                          <div style={{
                            fontSize: 12,
                            color: "var(--fg-dim)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            marginTop: 2,
                          }}>
                            {sms.body.substring(0, 80)}
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                          <span style={{ fontSize: 11, color: "var(--fg-dim)" }}>
                            {formatDate(sms.createdAt)}
                          </span>
                          <span style={{ ...statusBadge(sms.direction === "INBOUND" ? "var(--emerald)" : "var(--blue)"), fontSize: 10, padding: "2px 6px" }}>
                            {sms.direction === "INBOUND" ? "← In" : "→ Out"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }
                const email = item.email!;
                return (
                  <div
                    key={email.id}
                    onClick={() => handleSelect(item)}
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid var(--panel-border)",
                      cursor: "pointer",
                      backgroundColor: selected?.channel === "email" && selected.email?.id === email.id
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
                );
              })
            )}
          </div>

          {/* Detail pane (email or SMS) */}
          {selected && (
            <div
              className="inbox-detail"
              style={{ flex: 1, display: "flex", flexDirection: "column", maxHeight: "70vh" }}
            >
              {selected.channel === "sms" && selected.sms ? (
                <>
                  {/* SMS header */}
                  <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--panel-border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px", color: "var(--fg)", display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, backgroundColor: "var(--gold)", color: "var(--bg)", borderRadius: 4, padding: "2px 6px" }}>💬 SMS</span>
                          <span style={{ ...statusBadge(smsStatusColor(selected.sms.status)), fontSize: 11, padding: "2px 8px" }}>
                            {selected.sms.status}
                          </span>
                        </h2>
                        <div style={{ fontSize: 13, color: "var(--fg-dim)", lineHeight: 1.6 }}>
                          <div><strong style={{ color: "var(--fg)" }}>From:</strong> {selected.sms.fromNumber}</div>
                          <div><strong style={{ color: "var(--fg)" }}>To:</strong> {selected.sms.toNumber}</div>
                          {selected.sms.contact && (
                            <div style={{ marginTop: 4 }}>
                              <Link href={`/contacts/${selected.sms.contact.id}`} style={{ color: "var(--gold)", textDecoration: "none" }}>
                                → {selected.sms.contact.firstName} {selected.sms.contact.lastName}
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                        <button
                          className="btn-touch inbox-back-btn"
                          onClick={() => setSelected(null)}
                          style={{
                            ...buttons.small,
                            display: "none", // shown only on mobile via CSS
                          }}
                        >
                          ← Back
                        </button>
                        <button
                          className="btn-touch"
                          onClick={() => setSelected(null)}
                          style={{
                            ...buttons.small,
                            flexShrink: 0,
                          }}
                        >
                          ✕ Close
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* SMS body */}
                  <div style={{ flex: 1, padding: "16px 20px", overflow: "auto", fontSize: 14, color: "var(--fg)", lineHeight: 1.6 }}>
                    <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>
                      {selected.sms.body || "(empty message)"}
                    </pre>
                  </div>
                </>
              ) : selected.email && (
                <>
                  {/* Email header */}
                  <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--panel-border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px", color: "var(--fg)" }}>
                          {selected.email.subject || "(no subject)"}
                        </h2>
                        <div style={{ fontSize: 13, color: "var(--fg-dim)", lineHeight: 1.6 }}>
                          <div><strong style={{ color: "var(--fg)" }}>From:</strong> {selected.email.fromEmail}</div>
                          <div><strong style={{ color: "var(--fg)" }}>To:</strong> {selected.email.toEmails.join(", ")}</div>
                          {selected.email.contact && (
                            <div style={{ marginTop: 4 }}>
                              <Link href={`/contacts/${selected.email.contact.id}`} style={{ color: "var(--gold)", textDecoration: "none" }}>
                                → {selected.email.contact.firstName} {selected.email.contact.lastName}
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                        <button
                          className="btn-touch inbox-back-btn"
                          onClick={() => setSelected(null)}
                          style={{
                            ...buttons.small,
                            display: "none", // shown only on mobile via CSS
                          }}
                        >
                          ← Back
                        </button>
                        <button
                          className="btn-touch"
                          onClick={() => setSelected(null)}
                          style={{
                            ...buttons.small,
                            flexShrink: 0,
                          }}
                        >
                          ✕ Close
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Email body */}
                  <div style={{ flex: 1, padding: "16px 20px", overflow: "auto", fontSize: 14, color: "var(--fg)", lineHeight: 1.6 }}>
                    {selected.email.bodyHtml ? (
                      <div dangerouslySetInnerHTML={{ __html: selected.email.bodyHtml }} />
                    ) : (
                      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>
                        {selected.email.bodyText || "(empty body)"}
                      </pre>
                    )}
                  </div>
                </>
              )}

              {/* Reply box (email reply or SMS reply) */}
              <div style={{ padding: "16px 20px", borderTop: "1px solid var(--panel-border)" }}>
                <form onSubmit={handleReply}>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={selected.channel === "sms" ? "Type an SMS reply..." : "Type a reply..."}
                    className="form-textarea"
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
                      className="btn-touch"
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