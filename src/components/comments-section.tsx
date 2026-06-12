"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string };
}

interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "たった今";
  if (diffMin < 60) return `${diffMin}分前`;
  if (diffHour < 24) return `${diffHour}時間前`;
  if (diffDay < 7) return `${diffDay}日前`;
  return date.toLocaleDateString("ja-JP");
}

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-blue-500/20 text-blue-600",
  "bg-emerald-500/20 text-emerald-600",
  "bg-amber-500/20 text-amber-600",
  "bg-purple-500/20 text-purple-600",
  "bg-rose-500/20 text-rose-600",
  "bg-cyan-500/20 text-cyan-600",
];

function getAvatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * Renders comment text with @mentions highlighted.
 * Matches @username patterns (alphanumeric, underscore, hyphen, dot, and CJK characters).
 */
function renderCommentContent(text: string) {
  const splitRegex = /(@[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3400-\u4DBF.\-]+)/g;
  const testRegex = /^@[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3400-\u4DBF.\-]+$/;
  const parts = text.split(splitRegex);

  return parts.map((part, i) => {
    if (testRegex.test(part)) {
      return (
        <span
          key={i}
          className="text-primary font-medium bg-primary/10 rounded px-0.5"
        >
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/**
 * Given the textarea value and cursor position, finds the current @mention query.
 * Returns { query, startIndex } if the cursor is inside an @mention, or null otherwise.
 */
function getMentionQuery(
  text: string,
  cursorPos: number
): { query: string; startIndex: number } | null {
  // Look backwards from cursor for an @ that starts a mention
  const textBeforeCursor = text.slice(0, cursorPos);
  const atIndex = textBeforeCursor.lastIndexOf("@");
  if (atIndex === -1) return null;

  // The @ must be at position 0 or preceded by a whitespace/newline
  if (atIndex > 0 && !/\s/.test(textBeforeCursor[atIndex - 1])) return null;

  const query = textBeforeCursor.slice(atIndex + 1);

  // If there is a space in the query, the mention is "completed" -- no dropdown
  if (/\s/.test(query)) return null;

  return { query, startIndex: atIndex };
}

export function CommentsSection({ itemId }: { itemId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  // Mention dropdown state
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState(0);
  const [mentionDropdownPos, setMentionDropdownPos] = useState<{
    top: number;
    left: number;
  }>({ top: 0, left: 0 });
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/items/${itemId}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } catch (err) {
      console.error("Failed to fetch comments:", err);
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data);
      }
    } catch (err) {
      console.error("Failed to fetch current user:", err);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchComments();
    fetchCurrentUser();
    fetchUsers();
  }, [fetchComments, fetchCurrentUser, fetchUsers]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Compute the caret position in pixels using a mirror div
  const computeCaretPosition = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Create or reuse a mirror element to measure text position
    let mirror = mirrorRef.current;
    if (!mirror) {
      mirror = document.createElement("div");
      mirrorRef.current = mirror;
      document.body.appendChild(mirror);
    }

    const style = window.getComputedStyle(textarea);
    const properties = [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "lineHeight",
      "letterSpacing",
      "wordSpacing",
      "textIndent",
      "whiteSpace",
      "wordWrap",
      "overflowWrap",
      "padding",
      "border",
      "boxSizing",
    ] as const;

    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.overflow = "hidden";
    mirror.style.width = `${textarea.clientWidth}px`;

    for (const prop of properties) {
      mirror.style[prop] = style[prop];
    }
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordWrap = "break-word";

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = textarea.value.slice(0, cursorPos);

    // Insert text and a marker span
    mirror.innerHTML = "";
    const textNode = document.createTextNode(textBeforeCursor);
    const marker = document.createElement("span");
    marker.textContent = "\u200B"; // zero-width space
    mirror.appendChild(textNode);
    mirror.appendChild(marker);

    const textareaRect = textarea.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();

    // Position relative to the textarea's container
    // lineHeight が "normal" の場合 parseInt は NaN を返すので fallback を 20px に
    const lineHeightPx = (() => {
      const parsed = parseInt(style.lineHeight);
      if (Number.isFinite(parsed)) return parsed;
      const fontSize = parseInt(style.fontSize) || 14;
      return Math.round(fontSize * 1.5);
    })();
    const top =
      markerRect.top -
      textareaRect.top +
      textarea.offsetTop -
      textarea.scrollTop +
      lineHeightPx;
    const left =
      markerRect.left - textareaRect.left + textarea.offsetLeft;

    setMentionDropdownPos({ top, left: Math.min(left, textarea.clientWidth - 16) });
  }, []);

  // Clean up mirror on unmount
  useEffect(() => {
    return () => {
      if (mirrorRef.current && mirrorRef.current.parentNode) {
        mirrorRef.current.parentNode.removeChild(mirrorRef.current);
        mirrorRef.current = null;
      }
    };
  }, []);

  const filteredUsers = users.filter((user) =>
    user.name.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setContent(value);

    const cursorPos = e.target.selectionStart;
    const mention = getMentionQuery(value, cursorPos);

    if (mention) {
      setMentionQuery(mention.query);
      setMentionStartIndex(mention.startIndex);
      setShowMentionDropdown(true);
      setSelectedMentionIndex(0);
      // Compute position after state update
      requestAnimationFrame(() => computeCaretPosition());
    } else {
      setShowMentionDropdown(false);
    }
  };

  const handleTextareaKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Re-evaluate mention on cursor movement (arrow keys, etc.)
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
      const textarea = e.currentTarget;
      const cursorPos = textarea.selectionStart;
      const mention = getMentionQuery(content, cursorPos);
      if (mention) {
        setMentionQuery(mention.query);
        setMentionStartIndex(mention.startIndex);
        setShowMentionDropdown(true);
        setSelectedMentionIndex(0);
        requestAnimationFrame(() => computeCaretPosition());
      } else {
        setShowMentionDropdown(false);
      }
    }
  };

  const insertMention = (user: User) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const before = content.slice(0, mentionStartIndex);
    const after = content.slice(textarea.selectionStart);
    const newContent = `${before}@${user.name} ${after}`;
    setContent(newContent);
    setShowMentionDropdown(false);

    // Set cursor position after the inserted mention
    const newCursorPos = mentionStartIndex + user.name.length + 2; // @name + space
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    });
  };

  const handleTextareaKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (!showMentionDropdown || filteredUsers.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedMentionIndex((prev) =>
        prev < filteredUsers.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedMentionIndex((prev) =>
        prev > 0 ? prev - 1 : filteredUsers.length - 1
      );
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(filteredUsers[selectedMentionIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowMentionDropdown(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setShowMentionDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !currentUser || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/items/${itemId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          userId: currentUser.id,
        }),
      });

      if (res.ok) {
        setContent("");
        setShowMentionDropdown(false);
        await fetchComments();
      } else {
        const text = await res.text().catch(() => "");
        setSubmitError(`コメントの投稿に失敗しました (HTTP ${res.status}${text ? `: ${text.slice(0, 100)}` : ""})`);
      }
    } catch (err) {
      console.error("Failed to post comment:", err);
      setSubmitError(`コメントの投稿に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"
            />
          </svg>
          <h3 className="text-sm font-medium">
            コメント
            {comments.length > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({comments.length})
              </span>
            )}
          </h3>
        </div>
      </div>

      {/* Comment list */}
      <div className="divide-y divide-border">
        {loading ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            読み込み中...
          </div>
        ) : comments.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            コメントはまだありません
          </div>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="px-4 py-2.5">
              <div className="flex gap-2.5">
                {/* Avatar */}
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 ${getAvatarColor(comment.user.id)}`}
                >
                  {getInitial(comment.user.name)}
                </div>

                <div className="flex-1 min-w-0">
                  {/* User info + time */}
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs font-medium truncate">
                      {comment.user.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {getRelativeTime(comment.createdAt)}
                    </span>
                  </div>

                  {/* Content with @mention highlighting */}
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                    {renderCommentContent(comment.content)}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Comment form */}
      {currentUser && (
        <div className="border-t border-border px-4 py-2.5">
          <form onSubmit={handleSubmit}>
            <div className="flex gap-2.5">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 ${getAvatarColor(currentUser.id)}`}
              >
                {getInitial(currentUser.name)}
              </div>
              <div className="flex-1 space-y-2">
                <div className="relative">
                  <Textarea
                    ref={textareaRef}
                    value={content}
                    onChange={handleTextareaChange}
                    onKeyDown={handleTextareaKeyDown}
                    onKeyUp={handleTextareaKeyUp}
                    placeholder="コメントを入力... @でメンションできます"
                    className="min-h-[52px] resize-none text-xs"
                  />

                  {/* Mention dropdown */}
                  {showMentionDropdown && filteredUsers.length > 0 && (
                    <div
                      ref={dropdownRef}
                      className="absolute z-50 w-56 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
                      style={{
                        top: `${mentionDropdownPos.top}px`,
                        left: `${mentionDropdownPos.left}px`,
                      }}
                    >
                      <div className="py-1">
                        {filteredUsers.map((user, index) => (
                          <button
                            key={user.id}
                            type="button"
                            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent ${
                              index === selectedMentionIndex
                                ? "bg-accent"
                                : ""
                            }`}
                            onMouseDown={(e) => {
                              e.preventDefault(); // Prevent textarea blur
                              insertMention(user);
                            }}
                            onMouseEnter={() =>
                              setSelectedMentionIndex(index)
                            }
                          >
                            <div
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold shrink-0 ${getAvatarColor(user.id)}`}
                            >
                              {getInitial(user.name)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">
                                {user.name}
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">
                                {user.email}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!content.trim() || submitting}
                  >
                    {submitting ? "送信中..." : "コメント"}
                  </Button>
                </div>
                {submitError && (
                  <p className="text-xs text-red-500 mt-2">{submitError}</p>
                )}
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
