'use client'

// ============================================================================
// MentionsInput — Textarea with @mention dropdown.
// Typing @ triggers a user dropdown. Selecting a user inserts @UserName.
// ============================================================================

import { useState, useRef, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { forms } from '../lib/styles'
import type { User } from '../lib/types'

interface MentionsInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeight?: number
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onFocus?: () => void
  onBlur?: () => void
  autoFocus?: boolean
  className?: string
  users?: User[]  // Pre-loaded users to avoid fetching
}

export default function MentionsInput({
  value, onChange, placeholder = 'Write a note…',
  minHeight = 56, onKeyDown, onFocus, onBlur, autoFocus, className, users: preloadedUsers,
}: MentionsInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [users, setUsers] = useState<User[]>(preloadedUsers || [])
  const [mentionSearch, setMentionSearch] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState<number>(-1)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [fetched, setFetched] = useState(false)

  // Fetch users if not preloaded
  useEffect(() => {
    if (preloadedUsers && preloadedUsers.length > 0) {
      setUsers(preloadedUsers)
      setFetched(true)
      return
    }
    if (fetched) return
    setFetched(true)
    apiFetch<{ data: User[] }>('/api/admin/users?limit=100')
      .then(res => setUsers(res.data || []))
      .catch(() => {})
  }, [preloadedUsers, fetched])

  // Filtered users based on @search
  const filteredUsers = mentionSearch !== null
    ? users.filter(u =>
        u.name.toLowerCase().includes(mentionSearch.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(mentionSearch.toLowerCase())
      ).slice(0, 6)
    : []

  const checkForMention = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    const cursorPos = textarea.selectionStart
    const textBeforeCursor = value.substring(0, cursorPos)
    // Find the last @ that's preceded by whitespace or start of string
    const atMatch = textBeforeCursor.match(/(?:^|\s)@([\w]*)$/)
    if (atMatch) {
      const searchStart = textBeforeCursor.lastIndexOf('@')
      setMentionStart(searchStart)
      setMentionSearch(atMatch[1])
      setMentionIndex(0)
    } else {
      setMentionSearch(null)
      setMentionStart(-1)
    }
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
    // Check for mention after state update
    setTimeout(checkForMention, 0)
  }

  const handleSelectionChange = () => {
    setTimeout(checkForMention, 0)
  }

  const insertMention = (user: User) => {
    const before = value.substring(0, mentionStart)
    const after = value.substring(textareaRef.current?.selectionStart || value.length)
    const newText = `${before}@${user.name} ${after}`
    onChange(newText)
    setMentionSearch(null)
    setMentionStart(-1)
    // Refocus and place cursor after the mention
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = before.length + user.name.length + 2 // @name + space
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(newPos, newPos)
      }
    }, 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // If mention dropdown is open, handle navigation
    if (mentionSearch !== null && filteredUsers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((prev) => (prev + 1) % filteredUsers.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex((prev) => (prev - 1 + filteredUsers.length) % filteredUsers.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(filteredUsers[mentionIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionSearch(null)
        setMentionStart(-1)
        return
      }
    }
    // Fall through to external handler
    onKeyDown?.(e)
  }

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={textareaRef}
        className={className || 'note-composer-input'}
        style={{
          ...forms.textarea,
          minHeight,
          fontSize: 16,
          resize: 'vertical' as const,
          width: '100%',
        }}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={handleSelectionChange}
        onClick={handleSelectionChange}
        onFocus={onFocus}
        onBlur={onBlur}
        autoFocus={autoFocus}
      />
      {/* Mention dropdown */}
      {mentionSearch !== null && filteredUsers.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 4,
            backgroundColor: 'var(--panel-elevated)',
            border: '1px solid var(--panel-border-hot)',
            borderRadius: 8,
            boxShadow: '0 -4px 12px rgba(0,0,0,0.3)',
            zIndex: 50,
            minWidth: 200,
            maxHeight: 240,
            overflowY: 'auto',
          }}
        >
          {filteredUsers.map((u, i) => (
            <button
              key={u.id}
              onClick={() => insertMention(u)}
              onMouseEnter={() => setMentionIndex(i)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                background: i === mentionIndex ? 'var(--bg-soft)' : 'transparent',
                border: 'none',
                color: 'var(--fg)',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 14,
              }}
            >
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                backgroundColor: 'var(--gold)22', color: 'var(--gold)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 600, flexShrink: 0,
              }}>
                {u.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{u.name}</span>
                {u.email && <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{u.email}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
