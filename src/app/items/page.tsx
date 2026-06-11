"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import Image from "next/image";
import type { Item } from "@/lib/db/schema";
import { checkShouldPass } from "@/lib/kabuto/pass-checker";
import { exportItemsToCSV } from "@/lib/csv-export";
import { Download } from "lucide-react";

const statusLabels: Record<string, string> = {
  available: "在庫あり",
  sold: "売り切れ",
  deleted: "削除済み",
  draft: "下書き",
  listed: "出品中",
  removed: "取り下げ",
};

const statusColors: Record<string, string> = {
  available: "bg-emerald-500",
  sold: "bg-red-400",
  deleted: "bg-zinc-500",
  draft: "bg-zinc-400",
  listed: "bg-blue-400",
  removed: "bg-zinc-500",
};

function StatusDot({ status }: { status: string }) {
  return <span className={`inline-block w-[6px] h-[6px] rounded-full ${statusColors[status] || "bg-zinc-400"}`} />;
}

type SortKey = "date" | "updated" | "price_asc" | "price_desc" | "profit_desc" | "profit_asc" | "ebay_price" | "ai_score" | "likes_desc";

const ITEMS_PER_PAGE = 30;

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [mercariFilter, setMercariFilter] = useState("all");
  const [ebayFilter, setEbayFilter] = useState("all");
  const [decisionFilter, setDecisionFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid" | "list">("list");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState<string | null>(null);

  useEffect(() => { fetchItems(); }, []);

  // 検索デバウンス
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(timer);
  }, [search]);

  // フィルタ変更時にページリセット
  useEffect(() => { setPage(1); }, [debouncedSearch, mercariFilter, ebayFilter, decisionFilter, sortKey]);

  const filtered = useMemo(() => {
    let result = items;

    // 検索
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (i) => i.mercariTitle.toLowerCase().includes(q) ||
          i.mercariDescription?.toLowerCase().includes(q) ||
          i.mercariId?.toLowerCase().includes(q)
      );
    }

    // フィルタ
    if (mercariFilter !== "all") result = result.filter((i) => i.mercariStatus === mercariFilter);
    if (ebayFilter !== "all") result = result.filter((i) => i.ebayStatus === ebayFilter);
    if (decisionFilter !== "all") {
      if (decisionFilter === "none") result = result.filter((i) => !i.decision);
      else if (decisionFilter === "auto_pass") result = result.filter((i) => !i.decision && checkShouldPass(i.mercariTitle, i.mercariDescription, i.mercariPrice).shouldPass);
      else result = result.filter((i) => i.decision === decisionFilter);
    }

    // ソート
    result = [...result].sort((a, b) => {
      switch (sortKey) {
        case "updated": return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case "price_asc": return (a.mercariPrice || 0) - (b.mercariPrice || 0);
        case "price_desc": return (b.mercariPrice || 0) - (a.mercariPrice || 0);
        case "profit_desc": return (b.estimatedProfitUsd || -999) - (a.estimatedProfitUsd || -999);
        case "profit_asc": return (a.estimatedProfitUsd || 999) - (b.estimatedProfitUsd || 999);
        case "ebay_price": return (b.ebayPriceUsd || 0) - (a.ebayPriceUsd || 0);
        case "ai_score": return (b.aiScore || -1) - (a.aiScore || -1);
        case "likes_desc": return (b.mercariLikes || 0) - (a.mercariLikes || 0);
        case "date":
        default: return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return result;
  }, [items, debouncedSearch, mercariFilter, ebayFilter, decisionFilter, sortKey]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paged = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // フィルタ済みIDリストをsessionStorageに保存（詳細ページの前後ナビで使用）
  useEffect(() => {
    try {
      sessionStorage.setItem("kaio-filtered-ids", JSON.stringify(filtered.map(i => i.id)));
    } catch { /* ignore */ }
  }, [filtered]);

  async function fetchItems() {
    setLoading(true);
    try {
      const res = await fetch("/api/items");
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === paged.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paged.map((i) => i.id)));
    }
  }

  async function handleBulkAction(action: string) {
    const targetIds = selected.size > 0 ? [...selected] : filtered.filter(i => i.mercariStatus === "available").map(i => i.id);
    if (targetIds.length === 0) return;

    const confirmMsg = selected.size > 0
      ? `選択した${targetIds.length}件に「${action === "calculate_costs" ? "費用計算" : action === "process_images" ? "画像処理" : action === "delete" ? "削除" : action}」を実行しますか？`
      : `フィルタ対象の${targetIds.length}件に実行しますか？`;
    if (!confirm(confirmMsg)) return;

    setBulkLoading(action);

    if (action === "delete") {
      for (const id of targetIds) {
        await fetch(`/api/items/${id}`, { method: "DELETE" });
      }
    } else {
      for (const id of targetIds) {
        await fetch(`/api/items/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
      }
    }

    setBulkLoading(null);
    setSelected(new Set());
    fetchItems();
  }

  // 統計
  const availableCount = items.filter(i => i.mercariStatus === "available").length;
  const listedCount = items.filter(i => i.ebayStatus === "listed").length;
  const draftCount = items.filter(i => i.ebayStatus === "draft").length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">アイテム管理</h1>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-[13px] text-muted-foreground">{items.length}件</span>
            <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
              <span>在庫 <span className="text-emerald-500 font-medium">{availableCount}</span></span>
              <span className="text-border">|</span>
              <span>出品中 <span className="text-blue-500 font-medium">{listedCount}</span></span>
              <span className="text-border">|</span>
              <span>下書き <span className="font-medium">{draftCount}</span></span>
            </div>
          </div>
        </div>
        <Link href="/scrape">
          <Button size="sm" className="gap-2 text-[13px] h-8">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            新規取得
          </Button>
        </Link>
      </div>

      {/* Decision Filter Tabs - Primary Filter */}
      <div className="flex items-center gap-1 border-b border-border/50 pb-0">
        {([
          { value: "all", label: "全て", count: items.length },
          { value: "none", label: "未判定", count: items.filter(i => !i.decision).length },
          { value: "auto_pass", label: "AI:パス推薦", count: items.filter(i => !i.decision && checkShouldPass(i.mercariTitle, i.mercariDescription, i.mercariPrice).shouldPass).length },
          { value: "list", label: "出品", count: items.filter(i => i.decision === "list").length },
          { value: "considering", label: "検討", count: items.filter(i => i.decision === "considering").length },
          { value: "pass", label: "パス", count: items.filter(i => i.decision === "pass").length },
        ] as const).map(({ value, label, count }) => (
          <button
            key={value}
            onClick={() => setDecisionFilter(value)}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px ${
              decisionFilter === value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            {label}
            <span className={`ml-1.5 text-[11px] tabular-nums ${decisionFilter === value ? "text-primary" : "text-muted-foreground/50"}`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Filters & Controls - Notion-style toolbar */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 py-2">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <Input
              placeholder="検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-[13px] bg-transparent border-border/50 focus-visible:ring-1 focus-visible:ring-ring/30"
            />
          </div>

          {/* Status Filters */}
          <Select value={mercariFilter} onValueChange={(v) => setMercariFilter(v ?? "all")}>
            <SelectTrigger className="w-[130px] h-8 text-[12px] border-border/50">
              <SelectValue placeholder="メルカリ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">メルカリ: 全て</SelectItem>
              <SelectItem value="available">在庫あり</SelectItem>
              <SelectItem value="sold">売り切れ</SelectItem>
              <SelectItem value="deleted">削除済み</SelectItem>
            </SelectContent>
          </Select>
          <Select value={ebayFilter} onValueChange={(v) => setEbayFilter(v ?? "all")}>
            <SelectTrigger className="w-[130px] h-8 text-[12px] border-border/50">
              <SelectValue placeholder="eBay" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">eBay: 全て</SelectItem>
              <SelectItem value="draft">下書き</SelectItem>
              <SelectItem value="listed">出品中</SelectItem>
              <SelectItem value="sold">販売済み</SelectItem>
              <SelectItem value="removed">削除済み</SelectItem>
            </SelectContent>
          </Select>

          {/* Sort */}
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="w-[140px] h-8 text-[12px] border-border/50">
              <SelectValue placeholder="並び替え" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">新しい順</SelectItem>
              <SelectItem value="updated">更新順</SelectItem>
              <SelectItem value="price_desc">仕入れ高い順</SelectItem>
              <SelectItem value="price_asc">仕入れ安い順</SelectItem>
              <SelectItem value="profit_desc">利益大きい順</SelectItem>
              <SelectItem value="profit_asc">利益小さい順</SelectItem>
              <SelectItem value="ebay_price">eBay価格順</SelectItem>
              <SelectItem value="ai_score">AIスコア順</SelectItem>
              <SelectItem value="likes_desc">いいね多い順</SelectItem>
            </SelectContent>
          </Select>

          <span className="text-[11px] text-muted-foreground/60 tabular-nums whitespace-nowrap ml-1">{filtered.length}件</span>

          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[12px]" onClick={() => exportItemsToCSV(filtered)}>
            <Download className="w-3.5 h-3.5" />
            CSV
          </Button>

          {/* View Toggle */}
          <div className="flex rounded-md border border-border/50 overflow-hidden ml-auto">
            <button
              onClick={() => setView("grid")}
              className={`px-2 py-1.5 transition-colors ${view === "grid" ? "bg-accent text-foreground" : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent/50"}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" /></svg>
            </button>
            <button
              onClick={() => setView("list")}
              className={`px-2 py-1.5 transition-colors ${view === "list" ? "bg-accent text-foreground" : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent/50"}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>
            </button>
          </div>
        </div>

        {/* Bulk Actions Bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 rounded-lg bg-accent/80 px-4 py-2 animate-in slide-in-from-top-2">
            <span className="text-[13px] font-medium">{selected.size}件選択中</span>
            <div className="w-px h-4 bg-border" />
            <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => handleBulkAction("calculate_costs")} disabled={!!bulkLoading}>
              {bulkLoading === "calculate_costs" ? "計算中..." : "費用計算"}
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => handleBulkAction("process_images")} disabled={!!bulkLoading}>
              {bulkLoading === "process_images" ? "処理中..." : "画像処理"}
            </Button>
            <Button variant="destructive" size="sm" className="h-7 text-[12px]" onClick={() => handleBulkAction("delete")} disabled={!!bulkLoading}>
              {bulkLoading === "delete" ? "削除中..." : "削除"}
            </Button>
            <button onClick={() => setSelected(new Set())} className="ml-auto text-[12px] text-muted-foreground hover:text-foreground transition-colors">
              選択解除
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <svg className="w-5 h-5 text-muted-foreground/50 animate-spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
          </svg>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-[13px] text-muted-foreground">
            {items.length === 0 ? "アイテムがありません" : "条件に合うアイテムがありません"}
          </p>
          {items.length === 0 && (
            <Link href="/scrape">
              <Button size="sm" className="mt-4 gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                スクレイピング開始
              </Button>
            </Link>
          )}
        </div>
      ) : view === "grid" ? (
        /* Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paged.map((item) => {
            let images: string[] = []; try { images = item.mercariImages ? JSON.parse(item.mercariImages) : []; } catch { /* ignore */ }
            const isSelected = selected.has(item.id);
            return (
              <div key={item.id} className="group relative">
                {/* Checkbox */}
                <button
                  onClick={(e) => { e.preventDefault(); toggleSelect(item.id); }}
                  className={`absolute top-2.5 left-2.5 z-10 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                    isSelected
                      ? "bg-primary border-primary text-white"
                      : "border-white/60 bg-black/30 backdrop-blur-sm opacity-0 group-hover:opacity-100"
                  }`}
                >
                  {isSelected && (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  )}
                </button>

                <Link
                  href={`/items/${item.id}`}
                  className={`block rounded-lg bg-card border overflow-hidden transition-all duration-150 hover:shadow-md hover:shadow-black/5 ${
                    isSelected ? "border-primary ring-1 ring-primary" : "border-border/60 hover:border-border"
                  }`}
                >
                  <div className="aspect-square relative bg-accent overflow-hidden">
                    {images[0] ? (
                      <Image src={images[0]} alt="" fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover group-hover:scale-[1.02] transition-transform duration-300 ease-out" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>
                      </div>
                    )}
                    <div className="absolute top-2 right-2 flex gap-1">
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur-md bg-black/50 text-white">
                        <StatusDot status={item.mercariStatus} />
                        {statusLabels[item.mercariStatus]}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur-md bg-black/50 text-white">
                        <StatusDot status={item.ebayStatus} />
                        {statusLabels[item.ebayStatus]}
                      </span>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-[13px] font-medium truncate leading-snug">{item.mercariTitle}</p>
                    {item.estimatedProfitUsd != null && (
                      <div className="mt-1.5 flex items-baseline gap-1.5">
                        <span className={`text-[13px] font-semibold tabular-nums ${item.estimatedProfitUsd > 0 ? "text-emerald-500" : "text-red-400"}`}>
                          利益 ${item.estimatedProfitUsd.toFixed(0)}
                        </span>
                        <span className={`text-[11px] tabular-nums ${item.estimatedProfitUsd > 0 ? "text-emerald-500/60" : "text-red-400/60"}`}>
                          (¥{Math.round(item.estimatedProfitUsd * 160).toLocaleString()})
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[12px] text-muted-foreground tabular-nums">¥{(item.mercariPrice || 0).toLocaleString()}</span>
                      {item.ebayPriceUsd ? (
                        <span className="text-[12px] font-medium text-primary tabular-nums">${item.ebayPriceUsd}</span>
                      ) : null}
                    </div>
                    {item.aiScore != null && (
                      <div className="mt-1.5 pt-1.5 border-t border-border/40 flex items-center justify-between">
                        <span className={`text-[11px] font-medium tabular-nums ${item.aiScore >= 70 ? "text-emerald-500" : item.aiScore >= 40 ? "text-amber-500" : "text-red-400"}`}>
                          AI:{item.aiScore}
                        </span>
                        {item.lengthCm ? (
                          <span className="text-[11px] text-muted-foreground">{item.lengthCm}cm</span>
                        ) : null}
                      </div>
                    )}
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View - Notion-like clean table */
        <div className="border border-border/60 rounded-lg overflow-x-auto">
          {/* Table header */}
          <div className="grid grid-cols-[32px_36px_1fr_72px_80px_80px_44px_80px_80px_60px_60px] gap-0 px-3 py-2.5 border-b border-border/60 text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider bg-accent/30">
            <span className="flex items-center">
              <button
                onClick={toggleSelectAll}
                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  selected.size === paged.length && paged.length > 0 ? "bg-primary border-primary text-white" : "border-border hover:border-muted-foreground/40"
                }`}
              >
                {selected.size === paged.length && paged.length > 0 && (
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                )}
              </button>
            </span>
            <span></span>
            <span>商品名</span>
            <span className="text-right">利益</span>
            <span className="text-right">仕入れ</span>
            <span className="text-right">eBay</span>
            <span className="text-right">AI</span>
            <span>メルカリ</span>
            <span>eBay</span>
            <span className="text-right">作成</span>
            <span className="text-right">更新</span>
          </div>
          {/* Table rows */}
          <div>
            {paged.map((item, index) => {
              let images: string[] = []; try { images = item.mercariImages ? JSON.parse(item.mercariImages) : []; } catch { /* ignore */ }
              const isSelected = selected.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`grid grid-cols-[32px_36px_1fr_72px_80px_80px_44px_80px_80px_60px_60px] gap-0 px-3 py-2 items-center transition-colors ${
                    isSelected
                      ? "bg-accent/60"
                      : "hover:bg-accent/40"
                  } ${index > 0 ? "border-t border-border/30" : ""}`}
                >
                  <span className="flex items-center">
                    <button
                      onClick={() => toggleSelect(item.id)}
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                        isSelected ? "bg-primary border-primary text-white" : "border-border hover:border-muted-foreground/40"
                      }`}
                    >
                      {isSelected && (
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      )}
                    </button>
                  </span>
                  <Link href={`/items/${item.id}`} className="relative w-7 h-7 flex-shrink-0">
                    {images[0] ? (
                      <Image src={images[0]} alt="" fill sizes="28px" className="rounded object-cover" />
                    ) : (
                      <div className="w-7 h-7 rounded bg-accent" />
                    )}
                  </Link>
                  <Link href={`/items/${item.id}`} className="truncate pr-3">
                    <span className="text-[13px] font-medium hover:text-primary transition-colors">{item.mercariTitle}</span>
                  </Link>
                  <span className={`text-right tabular-nums font-medium ${item.estimatedProfitUsd && item.estimatedProfitUsd > 0 ? "text-emerald-500" : item.estimatedProfitUsd ? "text-red-400" : ""}`}>
                    {item.estimatedProfitUsd != null ? (
                      <span className="flex flex-col items-end leading-tight">
                        <span className="text-[13px]">${item.estimatedProfitUsd.toFixed(0)}</span>
                        <span className="text-[10px] opacity-60">¥{Math.round(item.estimatedProfitUsd * 160).toLocaleString()}</span>
                      </span>
                    ) : <span className="text-[13px] text-muted-foreground/30">--</span>}
                  </span>
                  <span className="text-[13px] text-right tabular-nums text-muted-foreground">¥{(item.mercariPrice || 0).toLocaleString()}</span>
                  <span className="text-[13px] text-right tabular-nums">{item.ebayPriceUsd ? `$${item.ebayPriceUsd}` : <span className="text-muted-foreground/30">--</span>}</span>
                  <span className={`text-[12px] text-right tabular-nums font-medium ${item.aiScore != null && item.aiScore >= 70 ? "text-emerald-500" : item.aiScore != null && item.aiScore >= 40 ? "text-amber-500" : item.aiScore != null ? "text-red-400" : ""}`}>
                    {item.aiScore != null ? item.aiScore : <span className="text-muted-foreground/30">--</span>}
                  </span>
                  <div>
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <StatusDot status={item.mercariStatus} />
                      {statusLabels[item.mercariStatus]}
                    </span>
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <StatusDot status={item.ebayStatus} />
                      {statusLabels[item.ebayStatus]}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground/60 tabular-nums text-right">
                    {new Date(item.createdAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}
                  </span>
                  <span className="text-[11px] text-muted-foreground/60 tabular-nums text-right">
                    {new Date(item.updatedAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2.5 text-[12px]"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            前へ
          </Button>
          <div className="flex items-center gap-0.5">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = i + 1;
              } else if (page <= 4) {
                pageNum = i + 1;
              } else if (page >= totalPages - 3) {
                pageNum = totalPages - 6 + i;
              } else {
                pageNum = page - 3 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-7 h-7 rounded text-[12px] font-medium transition-colors ${
                    page === pageNum
                      ? "bg-accent text-foreground"
                      : "hover:bg-accent/50 text-muted-foreground"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2.5 text-[12px]"
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
          >
            次へ
          </Button>
          <span className="text-[11px] text-muted-foreground/60 ml-2 tabular-nums">
            {(page - 1) * ITEMS_PER_PAGE + 1}-{Math.min(page * ITEMS_PER_PAGE, filtered.length)} / {filtered.length}件
          </span>
        </div>
      )}
    </div>
  );
}
