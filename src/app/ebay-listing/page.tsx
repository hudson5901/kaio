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
import { Download } from "lucide-react";
import { mapItemToEbayListing, type EbayListingData } from "@/lib/ebay/mapping";
import { validateEbayListing, type ValidationResult } from "@/lib/ebay/validation";
import { downloadEbayDraftCsv } from "@/lib/ebay/draft-csv";

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

  const sortedItems = useMemo(() => {
    if (!sortKey) return items;
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
    return [...items].sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [items, sortKey, sortDir]);

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

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">eBay出品</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            「出品」判定のアイテム <span className="font-medium text-foreground">{items.length}</span>件
          </p>
        </div>
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
        <div className="flex items-center justify-center py-20">
          <svg className="w-5 h-5 text-muted-foreground/50 animate-spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
          </svg>
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
          <div className="grid grid-cols-[32px_36px_1fr_80px_80px_80px_80px_80px_60px] gap-0 px-3 py-2.5 border-b border-border/60 text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider bg-accent/30">
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
            <button onClick={() => toggleSort("mercariPrice")} className="group flex items-center gap-0.5 justify-end">仕入れ <SortIcon active={sortKey === "mercariPrice"} dir={sortDir} /></button>
            <button onClick={() => toggleSort("ebayPrice")} className="group flex items-center gap-0.5 justify-end">eBay価格 <SortIcon active={sortKey === "ebayPrice"} dir={sortDir} /></button>
            <button onClick={() => toggleSort("shipping")} className="group flex items-center gap-0.5 justify-end">送料 <SortIcon active={sortKey === "shipping"} dir={sortDir} /></button>
            <button onClick={() => toggleSort("profit")} className="group flex items-center gap-0.5 justify-end">利益 <SortIcon active={sortKey === "profit"} dir={sortDir} /></button>
            <span>eBay</span>
            <button onClick={() => toggleSort("ai")} className="group flex items-center gap-0.5 justify-end">AI <SortIcon active={sortKey === "ai"} dir={sortDir} /></button>
          </div>
          {/* Table rows */}
          <div>
            {sortedItems.map((item, index) => {
              let images: string[] = [];
              try { images = item.mercariImages ? JSON.parse(item.mercariImages) : []; } catch { /* ignore */ }
              const isSelected = selected.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`grid grid-cols-[32px_36px_1fr_80px_80px_80px_80px_80px_60px] gap-0 px-3 py-2 items-center transition-colors ${
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
                  <span className="text-[13px] text-right tabular-nums text-muted-foreground">¥{(item.mercariPrice || 0).toLocaleString()}</span>
                  <span className="text-[13px] text-right tabular-nums">{item.ebayPriceUsd ? `$${item.ebayPriceUsd}` : <span className="text-muted-foreground/30">--</span>}</span>
                  <span className="text-[13px] text-right tabular-nums text-muted-foreground">{item.shippingCostUsd ? `$${item.shippingCostUsd.toFixed(1)}` : <span className="text-muted-foreground/30">--</span>}</span>
                  <span className={`text-[13px] text-right tabular-nums font-medium ${item.estimatedProfitUsd && item.estimatedProfitUsd > 0 ? "text-emerald-500" : item.estimatedProfitUsd ? "text-red-400" : ""}`}>
                    {item.estimatedProfitUsd != null ? `$${item.estimatedProfitUsd.toFixed(0)}` : <span className="text-muted-foreground/30">--</span>}
                  </span>
                  <div>
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <StatusDot status={item.ebayStatus} />
                      {statusLabels[item.ebayStatus]}
                    </span>
                  </div>
                  <span className={`text-[12px] text-right tabular-nums font-medium ${item.aiScore != null && item.aiScore >= 70 ? "text-emerald-500" : item.aiScore != null && item.aiScore >= 40 ? "text-amber-500" : item.aiScore != null ? "text-red-400" : ""}`}>
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
