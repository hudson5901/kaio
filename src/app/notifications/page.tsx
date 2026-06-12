"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import Link from "next/link";

interface Notification {
  id: string;
  type: "sold" | "deleted" | "price_change" | "new_items" | "error";
  title: string;
  message: string;
  itemId: string | null;
  read: boolean;
  createdAt: string;
}

const typeLabels: Record<string, { label: string; color: string; icon: string }> = {
  sold: { label: "売却", color: "text-emerald-500 bg-emerald-500/10", icon: "M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" },
  deleted: { label: "削除", color: "text-zinc-500 bg-zinc-500/10", icon: "m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" },
  price_change: { label: "価格変更", color: "text-amber-500 bg-amber-500/10", icon: "M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  new_items: { label: "新規取得", color: "text-blue-500 bg-blue-500/10", icon: "M12 4.5v15m7.5-7.5h-15" },
  error: { label: "エラー", color: "text-red-500 bg-red-500/10", icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" },
};

// 未知タイプ用 (red の "エラー" 扱いだと誤認するので灰色の汎用アイコン)
const UNKNOWN_META = { label: "通知", color: "text-zinc-500 bg-zinc-500/10", icon: "M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" };

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [confirmDeleteRead, setConfirmDeleteRead] = useState(false);

  useEffect(() => { fetchNotifications(); }, []);

  async function fetchNotifications() {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=100");
      if (res.ok) setNotifications(await res.json());
    } catch { /* network error */ }
    finally { setLoading(false); }
  }

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    fetchNotifications();
  }

  async function markRead(id: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  async function deleteRead() {
    await fetch("/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    fetchNotifications();
  }

  async function deleteOne(id: string) {
    await fetch("/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  const filtered = filter === "all" ? notifications : notifications.filter((n) => n.type === filter);
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">通知</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {unreadCount > 0 ? `${unreadCount}件の未読` : "全て既読"}
          </p>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" className="h-8 text-[12px]" onClick={markAllRead}>
              全て既読にする
            </Button>
          )}
          {notifications.some((n) => n.read) && (
            <Button variant="ghost" size="sm" className="h-8 text-[12px] text-muted-foreground" onClick={() => setConfirmDeleteRead(true)}>
              既読を削除
            </Button>
          )}
        </div>
      </div>

      {/* Type filter */}
      <div className="flex gap-1.5">
        {[
          { key: "all", label: "全て" },
          { key: "new_items", label: "新規取得" },
          { key: "sold", label: "売却" },
          { key: "deleted", label: "削除" },
          { key: "error", label: "エラー" },
          { key: "price_change", label: "価格変更" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
              filter === f.key
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-[13px] text-muted-foreground">読み込み中...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-[13px] text-muted-foreground">通知はありません</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((n) => {
            const meta = typeLabels[n.type] || UNKNOWN_META;
            return (
              <div
                key={n.id}
                className={`group flex items-start gap-3 rounded-lg px-4 py-3 transition-colors ${
                  n.read ? "opacity-60 hover:opacity-80" : "bg-accent/40"
                }`}
              >
                <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.color}`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={meta.icon} />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium">{n.title}</span>
                    {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
                  </div>
                  <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[11px] text-muted-foreground/50">
                      {new Date(n.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {n.itemId && (
                      <Link href={`/items/${n.itemId}?from=notifications`} className="text-[11px] text-primary hover:underline">
                        アイテムを見る
                      </Link>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!n.read && (
                    <button
                      onClick={() => markRead(n.id)}
                      className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      title="既読にする"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => deleteOne(n.id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors"
                    title="削除"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteRead}
        onOpenChange={setConfirmDeleteRead}
        title="既読の通知を削除"
        description="既読の通知を全て削除します。この操作は取り消せません。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={deleteRead}
      />
    </div>
  );
}
