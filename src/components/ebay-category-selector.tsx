"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Suggestion {
  categoryId: string;
  categoryName: string;
  categoryPath: string;
}

interface Props {
  itemId: string;
  // タイトル/説明文を Taxonomy API のクエリ初期値に使う
  seedTitle: string | null | undefined;
  seedDescription: string | null | undefined;
  currentCategoryId: string | null | undefined;
  currentCategoryPath: string | null | undefined;
  // kabutoCategory ベースの自動マッピング ID (参考表示用)
  fallbackCategoryId: string | null | undefined;
  fallbackLabel: string | null | undefined;
  onSaved: () => Promise<void> | void;
}

export function EbayCategorySelector({
  itemId,
  seedTitle,
  seedDescription,
  currentCategoryId,
  currentCategoryPath,
  fallbackCategoryId,
  fallbackLabel,
  onSaved,
}: Props) {
  // 未選択のアイテムは最初から開いておく (ユーザがどこを触ればいいか即わかるように)
  const [open, setOpen] = useState(!currentCategoryId);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedInitial, setHasLoadedInitial] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function fetchSuggestions(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/ebay/category-suggestions?q=${encodeURIComponent(q)}`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      const data = (await res.json()) as { suggestions: Suggestion[] };
      setSuggestions(data.suggestions.slice(0, 10));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }

  // 初回展開時にタイトルからサジェスト (説明文は HTML タグや冗長な情報が多く Taxonomy API のノイズになる)
  useEffect(() => {
    if (!open || hasLoadedInitial) return;
    const seed = (seedTitle ?? "")
      .replace(/<[^>]*>/g, " ") // 念のため HTML タグ除去
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80); // eBay Taxonomy は短く端的なキーワードが効く
    if (seed) {
      setQuery(seed);
      fetchSuggestions(seed);
    }
    setHasLoadedInitial(true);
  }, [open, hasLoadedInitial, seedTitle]);

  // 検索ボックスのデバウンス
  function onQueryChange(v: string) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (v.trim()) fetchSuggestions(v);
      else setSuggestions([]);
    }, 400);
  }

  async function save(s: Suggestion) {
    setSaving(s.categoryId);
    try {
      const res = await fetch(`/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ebayCategoryId: s.categoryId,
          ebayCategoryPath: s.categoryPath,
        }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      await onSaved();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  }

  async function clear() {
    setSaving("clear");
    try {
      await fetch(`/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ebayCategoryId: null,
          ebayCategoryPath: null,
        }),
      });
      await onSaved();
    } finally {
      setSaving(null);
    }
  }

  const selected = !!currentCategoryId;
  const displayLabel = currentCategoryPath
    ? currentCategoryPath
    : currentCategoryId
      ? `ID: ${currentCategoryId}`
      : fallbackCategoryId
        ? `自動: ${fallbackLabel ?? "Kabuto"} (ID ${fallbackCategoryId})`
        : "未選択";

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          eBay カテゴリ
        </h3>
        <div className="flex items-center gap-2">
          {selected && (
            <span className="text-[10px] text-emerald-400/80 bg-emerald-500/10 px-1.5 py-0.5 rounded">
              選択済
            </span>
          )}
          {!selected && (
            <span className="text-[10px] text-amber-400/80 bg-amber-400/10 px-1.5 py-0.5 rounded">
              未選択 (自動マッピング使用)
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <span
            className={`text-[13px] flex-1 truncate ${selected ? "text-foreground" : "text-muted-foreground"}`}
            title={displayLabel}
          >
            {displayLabel}
          </span>
          <Button
            type="button"
            size="sm"
            variant={open ? "secondary" : selected ? "outline" : "default"}
            className="text-[13px] sm:text-xs h-10 sm:h-7 px-4 sm:px-2.5"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "閉じる" : selected ? "変更" : "カテゴリを選ぶ"}
          </Button>
          {selected && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-[13px] sm:text-xs h-10 sm:h-7 text-muted-foreground"
              onClick={clear}
              disabled={saving === "clear"}
            >
              {saving === "clear" ? "..." : "解除"}
            </Button>
          )}
        </div>

        {open && (
          <div className="space-y-3 pt-2 border-t border-border/40">
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">
                検索 (タイトルや英単語、なるべく短く)
              </label>
              <div className="relative">
                <Input
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  placeholder="例: samurai helmet, kabuto, lacquer box"
                  className="h-10 sm:h-9 text-[15px] sm:text-[13px] pr-8"
                  autoFocus
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => { setQuery(""); setSuggestions([]); }}
                    aria-label="検索をクリア"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground rounded"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              {/* 1クリック検索ショートカット - 漢字タイトルを英語キーワードに置き換えるのは面倒なので、よく使うのを並べる */}
              <div className="flex flex-wrap gap-1 pt-1">
                {["samurai helmet", "kabuto", "lacquer box", "netsuke", "ukiyo-e print", "sword tsuba", "ceramic tea bowl", "ivory"].map((kw) => (
                  <button
                    key={kw}
                    type="button"
                    onClick={() => { setQuery(kw); fetchSuggestions(kw); }}
                    className="text-[11px] px-2 py-1 rounded border border-border/60 text-muted-foreground hover:border-border hover:text-foreground transition-colors"
                  >
                    {kw}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">
                {error}
              </div>
            )}

            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                <span>サジェスト</span>
                {loading && <span className="text-muted-foreground/60">読み込み中...</span>}
              </div>
              {!loading && suggestions.length === 0 && (
                <div className="text-[12px] text-muted-foreground/70 py-2">
                  検索語を入力するとサジェストが表示されます
                </div>
              )}
              <div className="divide-y divide-border/40 rounded border border-border/40 max-h-64 overflow-y-auto">
                {suggestions.map((s) => {
                  const isCurrent = s.categoryId === currentCategoryId;
                  return (
                    <button
                      key={s.categoryId}
                      type="button"
                      className={`w-full text-left px-3 py-2 hover:bg-accent/40 transition-colors flex items-start gap-2 ${
                        isCurrent ? "bg-emerald-500/5" : ""
                      }`}
                      onClick={() => save(s)}
                      disabled={saving !== null}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate">
                          {s.categoryName}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {s.categoryPath}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-muted-foreground/70 tabular-nums">
                          {s.categoryId}
                        </span>
                        {isCurrent ? (
                          <span className="text-[10px] text-emerald-400">✓</span>
                        ) : saving === s.categoryId ? (
                          <span className="text-[10px] text-muted-foreground">...</span>
                        ) : (
                          <span className="text-[10px] text-primary">選択</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
