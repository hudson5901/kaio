"use client";

import { useEffect, useState, useMemo, use } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Item } from "@/lib/db/schema";
import { CommentsSection } from "@/components/comments-section";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { checkShouldPass, type PassCheckResult } from "@/lib/kabuto/pass-checker";
import { STATUS_LABELS as statusLabels, STATUS_COLORS as statusColors } from "@/lib/format";

function StatusDot({ status }: { status: string }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${statusColors[status] || "bg-zinc-400"}`} />;
}

function CheckBox({ checked, loading }: { checked: boolean; loading?: boolean }) {
  return (
    <span className={`w-4.5 h-4.5 rounded flex items-center justify-center border transition-colors flex-shrink-0 ${
      checked ? "bg-emerald-500 border-emerald-500 text-white" : "border-muted-foreground/40 bg-transparent"
    } ${loading ? "opacity-50" : ""}`}>
      {checked && (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      )}
    </span>
  );
}

export default function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const tab = searchParams.get("tab");
  const backHref =
    from === "ebay-listing" ? "/ebay-listing"
    : from === "inventory" ? "/inventory"
    : from === "notifications" ? "/notifications"
    : "/items";
  const backLabel =
    from === "ebay-listing" ? "eBay出品"
    : from === "inventory" ? "在庫管理"
    : from === "notifications" ? "通知"
    : "アイテム管理";
  const [item, setItem] = useState<Item | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [costs, setCosts] = useState<Record<string, number> | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [previewImage, setPreviewImage] = useState(0);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);
  const [savingPrice, setSavingPrice] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [draftPrice, setDraftPrice] = useState("");
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [adjacentItems, setAdjacentItems] = useState<{ prev: string | null; next: string | null; currentIndex: number; total: number }>({ prev: null, next: null, currentIndex: 0, total: 0 });
  const [viewMode, setViewMode] = useState<"judge" | "ebay">(tab === "ebay" ? "ebay" : "judge");
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string } | null>(null);
  const [staffUsers, setStaffUsers] = useState<{ id: string; name: string }[]>([]);
  const [togglingCheck, setTogglingCheck] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const navQueryFor = (mode: "judge" | "ebay") => {
    const parts = [from && `from=${from}`, mode === "ebay" && "tab=ebay"].filter(Boolean);
    return parts.length > 0 ? `?${parts.join("&")}` : "";
  };
  const navQuery = navQueryFor(viewMode);

  // パスチェッカー
  const passCheck = useMemo<PassCheckResult | null>(() => {
    if (!item) return null;
    return checkShouldPass(item.mercariTitle, item.mercariDescription, item.mercariPrice);
  }, [item?.id, item?.mercariTitle, item?.mercariDescription, item?.mercariPrice]);

  useEffect(() => { fetchItem(); fetchAdjacentItems(); setSelectedImage(0); }, [id]);

  // ログイン中ユーザーと全スタッフ取得（出品準備チェック用）
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      if (d && !d.error) setCurrentUser({ id: d.id, name: d.name });
    }).catch(() => {});
    fetch("/api/users").then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setStaffUsers(d.map((u) => ({ id: u.id, name: u.name })));
    }).catch(() => {});
  }, []);

  // 次のアイテムをプリフェッチ（遷移を高速化）
  useEffect(() => {
    if (adjacentItems.next) {
      fetch(`/api/items/${adjacentItems.next}`).catch(() => {});
    }
  }, [adjacentItems.next]);

  // 説明文がなければ自動取得
  useEffect(() => {
    if (!item || item.mercariDescription || !item.mercariId) return;
    if (actionLoading === "fetch_details") return;
    handleAction("fetch_details");
  }, [item?.id]);

  // 兜カテゴリが未設定なら自動AI分類
  useEffect(() => {
    if (!item || item.kabutoCategory || classifying) return;
    handleClassify();
  }, [item?.id, item?.mercariDescription]);

  // キーボードショートカット: 矢印で前後、1/2/3で判定、Esc でモーダル閉じる
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.isComposing) return; // IME 入力中は無視
      // Esc は常に最優先: モーダル/ライトボックスを閉じる
      if (e.key === "Escape") {
        if (lightboxImage) { setLightboxImage(null); return; }
        if (showShortcuts) { setShowShortcuts(false); return; }
      }
      // ライトボックス開いてる時はナビ/判定 ショートカットを停止
      if (lightboxImage || showShortcuts) return;
      if (e.key === "ArrowLeft" && adjacentItems.prev) {
        router.push(`/items/${adjacentItems.prev}${navQuery}`);
      } else if (e.key === "ArrowRight" && adjacentItems.next) {
        router.push(`/items/${adjacentItems.next}${navQuery}`);
      } else if (e.key === "1") {
        handleDecision("list");
      } else if (e.key === "2") {
        handleDecision("considering");
      } else if (e.key === "3") {
        handleDecision("pass");
      } else if (e.key === "?") {
        setShowShortcuts((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [adjacentItems, router, item, navQuery, lightboxImage, showShortcuts]);

  async function fetchAdjacentItems() {
    try {
      // sessionStorageからフィルタ済みIDリストを取得（一覧ページの絞り込み状態を維持）
      let allIds: string[] | null = null;
      try {
        const stored = sessionStorage.getItem("kaio-filtered-ids");
        if (stored) allIds = JSON.parse(stored);
      } catch { /* ignore */ }

      // フィルタ済みリストに現在のアイテムがあるか確認
      if (allIds) {
        const idx = allIds.indexOf(id);
        if (idx !== -1) {
          setAdjacentItems({
            prev: idx > 0 ? allIds[idx - 1] : null,
            next: idx < allIds.length - 1 ? allIds[idx + 1] : null,
            currentIndex: idx,
            total: allIds.length,
          });
          return;
        }
      }

      // フォールバック: 全件から取得
      const res = await fetch("/api/items?ids_only=true");
      if (!res.ok) return;
      allIds = await res.json();
      const idx = allIds!.indexOf(id);
      if (idx === -1) return;
      setAdjacentItems({
        prev: idx > 0 ? allIds![idx - 1] : null,
        next: idx < allIds!.length - 1 ? allIds![idx + 1] : null,
        currentIndex: idx,
        total: allIds!.length,
      });
    } catch { /* ignore */ }
  }

  async function fetchItem() {
    const res = await fetch(`/api/items/${id}`);
    if (res.ok) setItem(await res.json());
  }

  // 価格保存: form submit / input blur のどちらからも呼ばれる
  async function savePrice() {
    if (savingPrice || !item) return;
    const val = parseFloat(draftPrice);
    // 無効値 or 変更なし → 編集モードだけ閉じる
    if (isNaN(val) || val <= 0 || val === item.ebayPriceUsd) {
      setEditingPrice(false);
      return;
    }
    setSavingPrice(true);
    try {
      const oldPrice = item.ebayPriceUsd;
      await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ebayPriceUsd: val }),
      });
      await fetch(`/api/items/${item.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: `eBay販売価格を $${oldPrice || 0} → $${val} に変更しました` }),
      });
      const costRes = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "calculate_costs" }),
      });
      if (costRes.ok) setCosts(await costRes.json());
      setEditingPrice(false);
      await fetchItem();
    } finally {
      setSavingPrice(false);
    }
  }

  // 判定の楽観的更新 + 自動次へ
  function handleDecision(value: string) {
    if (!item) return;
    const prevDecision = item.decision;
    const newDecision = item.decision === value ? null : value;

    // 楽観的にUI更新
    setItem({ ...item, decision: newDecision } as Item);

    // バックグラウンドでサーバー同期。失敗時はロールバック。
    fetch(`/api/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", decision: newDecision }),
    })
      .then((res) => {
        if (!res.ok) {
          setItem({ ...item, decision: prevDecision } as Item);
          showItemToast("error", "判定の更新に失敗しました");
        }
      })
      .catch(() => {
        setItem({ ...item, decision: prevDecision } as Item);
        showItemToast("error", "判定の更新に失敗しました");
      });

    // 判定を設定した場合のみ、短い遅延後に次のアイテムへ自動遷移
    if (newDecision && adjacentItems.next) {
      setTimeout(() => router.push(`/items/${adjacentItems.next}${navQuery}`), 150);
    }
  }

  async function handleAction(action: string, extra?: Record<string, unknown>) {
    setActionLoading(action);
    try {
      const res = await fetch(`/api/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const raw = await res.text();
      let data: Record<string, unknown> = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { /* not JSON */ }
      if (!res.ok) {
        const msg = String(data.message || data.error || raw || res.statusText);
        showItemToast("error", `${action} 失敗 (${res.status}): ${msg.slice(0, 200)}`);
        return;
      }
      if (action === "calculate_costs") setCosts(data as Record<string, number>);
      await fetchItem();
    } catch (err) {
      showItemToast("error", `エラー: ${err instanceof Error ? err.message : err}`);
    }
    finally { setActionLoading(null); }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/items/${id}/generate`, { method: "POST" });
      const raw = await res.text();
      let data: Record<string, unknown> = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { /* ignore */ }
      if (res.ok && data.success) {
        await fetchItem();
        showItemToast("success", "AI生成が完了しました");
      } else {
        showItemToast("error", `生成に失敗: ${String(data.error || res.statusText).slice(0, 200)}`);
      }
    } catch (err) {
      showItemToast("error", `エラー: ${err instanceof Error ? err.message : err}`);
    }
    finally { setGenerating(false); }
  }

  async function saveListingText(field: "ebayTitle" | "ebayDescription", value: string) {
    try {
      const res = await fetch(`/api/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", [field]: value }),
      });
      if (!res.ok) {
        showItemToast("error", "保存に失敗しました");
        return;
      }
      await fetchItem();
      if (field === "ebayTitle") setEditingTitle(false);
      else setEditingDesc(false);
    } catch {
      showItemToast("error", "保存に失敗しました（ネットワークエラー）");
    }
  }

  function showItemToast(type: "success" | "error", text: string) {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleScore() {
    setScoring(true);
    try {
      const res = await fetch(`/api/items/${id}/score`, { method: "POST" });
      const data = await res.json();
      if (data.score != null) await fetchItem();
      else showItemToast("error", "スコアリングに失敗しました");
    } catch (err) { showItemToast("error", `エラー: ${err}`); }
    finally { setScoring(false); }
  }

  async function handleDelete() {
    try {
      const res = await fetch(`/api/items/${id}`, { method: "DELETE" });
      if (!res.ok) {
        showItemToast("error", "削除に失敗しました");
        return;
      }
      router.push(backHref);
    } catch {
      showItemToast("error", "削除に失敗しました（ネットワークエラー）");
    }
  }

  async function handleClassify() {
    setClassifying(true);
    try {
      const res = await fetch(`/api/items/${id}/classify`, { method: "POST" });
      const data = await res.json();
      if (data.success) await fetchItem();
      else showItemToast("error", "分類に失敗しました: " + (data.error || "unknown"));
    } catch (err) { showItemToast("error", `エラー: ${err instanceof Error ? err.message : err}`); }
    finally { setClassifying(false); }
  }

  async function handleSetCategory(cat: string) {
    await fetch(`/api/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", kabutoCategory: cat }),
    });
    await fetchItem();
  }

  if (!item) return <div className="py-32" />;

  let mercariImages: string[] = [];
  let processedImages: string[] = [];
  try { mercariImages = item.mercariImages ? JSON.parse(item.mercariImages) : []; } catch { /* ignore */ }
  try { processedImages = item.processedImages ? JSON.parse(item.processedImages) : []; } catch { /* ignore */ }
  // 最大10枚に制限
  const allImages = mercariImages.slice(0, 10);

  return (
    <div className="max-w-6xl space-y-4">
      {/* Breadcrumb + Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
          <Link href={backHref} className="hover:text-foreground transition-colors">{backLabel}</Link>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
          <span className="text-muted-foreground truncate max-w-xs">{item.mercariTitle}</span>
        </div>

        {/* Prev/Next navigation */}
        <div className="flex items-center gap-1.5">
          {adjacentItems.total > 0 && (
            <span className="text-[11px] text-muted-foreground/50 mr-1 tabular-nums">
              {adjacentItems.currentIndex + 1} / {adjacentItems.total}
            </span>
          )}
          <button
            onClick={() => adjacentItems.prev && router.push(`/items/${adjacentItems.prev}${navQuery}`)}
            disabled={!adjacentItems.prev}
            className="w-8 h-8 rounded-md flex items-center justify-center border border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="前のアイテム"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            onClick={() => adjacentItems.next && router.push(`/items/${adjacentItems.next}${navQuery}`)}
            disabled={!adjacentItems.next}
            className="w-8 h-8 rounded-md flex items-center justify-center border border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="次のアイテム"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
          <button
            onClick={() => setShowShortcuts(true)}
            className="w-8 h-8 rounded-md flex items-center justify-center border border-border/60 text-muted-foreground/50 hover:bg-accent hover:text-foreground transition-colors text-[12px] font-mono"
            title="キーボードショートカット"
          >
            ?
          </button>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex border-b border-border">
        {([
          { value: "judge", label: "判定" },
          { value: "ebay", label: "eBay出品" },
        ] as const).map(({ value, label }) => (
          <button
            key={value}
            onClick={() => {
              setViewMode(value);
              const params = new URLSearchParams(window.location.search);
              if (value === "ebay") params.set("tab", "ebay");
              else params.delete("tab");
              const qs = params.toString();
              router.replace(`/items/${id}${qs ? `?${qs}` : ""}`, { scroll: false });
            }}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px ${
              viewMode === value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {viewMode === "judge" ? (
      <div className="flex flex-col lg:flex-row gap-4 min-w-0">
        {/* Left: Images */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Main Image */}
          <div className="rounded-xl bg-card border border-border overflow-hidden">
            <div className="aspect-[3/2] bg-black flex items-center justify-center relative">
              {allImages[selectedImage] ? (
                <img src={allImages[selectedImage]} alt="" className="max-w-full max-h-full object-contain cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setLightboxImage(allImages[selectedImage])} />
              ) : (
                <div className="text-muted-foreground">
                  <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.5}><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>
                </div>
              )}
              {/* Status pills */}
              <div className="absolute top-3 left-3 flex gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium backdrop-blur-md bg-black/50 text-white">
                  <StatusDot status={item.mercariStatus} /> メルカリ: {statusLabels[item.mercariStatus]}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium backdrop-blur-md bg-black/50 text-white">
                  <StatusDot status={item.ebayStatus} /> eBay: {statusLabels[item.ebayStatus]}
                </span>
              </div>
            </div>
            {/* Thumbnails */}
            {allImages.length > 1 && (
              <div className="flex gap-1 p-2 overflow-x-auto scrollbar-thin bg-card">
                {allImages.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedImage(i)}
                    className={`w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all duration-200 ${i === selectedImage ? "border-primary ring-1 ring-primary/30 scale-105" : "border-transparent opacity-50 hover:opacity-90"}`}
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Processed images */}
          <div className="rounded-xl bg-card border border-border overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center justify-between bg-muted/30">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">加工済み画像</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAction("process_images")}
                disabled={actionLoading === "process_images"}
                className="text-xs h-7"
              >
                {actionLoading === "process_images" ? "処理中..." : "画像処理実行"}
              </Button>
            </div>
            {processedImages.length > 0 ? (
              <div className="grid grid-cols-4 gap-1.5 p-2.5">
                {processedImages.map((path, i) => (
                  <div key={i} className="relative group">
                    <img src={path} alt="" onClick={() => setLightboxImage(path)} className="rounded-lg object-cover aspect-square w-full bg-black cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all" />
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm(`画像 ${i + 1} を削除します。よろしいですか？\n（切り抜きを再実行すれば作り直せます）`)) return;
                        const res = await fetch(`/api/items/${item.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "remove_processed_image", index: i }),
                        });
                        if (res.ok) {
                          setToast({ type: "success", text: "加工済み画像を削除しました" });
                          await fetchItem();
                        } else {
                          const err = await res.json().catch(() => ({}));
                          setToast({ type: "error", text: err.error || "削除に失敗しました" });
                        }
                      }}
                      title="この画像を削除（切り抜き失敗など）"
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600/90 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-md hover:bg-red-600 z-10"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                まだ画像処理されていません
              </div>
            )}
          </div>

          {/* Description */}
          <div className="rounded-xl bg-card border border-border overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-muted/30">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">商品説明</h3>
            </div>
            <div className="px-4 py-3.5">
              {actionLoading === "fetch_details" ? (
                <p className="text-sm text-muted-foreground animate-pulse">メルカリから取得中...</p>
              ) : (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {item.mercariDescription || "説明文なし"}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-full lg:w-[400px] xl:w-[440px] shrink-0 space-y-3">
          {/* Title */}
          <div className="rounded-xl bg-card border border-border px-4 py-3.5">
            <h1 className="text-base font-bold leading-snug">{item.mercariTitle}</h1>
          </div>

          {/* Decision selector */}
          <div className="rounded-xl bg-card border border-border overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-muted/30">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">判定</h3>
            </div>
            {item.decision === "out_of_stock" && (
              <div className="px-3 pt-3 -mb-1">
                <div className="flex items-center gap-2 rounded-lg bg-slate-500/10 border border-slate-500/20 px-3 py-2">
                  <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  <span className="text-[11px] text-slate-300">メルカリ在庫なし（自動判定）</span>
                </div>
              </div>
            )}
            <div className="p-3 flex gap-2">
              {([
                { value: "list", label: "出品", key: "1", icon: "M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3", color: "emerald" },
                { value: "considering", label: "検討", key: "2", icon: "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", color: "amber" },
                { value: "pass", label: "パス", key: "3", icon: "M6 18 18 6M6 6l12 12", color: "red" },
              ] as const).map(({ value, label, key, icon, color }) => {
                const isActive = item.decision === value;
                const colorClasses = {
                  emerald: isActive ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400" : "",
                  amber: isActive ? "bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400" : "",
                  red: isActive ? "bg-red-500/15 border-red-500/40 text-red-600 dark:text-red-400" : "",
                };
                return (
                  <button
                    key={value}
                    onClick={() => handleDecision(value)}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium transition-all ${
                      isActive
                        ? colorClasses[color]
                        : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                    </svg>
                    {label}
                    <kbd className="ml-1 text-[10px] opacity-40 font-mono">{key}</kbd>
                  </button>
                );
              })}
            </div>
            {/* パスチェッカー推薦 */}
            {passCheck && !item.decision && passCheck.shouldPass && passCheck.confidence >= 0.3 && (
              <div className="px-3 pb-3 -mt-1">
                <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                  <svg className="w-3.5 h-3.5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                  </svg>
                  <span className="text-[11px] text-red-400">
                    パス推薦 ({Math.round(passCheck.confidence * 100)}%): {passCheck.reasons.slice(0, 2).join("、")}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Kabuto Category */}
          <div className="rounded-xl bg-card border border-border overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">兜カテゴリ</h3>
              <Button size="sm" variant="outline" onClick={handleClassify} disabled={classifying} className="text-xs gap-1 h-6 px-2">
                {classifying ? (
                  <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>分類中</>
                ) : (
                  <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" /></svg>AI分類</>
                )}
              </Button>
            </div>
            <div className="p-3">
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { id: "A", label: "A: 複合兜", icon: "🎎" },
                  { id: "B", label: "B: 鎧兜セット", icon: "⚔️" },
                  { id: "C", label: "C: 金属兜", icon: "🛡️" },
                  { id: "D", label: "D: 江戸甲冑", icon: "🏯" },
                  { id: "E", label: "E: 新品着用可", icon: "👹" },
                  { id: "F", label: "F: その他", icon: "📦" },
                ] as const).map(({ id: catId, label, icon }) => {
                  const isActive = item.kabutoCategory === catId;
                  return (
                    <button
                      key={catId}
                      onClick={() => handleSetCategory(isActive ? "" : catId)}
                      className={`flex items-center justify-center gap-1 rounded-lg border py-2 px-1 text-[11px] font-medium transition-all ${
                        isActive
                          ? "bg-primary/15 border-primary/40 text-primary"
                          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      <span>{icon}</span>
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
              {item.kabutoCategory && item.kabutoCategoryConfidence != null && (
                <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>信頼度: {Math.round(item.kabutoCategoryConfidence * 100)}%</span>
                  <div className="flex-1 h-1 rounded-full bg-accent overflow-hidden">
                    <div
                      className={`h-full rounded-full ${item.kabutoCategoryConfidence >= 0.7 ? "bg-emerald-400" : item.kabutoCategoryConfidence >= 0.4 ? "bg-amber-400" : "bg-red-400"}`}
                      style={{ width: `${item.kabutoCategoryConfidence * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Comments */}
          <CommentsSection itemId={id} />

          {/* Price breakdown */}
          <div className="rounded-xl bg-card border border-border overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">価格情報</h3>
              {costs && (
                <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                  $1 = ¥{costs.exchangeRate}
                </span>
              )}
            </div>
            <div className="p-4 space-y-3">
              {/* Profit highlight - top */}
              <div className={`flex items-center justify-between rounded-lg px-3 py-2.5 -mx-1 ${item.estimatedProfitUsd && item.estimatedProfitUsd > 0 ? "bg-emerald-500/10" : item.estimatedProfitUsd && item.estimatedProfitUsd < 0 ? "bg-red-500/10" : "bg-muted/30"}`}>
                <div>
                  <span className="text-sm font-semibold">推定利益</span>
                  {costs && (
                    <span className="text-[10px] text-muted-foreground ml-1.5">
                      (¥{costs.profitJpy?.toLocaleString()})
                    </span>
                  )}
                </div>
                <div className="flex flex-col items-end">
                  <span className={`text-xl font-extrabold tabular-nums ${item.estimatedProfitUsd && item.estimatedProfitUsd > 0 ? "text-emerald-400" : item.estimatedProfitUsd && item.estimatedProfitUsd < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                    {item.estimatedProfitUsd != null ? `$${item.estimatedProfitUsd.toFixed(2)}` : "-"}
                  </span>
                  {item.estimatedProfitUsd != null && (
                    <span className={`text-[11px] tabular-nums ${item.estimatedProfitUsd > 0 ? "text-emerald-400/60" : item.estimatedProfitUsd < 0 ? "text-red-400/60" : "text-muted-foreground/60"}`}>
                      ¥{Math.round(item.estimatedProfitUsd * (costs?.exchangeRate ?? 160)).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>

              {/* 仕入れ → 販売価格 */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">メルカリ仕入れ</span>
                <span className="text-base font-bold tabular-nums">¥{(item.mercariPrice || 0).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">eBay販売価格</span>
                {editingPrice ? (
                  <form onSubmit={(e) => { e.preventDefault(); savePrice(); }} className="flex items-center gap-1">
                    <span className="text-base font-bold text-primary">$</span>
                    <input
                      autoFocus
                      className="w-20 text-base font-bold text-primary tabular-nums bg-transparent border-b border-primary outline-none text-right disabled:opacity-50"
                      value={draftPrice}
                      disabled={savingPrice}
                      onChange={e => setDraftPrice(e.target.value)}
                      onBlur={() => savePrice()}
                      onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); setEditingPrice(false); } }}
                    />
                  </form>
                ) : (
                  <span className="text-base font-bold text-primary tabular-nums cursor-pointer hover:underline" onClick={() => { setDraftPrice(String(item.ebayPriceUsd || "")); setEditingPrice(true); }}>
                    {item.ebayPriceUsd ? `$${item.ebayPriceUsd}` : "未設定"}
                  </span>
                )}
              </div>

              {/* 費用明細 - eBay風 */}
              {(costs || item.shippingCostUsd) && (
                <>
                  <div className="h-px bg-border" />
                  <div className="space-y-0.5">
                    {/* 売上セクション */}
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pt-1 pb-1">売上</p>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">eBay販売価格</span>
                      <span className="tabular-nums">{item.ebayPriceUsd ? `$${item.ebayPriceUsd}` : "-"}</span>
                    </div>
                    {costs && (
                      <>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">eBay売上税 (6%)</span>
                          <span className="tabular-nums text-emerald-400">+${costs.salesTaxUsd?.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs pt-0.5">
                          <span className="text-muted-foreground font-medium">eBay売上</span>
                          <span className="tabular-nums font-medium">
                            ${((item.ebayPriceUsd || 0) + (costs.salesTaxUsd || 0)).toFixed(2)}
                            <span className="text-muted-foreground ml-1.5">(¥{((costs.revenueJpy || 0) + (costs.salesTaxJpy || 0)).toLocaleString()})</span>
                          </span>
                        </div>
                      </>
                    )}

                    <div className="h-px bg-border my-1.5" />

                    {/* 経費セクション */}
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-1">経費</p>
                    {[
                      { label: "広告費 (eBay売上の5%)", usd: costs?.adCostUsd ?? item.adCostUsd, jpy: costs?.adCostJpy },
                      { label: "eBay手数料 (eBay売上の16%)", usd: costs?.ebayFeeUsd ?? item.ebayFeeUsd, jpy: costs?.ebayFeeJpy },
                    ].map(({ label, usd, jpy }) => (
                      <div key={label} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="tabular-nums text-red-400">
                          {jpy ? `-¥${jpy.toLocaleString()}` : usd ? `-$${usd}` : "-"}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">メルカリ仕入れ</span>
                      <span className="tabular-nums text-red-400">-¥{(item.mercariPrice || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        FedEx送料（
                        {costs?.chargeableWeightG
                          ? `${costs.chargeableWeightG.toLocaleString()}g${costs.volumetricWeightG > costs.actualWeightG ? " 容積" : ""}`
                          : item.weightG ? `${item.weightG}g` : "2000g"}
                        ）
                      </span>
                      <span className="tabular-nums text-red-400">
                        {costs
                          ? `-¥${costs.shippingCostJpy?.toLocaleString()}`
                          : item.shippingCostUsd ? `-$${item.shippingCostUsd}` : "-"
                        }
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">関税 ((販売価格+送料)の10%)</span>
                      <span className="tabular-nums text-red-400">
                        {costs?.customsDutyJpy ? `-¥${costs.customsDutyJpy.toLocaleString()}` : item.customsDutyUsd ? `-$${item.customsDutyUsd}` : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">eBay売上税納付 (6%)</span>
                      <span className="tabular-nums text-red-400">
                        {costs?.salesTaxJpy ? `-¥${costs.salesTaxJpy.toLocaleString()}` : "-"}
                      </span>
                    </div>

                    {costs && (
                      <>
                        <div className="h-px bg-border my-1.5" />
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground font-medium">経費合計</span>
                          <span className="tabular-nums font-medium text-red-400">
                            -¥{((item.mercariPrice || 0) + (costs.shippingCostJpy || 0) + (costs.ebayFeeJpy || 0) + (costs.adCostJpy || 0) + (costs.customsDutyJpy || 0) + (costs.salesTaxJpy || 0)).toLocaleString()}
                          </span>
                        </div>
                      </>
                    )}

                    <div className="h-px bg-border my-1.5" />

                    {/* 利益セクション */}
                    <div className="flex justify-between items-center pt-0.5">
                      <span className="text-xs font-semibold">推定利益</span>
                      <div className="flex flex-col items-end">
                        <span className={`text-sm font-bold tabular-nums ${item.estimatedProfitUsd && item.estimatedProfitUsd > 0 ? "text-emerald-400" : item.estimatedProfitUsd && item.estimatedProfitUsd < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                          {costs
                            ? `¥${costs.profitJpy?.toLocaleString()}`
                            : item.estimatedProfitUsd != null ? `$${item.estimatedProfitUsd.toFixed(2)}` : "-"
                          }
                        </span>
                        {costs && (
                          <span className={`text-[10px] tabular-nums ${(costs.profitJpy || 0) > 0 ? "text-emerald-400/60" : "text-red-400/60"}`}>
                            (${item.estimatedProfitUsd?.toFixed(2)})
                          </span>
                        )}
                      </div>
                    </div>
                    {costs && costs.revenueJpy && costs.profitJpy != null && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">利益率</span>
                        <span className="tabular-nums">{Math.round((costs.profitJpy / costs.revenueJpy) * 100)}%</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="h-px bg-border" />

              {costs && costs.suggestedPriceUsd && (
                <div className="flex items-center justify-between text-xs px-1">
                  <span className="text-muted-foreground">推奨販売価格 (利益率30%)</span>
                  <span className="font-semibold text-primary tabular-nums">${costs.suggestedPriceUsd}</span>
                </div>
              )}

              <Button className="w-full h-8 text-xs" variant="outline" onClick={() => handleAction("calculate_costs")} disabled={actionLoading === "calculate_costs"}>
                {actionLoading === "calculate_costs" ? "計算中..." : "費用を再計算"}
              </Button>
            </div>
          </div>

          {/* Dimensions */}
          <div className="rounded-xl bg-card border border-border overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-muted/30">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">サイズ・重量</h3>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2.5">
              {[
                { label: "全長 (cm)", key: "lengthCm", val: item.lengthCm },
                { label: "重量 (g)", key: "weightG", val: item.weightG },
                { label: "幅 (cm)", key: "widthCm", val: item.widthCm },
                { label: "高さ (cm)", key: "heightCm", val: item.heightCm },
              ].map(({ label, key, val }) => (
                <div key={key}>
                  <label className="text-[11px] text-muted-foreground block mb-0.5">{label}</label>
                  <Input
                    type="number"
                    defaultValue={val ?? ""}
                    className="h-8 text-sm"
                    onBlur={async (e) => {
                      const raw = e.target.value;
                      const parsed = raw === "" ? null : parseFloat(raw);
                      const next = Number.isFinite(parsed as number) ? parsed : null;
                      if (next === val) return; // 変更無しは送らない
                      await handleAction("update", { [key]: next });
                      // 寸法・重量変更で送料/利益が変わるので自動再計算
                      await handleAction("calculate_costs");
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Mercari Details */}
          {(item.mercariCondition || item.mercariCategory || item.mercariShippingFrom || item.mercariLikes != null) && (
            <div className="rounded-xl bg-card border border-border overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-muted/30">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">メルカリ詳細</h3>
              </div>
              <div className="px-4 py-3 space-y-2">
                {item.mercariCondition && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">商品の状態</span>
                    <span className={`font-medium ${item.mercariCondition.includes("新品") ? "text-emerald-400" : item.mercariCondition.includes("目立った傷") ? "text-blue-400" : "text-muted-foreground"}`}>
                      {item.mercariCondition}
                    </span>
                  </div>
                )}
                {item.mercariCategory && (
                  <div className="flex items-start justify-between text-xs gap-2">
                    <span className="text-muted-foreground shrink-0">カテゴリ</span>
                    <span className="text-right text-muted-foreground/80">{item.mercariCategory}</span>
                  </div>
                )}
                {item.mercariShippingFrom && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">発送元</span>
                    <span>{item.mercariShippingFrom}</span>
                  </div>
                )}
                {item.mercariLikes != null && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">いいね数</span>
                    <span className="tabular-nums">{item.mercariLikes}</span>
                  </div>
                )}
                {item.mercariListedAt && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">出品日</span>
                    <span>{item.mercariListedAt}</span>
                  </div>
                )}
                {item.mercariFeatures && (() => {
                  try {
                    const features = JSON.parse(item.mercariFeatures);
                    return Object.entries(features).length > 0 ? (
                      <div className="pt-1 border-t border-border/50">
                        <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">特徴</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {Object.entries(features).map(([key, val]) => (
                            <span key={key} className="inline-flex items-center px-2 py-0.5 rounded-md bg-accent text-[10px] text-muted-foreground">
                              {key}: {String(val)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  } catch { return null; }
                })()}
              </div>
            </div>
          )}

          {/* Links */}
          <div className="rounded-xl bg-card border border-border overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-muted/30">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">リンク</h3>
            </div>
            <div className="px-4 py-3 space-y-2">
              <a href={item.mercariUrl} target="_blank" rel="noopener noreferrer"
                 className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                メルカリで見る
              </a>
              {item.ebayListingId && (
                <a href={`https://www.ebay.com/itm/${item.ebayListingId}`} target="_blank" rel="noopener noreferrer"
                   className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                  eBayで見る
                </a>
              )}
            </div>
          </div>

          {/* AI Score - more compact */}
          <div className="rounded-xl bg-card border border-border overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AIスコア</h3>
              <Button size="sm" variant="outline" onClick={handleScore} disabled={scoring} className="text-xs gap-1 h-6 px-2">
                {scoring ? (
                  <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>分析中</>
                ) : (
                  <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" /></svg>AI分析</>
                )}
              </Button>
            </div>
            <div className="px-4 py-3">
              {item.aiScore != null ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`text-2xl font-bold tabular-nums leading-none ${item.aiScore >= 70 ? "text-emerald-400" : item.aiScore >= 40 ? "text-amber-400" : "text-red-400"}`}>
                      {item.aiScore}
                    </div>
                    <div className="flex-1">
                      <div className="h-1.5 rounded-full bg-accent overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${item.aiScore >= 70 ? "bg-emerald-400" : item.aiScore >= 40 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${item.aiScore}%` }} />
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground">/100</span>
                  </div>
                  {item.aiScoreReason && (
                    <p className="text-[11px] text-muted-foreground leading-snug">{item.aiScoreReason}</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-1">未分析 -- AI分析ボタンを押してください</p>
              )}
            </div>
          </div>

          {/* Actions - better visual weight */}
          <div className="space-y-2 pt-1">
            {item.ebayStatus === "draft" && (
              <Button className="w-full gap-2 h-10 text-sm font-semibold shadow-sm shadow-primary/20" onClick={() => {
                if (confirm(`eBay に即時公開します。\nタイトル: ${item.ebayTitle?.slice(0, 60)}\n価格: $${item.ebayPriceUsd}\n\n続行しますか？`)) handleAction("list_on_ebay");
              }} disabled={actionLoading === "list_on_ebay"}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3" /></svg>
                {actionLoading === "list_on_ebay" ? "出品中..." : "eBayに即時出品"}
              </Button>
            )}
            {item.ebayStatus === "listed" && (
              <Button className="w-full h-10 text-sm font-semibold" variant="destructive" onClick={() => handleAction("remove_from_ebay")} disabled={actionLoading === "remove_from_ebay"}>
                {actionLoading === "remove_from_ebay" ? "削除中..." : "eBayから取り下げる"}
              </Button>
            )}
            {item.ebayStatus === "sold" && (
              <a href={item.mercariUrl} target="_blank" rel="noopener noreferrer" className="block">
                <Button className="w-full gap-2 h-10 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" /></svg>
                  メルカリで購入する
                </Button>
              </a>
            )}
            <Button className="w-full text-muted-foreground text-xs h-8" variant="ghost" onClick={() => setConfirmDelete(true)}>
              アイテムを削除
            </Button>
          </div>
        </div>
      </div>
      ) : (
      /* eBay出品 - 最終確認画面 */
      <div className="space-y-4">
        {/* Readiness checklist */}
        {(() => {
          const checks = [
            { key: "images", ok: processedImages.length > 0, label: `画像加工済み (${processedImages.length}枚)` },
            { key: "title", ok: !!item.ebayTitle, label: "タイトル" },
            { key: "description", ok: !!item.ebayDescription, label: "説明文" },
            { key: "price", ok: !!item.ebayPriceUsd, label: "価格設定" },
            { key: "weight", ok: !!item.weightG, label: "重量" },
          ] as const;
          let staffChecks: Record<string, Record<string, string>> = {};
          try { staffChecks = item.staffChecks ? JSON.parse(item.staffChecks) : {}; } catch { /* ignore */ }

          async function toggleCheck(checkKey: string) {
            if (!currentUser || !item) return;
            const token = `${checkKey}:${currentUser.id}`;
            setTogglingCheck(token);
            // 楽観的更新
            const next = { ...staffChecks, [checkKey]: { ...(staffChecks[checkKey] || {}) } };
            if (next[checkKey][currentUser.id]) delete next[checkKey][currentUser.id];
            else next[checkKey][currentUser.id] = new Date().toISOString();
            setItem({ ...item, staffChecks: JSON.stringify(next) });
            try {
              await fetch(`/api/items/${item.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "toggle_staff_check", checkKey, userId: currentUser.id }),
              });
              await fetchItem();
            } finally {
              setTogglingCheck(null);
            }
          }

          const aiOkCount = checks.filter(({ ok }) => ok).length;
          const myCheckedCount = currentUser ? checks.filter(({ key }) => staffChecks[key]?.[currentUser.id]).length : 0;
          const otherUser = staffUsers.find((u) => u.id !== currentUser?.id);
          const otherCheckedCount = otherUser ? checks.filter(({ key }) => staffChecks[key]?.[otherUser.id]).length : 0;
          const allComplete = !!item.listingScheduledAt;

          return (
            <div className={`rounded-xl bg-card border overflow-hidden ${allComplete ? "border-emerald-500/40" : "border-border"}`}>
              <div className="px-4 py-2.5 border-b border-border bg-muted/30">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">出品準備チェック</h3>
                </div>
                {/* 3名のチェック進捗 */}
                <div className="flex items-center gap-4 text-[11px]">
                  <span className={`flex items-center gap-1.5 ${aiOkCount === checks.length ? "text-emerald-400" : "text-muted-foreground"}`}>
                    <span className={`w-2 h-2 rounded-full ${aiOkCount === checks.length ? "bg-emerald-400" : "bg-muted-foreground/40"}`} />
                    AI {aiOkCount}/{checks.length}
                  </span>
                  <span className={`flex items-center gap-1.5 ${myCheckedCount === checks.length ? "text-emerald-400" : "text-muted-foreground"}`}>
                    <span className={`w-2 h-2 rounded-full ${myCheckedCount === checks.length ? "bg-emerald-400" : "bg-muted-foreground/40"}`} />
                    {currentUser?.name?.charAt(0) || "自分"} {myCheckedCount}/{checks.length}
                  </span>
                  {otherUser && (
                    <span className={`flex items-center gap-1.5 ${otherCheckedCount === checks.length ? "text-emerald-400" : "text-muted-foreground"}`}>
                      <span className={`w-2 h-2 rounded-full ${otherCheckedCount === checks.length ? "bg-emerald-400" : "bg-muted-foreground/40"}`} />
                      {otherUser.name.charAt(0)} {otherCheckedCount}/{checks.length}
                    </span>
                  )}
                </div>
              </div>
              <div className="divide-y divide-border/40">
                {checks.map(({ key, ok, label }) => {
                  const myCheck = currentUser ? staffChecks[key]?.[currentUser.id] : null;
                  const otherCheck = otherUser ? staffChecks[key]?.[otherUser.id] : null;
                  const isLoading = currentUser ? togglingCheck === `${key}:${currentUser.id}` : false;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => currentUser && toggleCheck(key)}
                      disabled={!currentUser || isLoading}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/40 ${isLoading ? "opacity-50" : ""}`}
                    >
                      <CheckBox checked={!!myCheck} loading={isLoading} />
                      <span className={`text-[13px] flex-1 ${myCheck ? "text-foreground" : "text-muted-foreground"}`}>
                        {label}
                      </span>
                      <div className="flex items-center gap-2">
                        {!ok && (
                          <span className="text-[10px] text-amber-400/80 bg-amber-400/10 px-1.5 py-0.5 rounded">未設定</span>
                        )}
                        {ok && (
                          <span className="text-[10px] text-emerald-400/70">AI✓</span>
                        )}
                        {otherCheck && (
                          <span className="text-[10px] text-emerald-400/70">{otherUser?.name.charAt(0)}✓</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* 全チェック完了 → 出品予定日 */}
              {allComplete && (
                <div className="px-4 py-3 border-t border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                    <span className="text-[13px] font-medium">3名確認済み</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">出品予定日</span>
                    <span className="text-[13px] font-semibold text-emerald-400 tabular-nums">{item.listingScheduledAt}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Price + action bar */}
        <div className="rounded-xl bg-card border border-border overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">eBay価格</span>
                {editingPrice ? (
                  <form onSubmit={(e) => { e.preventDefault(); savePrice(); }} className="flex items-center gap-1">
                    <span className="text-lg font-bold text-primary">$</span>
                    <input
                      autoFocus
                      className="w-20 text-lg font-bold text-primary tabular-nums bg-transparent border-b border-primary outline-none disabled:opacity-50"
                      value={draftPrice}
                      disabled={savingPrice}
                      onChange={e => setDraftPrice(e.target.value)}
                      onBlur={() => savePrice()}
                      onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); setEditingPrice(false); } }}
                    />
                  </form>
                ) : (
                  <span className="text-lg font-bold text-primary tabular-nums cursor-pointer hover:underline" onClick={() => { setDraftPrice(String(item.ebayPriceUsd || "")); setEditingPrice(true); }}>
                    {item.ebayPriceUsd ? `$${item.ebayPriceUsd}` : "未設定"}
                  </span>
                )}
              </div>
              <div className="h-8 w-px bg-border" />
              <div>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">仕入れ</span>
                <span className="text-sm font-medium tabular-nums">¥{(item.mercariPrice || 0).toLocaleString()}</span>
              </div>
              <div className="h-8 w-px bg-border" />
              <div>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">推定利益</span>
                <span className={`text-lg font-extrabold tabular-nums ${item.estimatedProfitUsd && item.estimatedProfitUsd > 0 ? "text-emerald-400" : item.estimatedProfitUsd && item.estimatedProfitUsd < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                  {item.estimatedProfitUsd != null ? `$${item.estimatedProfitUsd.toFixed(2)}` : "-"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => handleAction("calculate_costs")} disabled={actionLoading === "calculate_costs"}>
                {actionLoading === "calculate_costs" ? "計算中..." : "再計算"}
              </Button>
              {item.ebayStatus === "draft" && (
                <Button className="gap-2 h-10 text-sm font-semibold shadow-sm shadow-primary/20 px-6" onClick={() => {
                  if (confirm(`eBay に即時公開します。\nタイトル: ${item.ebayTitle?.slice(0, 60)}\n価格: $${item.ebayPriceUsd}\n\n続行しますか？`)) handleAction("list_on_ebay");
                }} disabled={actionLoading === "list_on_ebay"}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3" /></svg>
                  {actionLoading === "list_on_ebay" ? "出品中..." : "eBayに即時出品"}
                </Button>
              )}
              {item.ebayStatus === "listed" && (
                <Button className="h-10 text-sm font-semibold" variant="destructive" onClick={() => handleAction("remove_from_ebay")} disabled={actionLoading === "remove_from_ebay"}>
                  {actionLoading === "remove_from_ebay" ? "削除中..." : "eBayから取り下げる"}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* eBay Preview (full width) */}
        <EbayPreview
          item={item}
          mercariImages={allImages}
          processedImages={processedImages}
          previewImage={previewImage}
          setPreviewImage={setPreviewImage}
          generating={generating}
          onGenerate={handleGenerate}
          editingTitle={editingTitle}
          setEditingTitle={setEditingTitle}
          editingDesc={editingDesc}
          setEditingDesc={setEditingDesc}
          draftTitle={draftTitle}
          setDraftTitle={setDraftTitle}
          draftDesc={draftDesc}
          setDraftDesc={setDraftDesc}
          onSave={saveListingText}
        />
      </div>
      )}

      {/* Lightbox overlay */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center cursor-pointer"
          onClick={() => setLightboxImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl font-light z-10"
            onClick={() => setLightboxImage(null)}
          >
            &times;
          </button>
          <img
            src={lightboxImage}
            alt=""
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 rounded-lg px-4 py-2.5 text-[13px] font-medium shadow-lg animate-in slide-in-from-top-2 ${
          toast.type === "success"
            ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 backdrop-blur-sm"
            : "bg-red-500/10 text-red-600 border border-red-500/20 backdrop-blur-sm"
        }`}>
          {toast.text}
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="アイテムを削除"
        description="このアイテムを完全に削除します。この操作は取り消せません。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />

      {/* Keyboard shortcuts help */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setShowShortcuts(false)}>
          <div className="bg-popover rounded-xl p-5 shadow-lg border border-border max-w-xs w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3">キーボードショートカット</h3>
            <div className="space-y-2 text-[13px]">
              {[
                { keys: ["←"], desc: "前のアイテム" },
                { keys: ["→"], desc: "次のアイテム" },
                { keys: ["1"], desc: "出品" },
                { keys: ["2"], desc: "検討" },
                { keys: ["3"], desc: "パス" },
                { keys: ["?"], desc: "ショートカット表示" },
              ].map((s) => (
                <div key={s.desc} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{s.desc}</span>
                  <div className="flex gap-1">
                    {s.keys.map((k) => (
                      <kbd key={k} className="min-w-[24px] h-6 px-1.5 rounded border border-border bg-accent text-[11px] font-mono flex items-center justify-center">{k}</kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowShortcuts(false)} className="mt-4 w-full text-[12px] text-muted-foreground hover:text-foreground text-center">閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────── eBay Listing Preview Component ──────────────── */

function EbayPreview({
  item, mercariImages, processedImages, previewImage, setPreviewImage,
  generating, onGenerate,
  editingTitle, setEditingTitle, editingDesc, setEditingDesc,
  draftTitle, setDraftTitle, draftDesc, setDraftDesc, onSave,
}: {
  item: Item;
  mercariImages: string[];
  processedImages: string[];
  previewImage: number;
  setPreviewImage: (n: number) => void;
  generating: boolean;
  onGenerate: () => void;
  editingTitle: boolean;
  setEditingTitle: (b: boolean) => void;
  editingDesc: boolean;
  setEditingDesc: (b: boolean) => void;
  draftTitle: string;
  setDraftTitle: (s: string) => void;
  draftDesc: string;
  setDraftDesc: (s: string) => void;
  onSave: (field: "ebayTitle" | "ebayDescription", value: string) => void;
}) {
  const listingImages = processedImages.length > 0 ? processedImages : mercariImages;
  const hasListing = item.ebayTitle || item.ebayDescription;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Header - improved with subtle bg */}
      <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-0.5">
            <span className="text-[#e53238] font-bold text-base">e</span>
            <span className="text-[#0064d2] font-bold text-base">b</span>
            <span className="text-[#f5af02] font-bold text-base">a</span>
            <span className="text-[#86b817] font-bold text-base">y</span>
          </div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">出品プレビュー</h3>
          {item.ebayStatus === "listed" && (
            <Badge className="bg-blue-500/20 text-blue-400 text-[10px]">出品中</Badge>
          )}
        </div>
        <Button
          size="sm"
          onClick={onGenerate}
          disabled={generating}
          className="gap-1.5 text-xs h-7"
        >
          {generating ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
              </svg>
              AIで生成中...
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
              </svg>
              {hasListing ? "AIで再生成" : "AIで文言を生成"}
            </>
          )}
        </Button>
      </div>

      {/* eBay-style listing body (white bg like actual eBay) */}
      <div className="bg-white text-gray-900">
        {!hasListing && !generating ? (
          <div className="px-8 py-16 text-center">
            <div className="text-gray-400 mb-3">
              <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
              </svg>
            </div>
            <p className="text-gray-500 text-sm mb-1">まだ出品文が生成されていません</p>
            <p className="text-gray-400 text-xs">上の「AIで文言を生成」ボタンを押してください</p>
          </div>
        ) : generating && !hasListing ? (
          <div className="px-8 py-16 text-center">
            <svg className="w-8 h-8 mx-auto text-blue-500 animate-spin mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
            <p className="text-gray-500 text-sm">AIがeBay出品文を生成中...</p>
          </div>
        ) : (
          <div>
            {/* Top section: Image + Info */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-0">
              {/* Left: Images */}
              <div className="p-4 border-b md:border-b-0 md:border-r border-gray-200">
                <div className="aspect-square bg-gray-50 rounded flex items-center justify-center mb-3 overflow-hidden">
                  {listingImages[previewImage] ? (
                    <img src={listingImages[previewImage]} alt="" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <div className="text-gray-300">No Image</div>
                  )}
                </div>
                {listingImages.length > 1 && (
                  <div className="flex gap-1.5 overflow-x-auto">
                    {listingImages.slice(0, 8).map((url, i) => (
                      <button
                        key={i}
                        onClick={() => setPreviewImage(i)}
                        className={`w-12 h-12 rounded flex-shrink-0 overflow-hidden border-2 transition-all ${i === previewImage ? "border-blue-500" : "border-gray-200 hover:border-gray-400"}`}
                      >
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: Listing info */}
              <div className="p-5 space-y-4">
                {/* Title */}
                <div className="group relative">
                  {editingTitle ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        maxLength={80}
                        className="w-full text-lg font-semibold text-gray-900 border border-blue-400 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-blue-200"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onSave("ebayTitle", draftTitle)}
                          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => setEditingTitle(false)}
                          className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700"
                        >
                          キャンセル
                        </button>
                        <span className="text-[10px] text-gray-400 ml-auto">{draftTitle.length}/80</span>
                      </div>
                    </div>
                  ) : (
                    <h2
                      className="text-lg font-semibold text-gray-900 leading-snug cursor-pointer hover:bg-blue-50 rounded px-1 -mx-1 transition-colors"
                      onClick={() => { setDraftTitle(item.ebayTitle || ""); setEditingTitle(true); }}
                      title="クリックして編集"
                    >
                      {item.ebayTitle || "Untitled Listing"}
                      <svg className="inline w-3 h-3 ml-1 text-gray-300 group-hover:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                      </svg>
                    </h2>
                  )}
                </div>

                {/* Price */}
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-gray-900">
                    US ${item.ebayPriceUsd?.toFixed(2) || "0.00"}
                  </span>
                  <span className="text-xs text-gray-500">approx. ¥{(item.mercariPrice || 0).toLocaleString()}</span>
                </div>

                {/* Condition */}
                <div className="border-t border-gray-200 pt-3 space-y-2">
                  <div className="flex text-sm">
                    <span className="text-gray-500 w-28 flex-shrink-0">Condition</span>
                    <span className="font-medium">Pre-Owned</span>
                  </div>
                  {item.mercariSeller && (
                    <div className="flex text-sm">
                      <span className="text-gray-500 w-28 flex-shrink-0">Seller</span>
                      <span>{item.mercariSeller}</span>
                    </div>
                  )}
                  <div className="flex text-sm">
                    <span className="text-gray-500 w-28 flex-shrink-0">Ships from</span>
                    <span>Japan</span>
                  </div>
                  {item.shippingCostUsd && (
                    <div className="flex text-sm">
                      <span className="text-gray-500 w-28 flex-shrink-0">Shipping</span>
                      <span>US ${item.shippingCostUsd.toFixed(2)} (FedEx International Priority)</span>
                    </div>
                  )}
                </div>

                {/* Item specifics */}
                <div className="border-t border-gray-200 pt-3">
                  <h4 className="text-sm font-semibold mb-2 text-gray-700">Item specifics</h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    {(() => {
                      let aspects: Record<string, string[]> = {};
                      try { if (item.ebayAspects) aspects = JSON.parse(item.ebayAspects); } catch { /* */ }
                      const hasAspects = Object.keys(aspects).length > 0;

                      if (hasAspects) {
                        return Object.entries(aspects).map(([key, values]) => (
                          <div key={key} className="flex">
                            <span className="text-gray-500 w-24 flex-shrink-0 text-xs">{key}</span>
                            <span className="font-medium text-xs">{(values as string[]).join(", ")}</span>
                          </div>
                        ));
                      }
                      // フォールバック: 自動検出
                      return (
                        <>
                          <div className="flex">
                            <span className="text-gray-500 w-20 flex-shrink-0">Type</span>
                            <span className="font-medium">{detectItemType(item.mercariTitle, item.mercariDescription || "")}</span>
                          </div>
                          <div className="flex">
                            <span className="text-gray-500 w-20 flex-shrink-0">Origin</span>
                            <span className="font-medium">Japan</span>
                          </div>
                        </>
                      );
                    })()}
                    {item.lengthCm && (
                      <div className="flex">
                        <span className="text-gray-500 w-24 flex-shrink-0 text-xs">Length</span>
                        <span className="text-xs">{item.lengthCm} cm / {(item.lengthCm / 2.54).toFixed(1)}&quot;</span>
                      </div>
                    )}
                    {item.weightG && (
                      <div className="flex">
                        <span className="text-gray-500 w-24 flex-shrink-0 text-xs">Weight</span>
                        <span className="text-xs">{item.weightG}g / {(item.weightG / 453.592).toFixed(2)} lbs</span>
                      </div>
                    )}
                    {item.widthCm && (
                      <div className="flex">
                        <span className="text-gray-500 w-24 flex-shrink-0 text-xs">Width</span>
                        <span className="text-xs">{item.widthCm} cm</span>
                      </div>
                    )}
                    {item.heightCm && (
                      <div className="flex">
                        <span className="text-gray-500 w-24 flex-shrink-0 text-xs">Height</span>
                        <span className="text-xs">{item.heightCm} cm</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Buy it now button (decorative) */}
                <div className="pt-2 space-y-2">
                  <div className="w-full py-2.5 rounded-full bg-[#3665f3] text-white text-center text-sm font-semibold">
                    Buy It Now
                  </div>
                  <div className="w-full py-2.5 rounded-full border border-[#3665f3] text-[#3665f3] text-center text-sm font-semibold">
                    Add to cart
                  </div>
                </div>
              </div>
            </div>

            {/* Description section */}
            <div className="border-t border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-700">Item description</h4>
                {!editingDesc && item.ebayDescription && (
                  <button
                    onClick={() => { setDraftDesc(item.ebayDescription || ""); setEditingDesc(true); }}
                    className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                    </svg>
                    編集
                  </button>
                )}
              </div>
              {editingDesc ? (
                <div className="space-y-2">
                  <textarea
                    value={draftDesc}
                    onChange={(e) => setDraftDesc(e.target.value)}
                    rows={12}
                    className="w-full text-sm text-gray-800 border border-blue-400 rounded p-3 outline-none focus:ring-2 focus:ring-blue-200 font-mono leading-relaxed"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onSave("ebayDescription", draftDesc)}
                      className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setEditingDesc(false)}
                      className="px-4 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              ) : item.ebayDescription ? (
                <div
                  className="text-sm text-gray-700 leading-relaxed prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: item.ebayDescription }}
                />
              ) : (
                <p className="text-sm text-gray-400 italic">No description generated yet</p>
              )}
            </div>

            {/* Japanese translation (for wording QA) — collapsed by default */}
            {(item.ebayTitleJa || item.ebayDescriptionJa || item.ebayAspectsJa) && (
              <JapaneseTranslationPanel item={item} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function JapaneseTranslationPanel({ item }: { item: Item }) {
  const [open, setOpen] = useState(true);
  let aspectsJa: Record<string, string[]> = {};
  try { if (item.ebayAspectsJa) aspectsJa = JSON.parse(item.ebayAspectsJa); } catch { /* */ }
  const hasAspectsJa = Object.keys(aspectsJa).length > 0;

  return (
    <div className="border-t border-gray-200 bg-amber-50/40">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-amber-50/70 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 0 1 6.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
          </svg>
          <span className="text-sm font-semibold text-gray-700">日本語訳（文言チェック用）</span>
          <span className="text-[10px] text-gray-500">eBayには出品されません</span>
        </div>
        <svg className={`w-4 h-4 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4">
          {item.ebayTitleJa && (
            <div>
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">タイトル</div>
              <p className="text-base font-semibold text-gray-900 leading-snug">{item.ebayTitleJa}</p>
            </div>
          )}
          {hasAspectsJa && (
            <div>
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Item specifics</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {Object.entries(aspectsJa).map(([key, values]) => (
                  <div key={key} className="flex">
                    <span className="text-gray-500 w-24 flex-shrink-0 text-xs">{key}</span>
                    <span className="font-medium text-xs">{(values as string[]).join("、")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {item.ebayDescriptionJa && (
            <div>
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Item description</div>
              <div
                className="text-sm text-gray-700 leading-relaxed prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: item.ebayDescriptionJa }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function detectItemType(title: string, description: string): string {
  const text = title + description;
  if (/兜/.test(text)) return "Kabuto (Helmet)";
  if (/甲冑|鎧/.test(text)) return "Yoroi (Armor)";
  if (/面頬/.test(text)) return "Menpo (Face Guard)";
  if (/鍔/.test(text)) return "Tsuba (Sword Guard)";
  if (/目貫/.test(text)) return "Menuki (Fitting)";
  if (/短刀/.test(text)) return "Tanto";
  if (/脇差/.test(text)) return "Wakizashi";
  if (/太刀/.test(text)) return "Tachi";
  if (/軍刀/.test(text)) return "Gunto (Military)";
  if (/居合/.test(text)) return "Iaito (Practice)";
  if (/模造刀/.test(text)) return "Replica";
  if (/日本刀|刀/.test(text)) return "Katana";
  return "Japanese Antique";
}
