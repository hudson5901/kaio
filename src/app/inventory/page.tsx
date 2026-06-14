"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import Image from "next/image";
import type { Item } from "@/lib/db/schema";

const ebayStatusLabels: Record<string, string> = {
  draft: "下書き",
  listed: "出品中",
  sold: "販売済み",
  removed: "取り下げ",
};

const ebayStatusColors: Record<string, string> = {
  draft: "bg-zinc-400",
  listed: "bg-blue-400",
  sold: "bg-emerald-500",
  removed: "bg-zinc-500",
};

type TabKey = "listed" | "draft" | "sold" | "all";
type SortKey = "default" | "watch_desc" | "hit_desc" | "price_desc";

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabKey>("listed");
  const [sort, setSort] = useState<SortKey>("default");
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [refreshingStats, setRefreshingStats] = useState(false);
  const [statsResult, setStatsResult] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);

  useEffect(() => { fetchItems(); }, []);
  // タブ復帰時に再取得
  useEffect(() => {
    function onVisible() { if (!document.hidden) fetchItems(); }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  async function fetchItems() {
    setLoading(true);
    try {
      const res = await fetch("/api/items");
      if (!res.ok) return;
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch { /* network error, leave items unchanged */ }
    finally { setLoading(false); }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await fetch("/api/sync", { method: "POST" });
      await fetchItems();
    } catch { /* ignore */ }
    finally { setSyncing(false); }
  }

  async function handleRefreshStats() {
    setRefreshingStats(true);
    setStatsResult(null);
    try {
      const res = await fetch("/api/ebay/refresh-stats", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setStatsResult(
          `eBay統計を更新: 成功 ${data.updated}件 / 失敗 ${data.failed}件 (全 ${data.total}件)`,
        );
        await fetchItems();
      } else {
        setStatsResult(`エラー: ${data.message || data.error}`);
      }
    } catch {
      setStatsResult("eBay統計の更新中にエラーが発生しました");
    } finally {
      setRefreshingStats(false);
    }
  }

  async function handleEbayImport() {
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch("/api/ebay/import", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setImportResult(data.message);
        await fetchItems();
      } else {
        setImportResult(`エラー: ${data.message || data.error}`);
      }
    } catch {
      setImportResult("インポート中にエラーが発生しました");
    } finally {
      setImporting(false);
    }
  }

  // Filter — タブカウントと一致させる
  const filtered = items
    .filter((item) => {
      const isDraft = item.ebayStatus === "draft" && item.mercariStatus === "available";
      if (tab === "listed" && item.ebayStatus !== "listed") return false;
      if (tab === "draft" && !isDraft) return false;
      if (tab === "sold" && item.ebayStatus !== "sold") return false;
      if (tab === "all" && item.ebayStatus !== "listed" && !isDraft && item.ebayStatus !== "sold") return false;
      if (search) {
        const q = search.toLowerCase();
        if (!item.mercariTitle.toLowerCase().includes(q) && !item.ebayTitle?.toLowerCase().includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const cmp = (x: number | null | undefined, y: number | null | undefined) =>
        (y ?? -1) - (x ?? -1);
      switch (sort) {
        case "watch_desc": return cmp(a.ebayWatchCount, b.ebayWatchCount);
        case "hit_desc": return cmp(a.ebayHitCount, b.ebayHitCount);
        case "price_desc": return cmp(a.ebayPriceUsd, b.ebayPriceUsd);
        default: return 0;
      }
    });

  // Stats — タブカウントと実フィルタ条件を一致させる (draft は「出品可能」なのでメルカリで在庫ありのみ)
  const isDraftListable = (i: typeof items[number]) => i.ebayStatus === "draft" && i.mercariStatus === "available";
  const listedCount = items.filter((i) => i.ebayStatus === "listed").length;
  const draftCount = items.filter(isDraftListable).length;
  const soldCount = items.filter((i) => i.ebayStatus === "sold").length;
  const totalListedValue = items
    .filter((i) => i.ebayStatus === "listed")
    .reduce((sum, i) => sum + (i.ebayPriceUsd || 0), 0);
  const listedItems = items.filter((i) => i.ebayStatus === "listed");
  const totalProfit = listedItems.reduce((sum, i) => sum + (i.estimatedProfitUsd ?? 0), 0);
  const pendingCalc = listedItems.filter((i) => i.estimatedProfitUsd == null).length;
  const totalWatch = listedItems.reduce((sum, i) => sum + (i.ebayWatchCount ?? 0), 0);
  const totalHit = listedItems.reduce((sum, i) => sum + (i.ebayHitCount ?? 0), 0);
  const lastStatsAt = listedItems
    .map((i) => i.ebayStatsUpdatedAt)
    .filter((s): s is string => !!s)
    .sort()
    .at(-1);

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "listed", label: "出品中", count: listedCount },
    { key: "draft", label: "出品可能", count: draftCount },
    { key: "sold", label: "販売済み", count: soldCount },
    { key: "all", label: "すべて", count: listedCount + draftCount + soldCount },
  ];

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] sm:text-xl font-bold tracking-tight">在庫管理</h1>
          <p className="text-xs text-muted-foreground mt-0.5">eBay出品状況の管理</p>
        </div>
        <div className="grid grid-cols-2 sm:flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleEbayImport}
            disabled={importing}
            className="gap-1.5 h-10 sm:h-8 text-[13px] sm:text-[12px]"
          >
            <svg className={`w-4 h-4 ${importing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            {importing ? "インポート中..." : "eBayインポート"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className="gap-1.5 h-10 sm:h-8 text-[13px] sm:text-[12px]"
          >
            <svg className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
            {syncing ? "同期中..." : "在庫同期"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshStats}
            disabled={refreshingStats}
            className="gap-1.5 h-10 sm:h-8 text-[13px] sm:text-[12px] col-span-2 sm:col-span-1"
            title="出品中の全アイテムについて eBay からウォッチ数/閲覧数を取得"
          >
            <svg className={`w-4 h-4 ${refreshingStats ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
            {refreshingStats ? "更新中..." : "eBay統計を更新"}
          </Button>
        </div>
      </div>

      {/* Stats Result */}
      {statsResult && (
        <div className="flex items-center justify-between rounded-xl bg-card border border-border p-3">
          <p className="text-sm text-muted-foreground">{statsResult}</p>
          <button
            onClick={() => setStatsResult(null)}
            className="text-muted-foreground hover:text-foreground ml-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Import Result */}
      {importResult && (
        <div className="flex items-center justify-between rounded-xl bg-card border border-border p-3">
          <p className="text-sm text-muted-foreground">{importResult}</p>
          <button
            onClick={() => setImportResult(null)}
            className="text-muted-foreground hover:text-foreground ml-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Stats: 2x3 on mobile, 6 col on desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 sm:gap-3">
        <div className="rounded-xl bg-card border border-border p-3">
          <p className="text-[11px] text-muted-foreground">出品中</p>
          <p className="text-[20px] sm:text-xl font-bold mt-0.5 tabular-nums">{listedCount}</p>
        </div>
        <div className="rounded-xl bg-card border border-border p-3">
          <p className="text-[11px] text-muted-foreground">出品額合計</p>
          <p className="text-[20px] sm:text-xl font-bold mt-0.5 text-primary tabular-nums">${totalListedValue.toFixed(0)}</p>
        </div>
        <div className="rounded-xl bg-card border border-border p-3">
          <p className="text-[11px] text-muted-foreground">想定利益合計</p>
          <p className={`text-[20px] sm:text-xl font-bold mt-0.5 tabular-nums ${totalProfit > 0 ? "text-emerald-400" : "text-red-400"}`}>
            ${totalProfit.toFixed(0)}
          </p>
          {pendingCalc > 0 && (
            <p className="text-[10px] text-amber-400 mt-0.5">⚠ {pendingCalc}件 未計算</p>
          )}
        </div>
        <div className="rounded-xl bg-card border border-border p-3">
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <span>👀</span>合計閲覧
          </p>
          <p className="text-[20px] sm:text-xl font-bold mt-0.5 tabular-nums">{totalHit.toLocaleString()}</p>
        </div>
        <div className="rounded-xl bg-card border border-border p-3">
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <span>⭐</span>合計ウォッチ
          </p>
          <p className="text-[20px] sm:text-xl font-bold mt-0.5 tabular-nums text-amber-400">{totalWatch.toLocaleString()}</p>
        </div>
        <div className="rounded-xl bg-card border border-border p-3">
          <p className="text-[11px] text-muted-foreground">販売済み</p>
          <p className="text-[20px] sm:text-xl font-bold mt-0.5 tabular-nums">{soldCount}</p>
        </div>
      </div>
      {lastStatsAt && (
        <p className="text-[11px] text-muted-foreground -mt-1">
          eBay統計最終取得: {new Date(lastStatsAt).toLocaleString("ja-JP")}
        </p>
      )}

      {/* Tabs (scroll horizontally on mobile) */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0 border-b border-border/60 sm:border-b-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 px-4 py-3 sm:py-1.5 text-[13px] sm:text-xs font-medium transition-colors whitespace-nowrap border-b-2 sm:border-b-0 sm:rounded-lg ${
              tab === t.key
                ? "border-primary text-foreground sm:bg-primary sm:text-primary-foreground sm:border-transparent"
                : "border-transparent text-muted-foreground sm:hover:bg-accent sm:hover:text-foreground"
            }`}
          >
            {t.label}
            <span className="ml-1.5 opacity-60 tabular-nums">{t.count}</span>
          </button>
        ))}
      </div>

      {/* Search + Sort */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <Input
            placeholder="商品名・出品者で検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            inputMode="search"
            enterKeyHint="search"
            className="pl-10 h-11 sm:h-9"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground tabular-nums pointer-events-none">{filtered.length}件</span>
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-11 sm:h-9 rounded-md border border-input bg-background px-3 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="default">並び替え: デフォルト</option>
          <option value="watch_desc">⭐ ウォッチ多い順</option>
          <option value="hit_desc">👀 閲覧多い順</option>
          <option value="price_desc">💰 価格高い順</option>
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <svg className="w-6 h-6 text-primary animate-spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
          </svg>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-muted-foreground/40 mb-3">
            <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground">
            {tab === "listed" ? "出品中のアイテムはありません" :
             tab === "draft" ? "出品可能なアイテムはありません" :
             tab === "sold" ? "販売済みのアイテムはありません" :
             "アイテムがありません"}
          </p>
        </div>
      ) : (
        <div className="rounded-xl bg-card border border-border overflow-hidden">
          <div className="divide-y divide-border">
            {filtered.map((item) => {
              let images: string[] = [];
              let processed: string[] = [];
              try { images = item.mercariImages ? JSON.parse(item.mercariImages) : []; } catch { /* */ }
              try { processed = item.processedImages ? JSON.parse(item.processedImages) : []; } catch { /* */ }
              const thumb = processed[0] || images[0];

              return (
                <Link
                  key={item.id}
                  href={`/items/${item.id}?from=inventory`}
                  className="flex items-start gap-3 px-3 sm:px-4 py-3 hover:bg-accent/50 active:bg-accent/40 transition-colors"
                >
                  {/* Thumbnail (bigger on mobile) */}
                  <div className="relative w-16 h-16 sm:w-12 sm:h-12 rounded-lg overflow-hidden flex-shrink-0 bg-black">
                    {thumb ? (
                      <Image src={thumb} alt="" fill sizes="64px" className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 mb-0.5">
                      <p className="text-[14px] sm:text-sm font-medium leading-snug line-clamp-2 sm:truncate sm:line-clamp-1">
                        {item.ebayTitle || item.mercariTitle}
                      </p>
                      <Badge variant="secondary" className="flex-shrink-0 gap-1 text-[10px]">
                        <span className={`w-1.5 h-1.5 rounded-full ${ebayStatusColors[item.ebayStatus]}`} />
                        {ebayStatusLabels[item.ebayStatus]}
                      </Badge>
                    </div>
                    <p className="text-[11px] sm:text-xs text-muted-foreground truncate">
                      {item.mercariTitle}
                      {item.mercariSeller && <span className="ml-2">/ {item.mercariSeller}</span>}
                    </p>
                    {/* MOBILE: 6 metrics in 3x2 compact grid under title */}
                    <div className="sm:hidden mt-2 grid grid-cols-3 gap-1.5 text-[11px] tabular-nums">
                      <div>
                        <div className="text-muted-foreground leading-tight">仕入</div>
                        <div className="leading-tight">¥{(item.mercariPrice ?? 0).toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground leading-tight">eBay</div>
                        <div className="text-primary font-medium leading-tight">{item.ebayPriceUsd ? `$${item.ebayPriceUsd.toFixed(0)}` : "-"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground leading-tight">利益</div>
                        <div className={`font-medium leading-tight ${
                          item.estimatedProfitUsd && item.estimatedProfitUsd > 0 ? "text-emerald-400" :
                          item.estimatedProfitUsd ? "text-red-400" : "text-muted-foreground"
                        }`}>{item.estimatedProfitUsd != null ? `$${item.estimatedProfitUsd.toFixed(0)}` : "-"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground leading-tight">👀 閲覧</div>
                        <div className="leading-tight">{item.ebayHitCount != null ? item.ebayHitCount.toLocaleString() : "-"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground leading-tight">⭐ ウォッチ</div>
                        <div className={`leading-tight ${(item.ebayWatchCount ?? 0) > 0 ? "text-amber-400 font-medium" : ""}`}>
                          {item.ebayWatchCount != null ? item.ebayWatchCount.toLocaleString() : "-"}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground leading-tight">送料</div>
                        <div className="leading-tight text-muted-foreground">{item.shippingCostUsd ? `$${item.shippingCostUsd.toFixed(0)}` : "-"}</div>
                      </div>
                    </div>
                  </div>

                  {/* DESKTOP: Prices */}
                  <div className="hidden sm:flex items-center gap-5 flex-shrink-0">
                    <div className="text-right w-14">
                      <p className="text-xs text-muted-foreground">👀 閲覧</p>
                      <p className="text-sm tabular-nums">{item.ebayHitCount != null ? item.ebayHitCount.toLocaleString() : "-"}</p>
                    </div>
                    <div className="text-right w-14">
                      <p className="text-xs text-muted-foreground">⭐ ウォッチ</p>
                      <p className={`text-sm tabular-nums ${(item.ebayWatchCount ?? 0) > 0 ? "text-amber-400 font-semibold" : ""}`}>
                        {item.ebayWatchCount != null ? item.ebayWatchCount.toLocaleString() : "-"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">仕入れ</p>
                      <p className="text-sm tabular-nums">¥{(item.mercariPrice ?? 0).toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">eBay</p>
                      <p className="text-sm font-semibold text-primary tabular-nums">
                        {item.ebayPriceUsd ? `$${item.ebayPriceUsd.toFixed(0)}` : "-"}
                      </p>
                    </div>
                    <div className="text-right w-16">
                      <p className="text-xs text-muted-foreground">利益</p>
                      <p className={`text-sm font-bold tabular-nums ${
                        item.estimatedProfitUsd && item.estimatedProfitUsd > 0 ? "text-emerald-400" :
                        item.estimatedProfitUsd ? "text-red-400" : "text-muted-foreground"
                      }`}>
                        {item.estimatedProfitUsd != null ? `$${item.estimatedProfitUsd.toFixed(0)}` : "-"}
                      </p>
                    </div>

                    {/* Arrow */}
                    <svg className="w-4 h-4 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
