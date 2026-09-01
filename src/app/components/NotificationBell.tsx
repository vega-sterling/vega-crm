"use client";

// ============================================================================
// File: src/app/components/NotificationBell.tsx
// Description: Header notification bell with badge count and dropdown panel.
//              Polls /api/notifications every 60 seconds for unread count.
//              Click to expand, shows recent notifications, mark all read.
// ============================================================================

import { useEffect, useState, useRef } from "react";
import { apiFetch } from "../lib/api";
import { IconBell } from "./Icons";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  entityId?: string | null;
  entityType?: string | null;
  isRead: boolean;
  createdAt: string;
}

const TYPE_ICONS: Record<string, string> = {
  TASK_OVERDUE: "⚠️",
  DEAL_STAGE_CHANGE: "💠",
  EMAIL_RECEIVED: "✉️",
  BOOKING_CREATED: "📅",
  LEAD_CAPTURED: "🎯",
  QUOTE_ACCEPTED: "✅",
  QUOTE_REJECTED: "❌",
  TASK_DUE_SOON: "🕒",
  DEAL_CLOSE_OVERDUE: "🚨",
  DEAL_STALE: "💤",
};

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const res = await apiFetch<{ data: Notification[]; unreadCount: number }>(
        "/api/notifications?limit=20"
      );
      setNotifications(res.data || []);
      setUnreadCount(res.unreadCount || 0);
    } catch {
      // Silent fail — don't bother user with notification errors
    }
  };

  const triggerScan = async () => {
    try {
      await apiFetch("/api/notifications/check", { method: "POST" });
      fetchNotifications();
    } catch {
      // Silent
    }
  };

  useEffect(() => {
    fetchNotifications();
    triggerScan(); // Check for overdue tasks on load

    const interval = setInterval(() => {
      fetchNotifications();
    }, 60000); // 60 seconds

    // Every 5th poll cycle (~5 minutes) also re-run the reminder scan so
    // open browsers periodically trigger the server-side generators.
    const scanInterval = setInterval(() => {
      triggerScan();
    }, 300000); // 5 minutes

    return () => {
      clearInterval(interval);
      clearInterval(scanInterval);
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const markAllRead = async () => {
    try {
      await apiFetch("/api/notifications", { method: "PATCH", body: JSON.stringify({}) });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // Silent
    }
  };

  const markOneRead = async (id: string) => {
    try {
      await apiFetch("/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ id }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Silent
    }
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString();
  };

  const getLink = (n: Notification): string | null => {
    if (!n.entityId) return null;
    switch (n.entityType) {
      case "task":
        return `/tasks`;
      case "deal":
        return `/deals/${n.entityId}`;
      case "contact":
        return `/contacts/${n.entityId}`;
      case "email":
        return `/inbox`;
      case "booking":
        return `/calendar`;
      default:
        return null;
    }
  };

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        onClick={() => {
          setOpen(!open);
          if (!open && unreadCount > 0) {
            // Don't auto-mark read, let user see them
          }
        }}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          position: "relative",
          padding: "6px 10px",
          fontSize: "18px",
          color: "var(--fg)",
        }}
        aria-label="Notifications"
      >
        <IconBell size={20} strokeWidth={1.5} />
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: "2px",
              right: "2px",
              background: "var(--rust)",
              color: "white",
              fontSize: "10px",
              fontWeight: 700,
              borderRadius: "10px",
              padding: "2px 6px",
              minWidth: "18px",
              textAlign: "center",
              lineHeight: "14px",
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            width: "min(360px, calc(100vw - 24px))",
            maxWidth: "calc(100vw - 24px)",
            maxHeight: "480px",
            overflowY: "auto",
            backgroundColor: "var(--panel)",
            border: "1px solid var(--panel-border)",
            borderRadius: "12px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            zIndex: 1000,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "14px 16px",
              borderBottom: "1px solid var(--panel-border)",
              position: "sticky",
              top: 0,
              backgroundColor: "var(--panel)",
              zIndex: 1,
            }}
          >
            <span style={{ fontWeight: 700, fontSize: "14px" }}>
              Notifications {unreadCount > 0 && `(${unreadCount})`}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--gold)",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 600,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          {notifications.length === 0 ? (
            <div
              style={{
                padding: "40px 16px",
                textAlign: "center",
                color: "var(--fg-dim)",
                fontSize: "13px",
              }}
            >
              🔕 No notifications
            </div>
          ) : (
            notifications.map((n) => {
              const link = getLink(n);
              const icon = TYPE_ICONS[n.type] || "📌";

              const content = (
                <div
                  key={n.id}
                  style={{
                    display: "flex",
                    gap: "10px",
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--panel-border)",
                    cursor: link ? "pointer" : "default",
                    backgroundColor: n.isRead ? "transparent" : "rgba(201, 169, 110, 0.06)",
                    transition: "background 0.15s",
                  }}
                  onClick={() => {
                    if (!n.isRead) markOneRead(n.id);
                  }}
                >
                  <span style={{ fontSize: "18px", flexShrink: 0 }}>
                    {icon}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: n.isRead ? 400 : 600,
                        color: "var(--fg)",
                        marginBottom: "2px",
                      }}
                    >
                      {n.title}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--fg-dim)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {n.message}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--fg-dimmer)",
                        marginTop: "4px",
                      }}
                    >
                      {formatTime(n.createdAt)}
                    </div>
                  </div>
                  {!n.isRead && (
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        backgroundColor: "var(--gold)",
                        flexShrink: 0,
                        marginTop: "6px",
                      }}
                    />
                  )}
                </div>
              );

              return content;
            })
          )}

          {/* Footer */}
          {notifications.length > 0 && (
            <div
              style={{
                padding: "10px 16px",
                textAlign: "center",
                borderTop: "1px solid var(--panel-border)",
              }}
            >
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--fg-dim)",
                  cursor: "pointer",
                  fontSize: "12px",
                }}
              >
                Close
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}