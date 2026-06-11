"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Item } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Download, RefreshCw, Search } from "lucide-react";
import { mapItemToEbayListing, type EbayListingData } from "@/lib/ebay/mapping";
import { validateEbayListing, type ValidationResult } from "@/lib/ebay/validation";
import { downloadEbayDraftCsv } from "@/lib/ebay/draft-csv";

interface ValidationEntry {
  item: Item;
  listing: EbayListingData;
  result: ValidationResult;
}

type SortKey = "title" | "mercariPrice" | "ebayPrice" | "shipping" | "profit" | "ai";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <svg className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" /></svg>;
  return dir === "asc"
    ? <svg className="w-3 h-3 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
    : <svg className="w-3 h-3 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>;
}

export default function EbayListingPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showValidation, setShowValidation] = useState(false);
  const [validationEntries, setValidationEntries] = useState<ValidationEntry[]>([]);
  const [validListings, setValidListings] = useState<EbayListingData[]>([]);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/items")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setItems(data.filter((i: Item) => i.decision === "list"));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.id)));
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const filteredItems = useMemo(() => {
    let result = items;
    if (statusFilter === "checked") result = result.filter((i) => !!i.listingScheduledAt);
    else if (statusFilter !== "all") result = result.filter((i) => i.ebayStatus === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((i) =>
        (i.mercariTitle || "").toLowerCase().includes(q) ||
        (i.ebayTitle || "").toLowerCase().includes(q) ||
        (i.mercariId || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [items, statusFilter, search]);

  const sortedItems = useMemo(() => {
    if (!sortKey) return filteredItems;
    const getValue = (item: Item): number | string => {
      switch (sortKey) {
        case "title": return item.mercariTitle || "";
        case "mercariPrice": return item.mercariPrice || 0;
        case "ebayPrice": return item.ebayPriceUsd || 0;
        case "shipping": return item.shippingCostUsd || 0;
        case "profit": return item.estimatedProfitUsd || 0;
        case "ai": return item.aiScore || 0;
      }
    };
    return [...filteredItems].sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredItems, sortKey, sortDir]);

  // フィルタ済みIDをsessionStorageに保存（詳細ページの前後ナビで使用）
  useEffect(() => {
    try {
      sessionStorage.setItem("kaio-filtered-ids", JSON.stringify(sortedItems.map((i) => i.id)));
    } catch { /* ignore */ }
  }, [sortedItems]);

  function handleCsvExport() {
    const targetItems = selected.size > 0
      ? items.filter((i) => selected.has(i.id))
      : items;

    const entries: ValidationEntry[] = targetItems.map((item) => {
      const listing = mapItemToEbayListing(item);
      const result = validateEbayListing(listing);
      return { item, listing, result };
    });

    const valid = entries.filter((e) => e.result.valid);
    const invalid = entries.filter((e) => !e.result.valid);

    if (invalid.length === 0) {
      // 全件OK — 即ダウンロード
      downloadEbayDraftCsv(valid.map((e) => e.listing));
    } else {
      // NG件あり — バリデーションモーダル表示
      setValidationEntries(entries);
      setValidListings(valid.map((e) => e.listing));
      setShowValidation(true);
    }
  }

  function handleDownloadValid() {
    if (validListings.length > 0) {
      downloadEbayDraftCsv(validListings);
    }
    setShowValidation(false);
  }

  async function handleEbaySync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/ebay/import", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncMessage({ type: "error", text: data.message || data.error || "同期に失敗しました" });
        return;
      }
      setSyncMessage({
        type: "success",
        text: `${data.imported}件インポート、${data.updated}件更新、${data.soldMarked}件売約済み`,
      });
      // リスト再取得
      const itemsRes = await fetch("/api/items");
      const itemsData = await itemsRes.json();
      if (Array.isArray(itemsData)) {
        setItems(itemsData.filter((i: Item) => i.decision === "list"));
      }
    } catch {
      setSyncMessage({ type: "error", text: "eBay同期中にエラーが発生しました" });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">eBay出品</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            「出品」判定のアイテム <span className="font-medium text-foreground">{items.length}</span>件
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-[12px] h-8"
            onClick={handleEbaySync}
            disabled={syncing}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "同期中..." : "eBay同期"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-[12px] h-8"
            onClick={handleCsvExport}
            disabled={items.length === 0}
          >
            <Download className="w-3.5 h-3.5" />
            CSV出力{selected.size > 0 ? ` (${selected.size}件)` : ""}
          </Button>
        </div>
      </div>

      {/* Sync message toast */}
      {syncMessage && (
        <div
          className={`rounded-lg px-4 py-2.5 text-[13px] font-medium animate-in slide-in-from-top-2 ${
            syncMessage.type === "success"
              ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
              : "bg-red-500/10 text-red-600 border border-red-500/20"
          }`}
        >
          {syncMessage.text}
        </div>
      )}

      {/* Status filter tabs */}
      {(() => {
        const checkedCount = items.filter((i) => !!i.listingScheduledAt).length;
        const draftCount = items.filter((i) => i.ebayStatus === "draft").length;
        const listedCount = items.filter((i) => i.ebayStatus === "listed").length;
        const filters = [
          { key: "all", label: "すべて", count: items.length },
          { key: "checked", label: "チェック済", count: checkedCount },
          { key: "draft", label: "下書き", count: draftCount },
          { key: "listed", label: "出品中", count: listedCount },
        ];
        return (
          <div className="flex gap-1 border-b border-border/60 -mb-2">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`px-3 py-2 text-[12px] font-medium border-b-2 transition-colors ${
                  statusFilter === f.key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label} <span className="text-muted-foreground/60 ml-0.5">{f.count}</span>
              </button>
            ))}
          </div>
        );
      })()}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
        <input
          type="text"
          placeholder="商品名・eBayタイトル・IDで検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-8 pl-8 pr-3 rounded-md border border-border/60 bg-transparent text-[13px] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Selection bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-accent/80 px-4 py-2 animate-in slide-in-from-top-2">
          <span className="text-[13px] font-medium">{selected.size}件選択中</span>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            選択解除
          </button>
        </div>
      )}

      {loading ? (
        <div className="border border-border/60 rounded-lg overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={`grid grid-cols-[32px_36px_1fr_80px_80px_80px_80px_60px_50px] gap-0 px-3 py-2.5 items-center ${i > 0 ? "border-t border-border/30" : ""}`}>
              <div />
              <div className="w-7 h-7 rounded bg-accent animate-pulse" />
              <div className="h-3.5 bg-accent rounded w-3/4 animate-pulse" />
              <div className="h-3 bg-accent/60 rounded w-12 ml-auto animate-pulse" />
              <div className="h-3 bg-accent/60 rounded w-10 ml-auto animate-pulse" />
              <div className="h-3 bg-accent/60 rounded w-10 ml-auto animate-pulse" />
              <div className="h-3 bg-accent/60 rounded w-10 ml-auto animate-pulse" />
              <div className="h-3 bg-accent/60 rounded w-5 mx-auto animate-pulse" />
              <div className="h-3 bg-accent/60 rounded w-6 ml-auto animate-pulse" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-[13px] text-muted-foreground">出品判定のアイテムがありません</p>
          <Link href="/items">
            <button className="mt-4 text-[13px] text-primary hover:underline">アイテム管理へ</button>
          </Link>
        </div>
      ) : (
        <div className="border border-border/60 rounded-lg overflow-x-auto">
          {/* Table header */}
          <div className="sticky top-0 z-10 grid grid-cols-[32px_36px_1fr_80px] sm:grid-cols-[32px_36px_1fr_80px_80px_80px_80px_60px_50px] gap-0 px-3 py-2.5 border-b border-border/60 text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider bg-accent/30 backdrop-blur-sm">
            <span className="flex items-center">
              <button
                onClick={toggleSelectAll}
                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  selected.size === items.length && items.length > 0 ? "bg-primary border-primary text-white" : "border-border hover:border-muted-foreground/40"
                }`}
              >
                {selected.size === items.length && items.length > 0 && (
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                )}
              </button>
            </span>
            <span></span>
            <button onClick={() => toggleSort("title")} className="group flex items-center gap-1 text-left">商品名 <SortIcon active={sortKey === "title"} dir={sortDir} /></button>
            <button onClick={() => toggleSort("profit")} className="group flex items-center gap-0.5 justify-end">利益 <SortIcon active={sortKey === "profit"} dir={sortDir} /></button>
            <button onClick={() => toggleSort("mercariPrice")} className="hidden sm:flex group items-center gap-0.5 justify-end">仕入れ <SortIcon active={sortKey === "mercariPrice"} dir={sortDir} /></button>
            <button onClick={() => toggleSort("ebayPrice")} className="hidden sm:flex group items-center gap-0.5 justify-end">eBay価格 <SortIcon active={sortKey === "ebayPrice"} dir={sortDir} /></button>
            <button onClick={() => toggleSort("shipping")} className="hidden sm:flex group items-center gap-0.5 justify-end">送料 <SortIcon active={sortKey === "shipping"} dir={sortDir} /></button>
            <span className="hidden sm:block text-center">確認</span>
            <button onClick={() => toggleSort("ai")} className="hidden sm:flex group items-center gap-0.5 justify-end">AI <SortIcon active={sortKey === "ai"} dir={sortDir} /></button>
          </div>
          {/* Table rows */}
          <div>
            {sortedItems.map((item, index) => {
              let images: string[] = [];
              try { images = item.processedImages ? JSON.parse(item.processedImages) : item.mercariImages ? JSON.parse(item.mercariImages) : []; } catch { /* ignore */ }
              const isSelected = selected.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`grid grid-cols-[32px_36px_1fr_80px] sm:grid-cols-[32px_36px_1fr_80px_80px_80px_80px_60px_50px] gap-0 px-3 py-2 items-center transition-colors ${
                    isSelected ? "bg-accent/60" : "hover:bg-accent/40"
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
                  <Link href={`/items/${item.id}?from=ebay-listing`} className="relative w-7 h-7 flex-shrink-0">
                    {images[0] ? (
                      <Image src={images[0]} alt="" fill sizes="28px" className="rounded object-cover" />
                    ) : (
                      <div className="w-7 h-7 rounded bg-accent" />
                    )}
                  </Link>
                  <Link href={`/items/${item.id}?from=ebay-listing`} className="truncate pr-3">
                    <span className="text-[13px] font-medium hover:text-primary transition-colors">{item.mercariTitle}</span>
                  </Link>
                  <span className={`text-[13px] text-right tabular-nums font-medium ${item.estimatedProfitUsd && item.estimatedProfitUsd > 0 ? "text-emerald-500" : item.estimatedProfitUsd ? "text-red-400" : ""}`}>
                    {item.estimatedProfitUsd != null ? `$${item.estimatedProfitUsd.toFixed(0)}` : <span className="text-muted-foreground/30">--</span>}
                  </span>
                  <span className="hidden sm:block text-[13px] text-right tabular-nums text-muted-foreground">¥{(item.mercariPrice || 0).toLocaleString()}</span>
                  <span className="hidden sm:block text-[13px] text-right tabular-nums">{item.ebayPriceUsd ? `$${item.ebayPriceUsd}` : <span className="text-muted-foreground/30">--</span>}</span>
                  <span className="hidden sm:block text-[13px] text-right tabular-nums text-muted-foreground">{item.shippingCostUsd ? `$${item.shippingCostUsd.toFixed(1)}` : <span className="text-muted-foreground/30">--</span>}</span>
                  <div className="hidden sm:flex justify-center">
                    {item.listingScheduledAt ? (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-500">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/40">--</span>
                    )}
                  </div>
                  <span className={`hidden sm:block text-[12px] text-right tabular-nums font-medium ${item.aiScore != null && item.aiScore >= 70 ? "text-emerald-500" : item.aiScore != null && item.aiScore >= 40 ? "text-amber-500" : item.aiScore != null ? "text-red-400" : ""}`}>
                    {item.aiScore != null ? item.aiScore : <span className="text-muted-foreground/30">--</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Validation Modal */}
      <Dialog open={showValidation} onOpenChange={setShowValidation}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>バリデーション結果</DialogTitle>
            <DialogDescription>
              {validationEntries.filter((e) => !e.result.valid).length}件のアイテムにエラーがあります
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[300px] overflow-y-auto space-y-2">
            {validationEntries
              .filter((e) => !e.result.valid)
              .map((entry) => (
                <div key={entry.item.id} className="rounded-md border border-border/60 p-3">
                  <p className="text-[13px] font-medium truncate">{entry.item.mercariTitle}</p>
                  <ul className="mt-1 space-y-0.5">
                    {entry.result.errors.map((err, i) => (
                      <li key={i} className="text-[12px] text-red-500">
                        {err.field}: {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              閉じる
            </DialogClose>
            {validListings.length > 0 && (
              <Button size="sm" onClick={handleDownloadValid}>
                有効な{validListings.length}件のみ出力
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
