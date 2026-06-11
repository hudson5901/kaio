"use client";

import { Fragment, useEffect, useState, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { Item, Notification } from "@/lib/db/schema";

interface Stats {
  total: number;
  available: number;
  listed: number;
  sold: number;
  draft: number;
  totalProfit: number;
  totalInvestment: number;
}

interface SchedulerState {
  active: boolean;
  intervalMinutes: number;
  lastRun: string | null;
  nextRun: string | null;
  isRunning: boolean;
}

function StatCard({
  label,
  value,
  sub,
  color = "text-foreground",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="group py-4 px-1">
      <div className="flex items-center gap-2.5 mb-1.5">
        <span className="text-muted-foreground/60">{icon}</span>
        <p className="text-[12px] text-muted-foreground font-medium">
          {label}
        </p>
      </div>
      <p className={`text-[28px] font-semibold tracking-tight leading-none ${color}`}>
        {value}
      </p>
      {sub && (
        <p className="text-[11px] text-muted-foreground/70 mt-1.5">{sub}</p>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    available: "bg-emerald-500",
    sold: "bg-red-400",
    deleted: "bg-zinc-500",
    draft: "bg-zinc-400",
    listed: "bg-blue-400",
    removed: "bg-zinc-500",
  };
  return (
    <span className={`inline-block w-[6px] h-[6px] rounded-full ${colors[status] || "bg-zinc-400"}`} />
  );
}

const statusLabels: Record<string, string> = {
  available: "在庫あり",
  sold: "売り切れ",
  deleted: "削除済み",
  draft: "下書き",
  listed: "出品中",
  removed: "取り下げ",
};

export default function Dashboard() {
  const [items, setItems] = useState<Item[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0, available: 0, listed: 0, sold: 0, draft: 0, totalProfit: 0, totalInvestment: 0,
  });
  const [syncing, setSyncing] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [scheduler, setScheduler] = useState<SchedulerState | null>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const fetchItems = useCallback(async () => {
    const res = await fetch("/api/items");
    const data: Item[] = await res.json();
    setItems(data);
    const listItems = data.filter((i) => i.decision === "list");
    setStats({
      total: listItems.length,
      available: listItems.filter((i) => i.mercariStatus === "available").length,
      listed: listItems.filter((i) => i.ebayStatus === "listed").length,
      sold: listItems.filter((i) => i.ebayStatus === "sold").length,
      draft: listItems.filter((i) => i.ebayStatus === "draft").length,
      totalProfit: listItems.reduce((sum, i) => sum + (i.estimatedProfitUsd || 0), 0),
      totalInvestment: listItems.reduce((sum, i) => sum + (i.mercariPrice || 0), 0),
    });
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=20");
      const data: Notification[] = await res.json();
      setNotifications(data);
    } catch { /* ignore */ }
  }, []);

  const fetchScheduler = useCallback(async () => {
    try {
      const res = await fetch("/api/scheduler");
      const data: SchedulerState = await res.json();
      setScheduler(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchItems();
    fetchNotifications();
    fetchScheduler();

    // 通知を30秒ごとにポーリング
    const pollInterval = setInterval(() => {
      fetchNotifications();
    }, 30000);
    return () => clearInterval(pollInterval);
  }, [fetchItems, fetchNotifications, fetchScheduler]);

  // 通知パネル外クリックで閉じる
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSync() {
    setSyncing(true);
    let totalChecked = 0, totalSold = 0, totalRemoved = 0;
    try {
      let hasMore = true;
      while (hasMore) {
        const res = await fetch("/api/sync", { method: "POST" });
        if (!res.ok) { alert("同期に失敗しました"); break; }
        const result = await res.json();
        totalChecked += result.checked;
        totalSold += result.soldOnMercari;
        totalRemoved += result.removedFromEbay;
        hasMore = result.hasMore;
      }
      alert(`同期完了: ${totalChecked}件チェック, ${totalSold}件売り切れ, ${totalRemoved}件eBay削除`);
      fetchItems();
      fetchNotifications();
    } catch { alert("同期に失敗しました"); }
    finally { setSyncing(false); }
  }

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    fetchNotifications();
  }

  async function toggleScheduler() {
    const action = scheduler?.active ? "stop" : "start";
    await fetch("/api/scheduler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, intervalMinutes: 60 }),
    });
    fetchScheduler();
  }

  async function runSyncNow() {
    setSyncing(true);
    try {
      await fetch("/api/scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_now" }),
      });
      // ポーリングで結果を反映するので少し待ってからfetch
      setTimeout(() => {
        fetchItems();
        fetchNotifications();
        fetchScheduler();
        setSyncing(false);
      }, 3000);
    } catch {
      setSyncing(false);
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length;
  const recentItems = items.slice(0, 8);

  const listItems = items.filter(i => i.decision === "list");
  const pipelineStages = [
    { label: "出品判定", count: listItems.length, color: "text-foreground" },
    { label: "画像処理待ち", count: listItems.filter(i => !i.processedImages).length, color: "text-amber-400" },
    { label: "出品待ち", count: listItems.filter(i => i.ebayStatus === "draft").length, color: "text-blue-400" },
    { label: "出品中", count: listItems.filter(i => i.ebayStatus === "listed").length, color: "text-emerald-400" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ダッシュボード</h1>
          <p className="text-[13px] text-muted-foreground mt-1">メルカリ仕入れ → eBay販売のパフォーマンス</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Notification Bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {/* Notification Panel */}
            {showNotifications && (
              <div className="absolute right-0 top-10 w-96 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <h3 className="text-[13px] font-semibold">通知</h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      すべて既読にする
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                      通知はありません
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`px-4 py-3 border-b border-border/50 last:border-0 hover:bg-accent/40 transition-colors ${
                          !n.read ? "bg-accent/20" : ""
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            n.type === "sold" ? "text-red-400" :
                            n.type === "deleted" ? "text-zinc-400" :
                            n.type === "error" ? "text-amber-400" :
                            "text-blue-400"
                          }`}>
                            {n.type === "sold" ? (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126Z" />
                              </svg>
                            ) : n.type === "deleted" ? (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium">{n.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                            <p className="text-[11px] text-muted-foreground/60 mt-1">
                              {new Date(n.createdAt).toLocaleString("ja-JP")}
                            </p>
                          </div>
                          {!n.read && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <Button
            onClick={handleSync}
            disabled={syncing}
            variant="outline"
            size="sm"
            className="gap-2 text-[13px] h-8"
          >
            {syncing ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                </svg>
                同期中...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                </svg>
                在庫同期
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Stats - clean horizontal layout with dividers */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-0 border-b border-border/60 pb-2">
        <StatCard
          label="総アイテム"
          value={String(stats.total)}
          sub={`${stats.draft}件 下書き`}
          icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" /></svg>}
        />
        <StatCard
          label="メルカリ在庫"
          value={String(stats.available)}
          color="text-emerald-400"
          sub="仕入れ可能"
          icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>}
        />
        <StatCard
          label="eBay出品中"
          value={String(stats.listed)}
          color="text-blue-400"
          sub={`${stats.sold}件 販売済み`}
          icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.264.26-2.467.732-3.558" /></svg>}
        />
        <StatCard
          label="推定利益"
          value={`$${stats.totalProfit.toFixed(0)}`}
          color="text-gradient-gold"
          sub={`投資額 ¥${stats.totalInvestment.toLocaleString()}`}
          icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>}
        />
      </div>

      {/* Pipeline - clean inline flow */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold">パイプライン</h2>
          <span className="text-[12px] text-muted-foreground">
            メルカリ → eBay
          </span>
        </div>
        <div className="flex items-center gap-0">
          {pipelineStages.map((stage, idx) => (
            <Fragment key={stage.label}>
              <div className="flex-1 text-center py-5 rounded-lg hover:bg-accent/40 transition-colors">
                <p className={`text-2xl font-semibold tracking-tight ${stage.color}`}>{stage.count}</p>
                <p className="text-[12px] text-muted-foreground mt-1">{stage.label}</p>
              </div>
              {idx < pipelineStages.length - 1 && (
                <div className="flex items-center justify-center px-1">
                  <svg className="w-4 h-4 text-border" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              )}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Auto Sync Scheduler */}
      <div className="flex items-center justify-between py-4 border-t border-border/40">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${scheduler?.active ? "bg-emerald-500" : "bg-zinc-400"}`} />
          <div>
            <p className="text-[13px] font-medium">自動在庫監視</p>
            <p className="text-[12px] text-muted-foreground">
              {scheduler?.active
                ? `${scheduler.intervalMinutes}分間隔で自動チェック中`
                : "停止中"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {scheduler?.lastRun && (
            <span className="text-[11px] text-muted-foreground">
              前回: {new Date(scheduler.lastRun).toLocaleTimeString("ja-JP")}
            </span>
          )}
          {scheduler?.nextRun && scheduler.active && (
            <span className="text-[11px] text-muted-foreground">
              次回: {new Date(scheduler.nextRun).toLocaleTimeString("ja-JP")}
            </span>
          )}
          <Button
            onClick={runSyncNow}
            disabled={syncing || scheduler?.isRunning}
            variant="outline"
            size="sm"
            className="gap-2 h-8 text-[13px]"
          >
            {syncing || scheduler?.isRunning ? (
              <>
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                </svg>
                監視中...
              </>
            ) : (
              "今すぐ監視"
            )}
          </Button>
          <Button
            onClick={toggleScheduler}
            variant={scheduler?.active ? "outline" : "default"}
            size="sm"
            className="gap-2 h-8 text-[13px]"
          >
            {scheduler?.active ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                停止
              </>
            ) : (
              "自動監視"
            )}
          </Button>
          {scheduler?.isRunning && (
            <div className="flex items-center gap-1.5 text-xs text-primary">
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
              </svg>
              同期中...
            </div>
          )}
        </div>
      </div>

      {/* Recent Items - Notion-like clean list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold">最近のアイテム</h2>
          <Link href="/items" className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">
            すべて見る →
          </Link>
        </div>

        {recentItems.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[14px] text-muted-foreground mb-1">アイテムがありません</p>
            <p className="text-[12px] text-muted-foreground/70 mb-5">スクレイピングでメルカリからデータを取得しましょう</p>
            <Link href="/scrape">
              <Button size="sm" className="gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                スクレイピング開始
              </Button>
            </Link>
          </div>
        ) : (
          <div className="border border-border/60 rounded-lg overflow-hidden">
            {recentItems.map((item, index) => {
              let images: string[] = []; try { images = item.mercariImages ? JSON.parse(item.mercariImages) : []; } catch { /* ignore */ }
              return (
                <Link
                  key={item.id}
                  href={`/items/${item.id}`}
                  className={`flex items-center gap-4 px-4 py-3 hover:bg-accent/50 active:bg-accent/70 transition-colors ${
                    index > 0 ? "border-t border-border/40" : ""
                  }`}
                >
                  {images[0] ? (
                    <img
                      src={images[0]}
                      alt=""
                      className="w-9 h-9 rounded object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded bg-accent flex-shrink-0 flex items-center justify-center text-muted-foreground/40">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate">{item.mercariTitle}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[12px] text-muted-foreground tabular-nums">
                        ¥{item.mercariPrice.toLocaleString()}
                      </span>
                      {item.ebayPriceUsd && (
                        <>
                          <span className="text-muted-foreground/30">→</span>
                          <span className="text-[12px] font-medium text-primary tabular-nums">${item.ebayPriceUsd}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <StatusDot status={item.mercariStatus} />
                      {statusLabels[item.mercariStatus]}
                    </span>
                    <span className="text-border mx-1">/</span>
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <StatusDot status={item.ebayStatus} />
                      {statusLabels[item.ebayStatus]}
                    </span>
                  </div>
                  <svg className="w-4 h-4 text-muted-foreground/30 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
