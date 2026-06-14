"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const presets = [
  // 武具・刀剣
  { label: "日本刀", keyword: "日本刀" },
  { label: "刀 居合", keyword: "刀 居合" },
  { label: "脇差", keyword: "脇差" },
  { label: "短刀", keyword: "短刀" },
  { label: "太刀", keyword: "太刀" },
  { label: "模造刀", keyword: "模造刀" },
  { label: "兜", keyword: "兜 甲冑" },
  { label: "鎧", keyword: "鎧 甲冑" },
  { label: "鍔", keyword: "鍔 刀装具" },
  // 美術品・骨董
  { label: "衝立", keyword: "衝立 アンティーク" },
  { label: "屏風", keyword: "屏風 古美術" },
  { label: "置物", keyword: "置物 木彫 アンティーク" },
  { label: "招き猫", keyword: "招き猫 古い" },
  { label: "日本酒", keyword: "日本酒 古酒" },
  { label: "徳利・盃", keyword: "徳利 盃 酒器" },
  { label: "茶道具", keyword: "茶道具 茶碗" },
  { label: "茶釜", keyword: "茶釜 茶道" },
  { label: "漆器", keyword: "漆器 蒔絵" },
  { label: "重箱", keyword: "重箱 蒔絵" },
  { label: "掛軸", keyword: "掛軸 古美術" },
  { label: "書画", keyword: "書画 水墨画" },
  // 金工・茶釜・銅器
  { label: "鉄瓶", keyword: "鉄瓶 南部鉄器" },
  { label: "銅器", keyword: "銅器 古美術" },
  // 仏教・宗教美術
  { label: "仏像", keyword: "仏像 木彫" },
  { label: "観音", keyword: "観音 仏像" },
  // 浮世絵
  { label: "浮世絵", keyword: "浮世絵 木版画" },
  { label: "錦絵", keyword: "錦絵 アンティーク" },
  // 日本人形
  { label: "雛人形", keyword: "雛人形 古い" },
  { label: "市松人形", keyword: "市松人形 アンティーク" },
  // 印籠・根付
  { label: "印籠", keyword: "印籠 アンティーク" },
  { label: "根付", keyword: "根付 ねつけ" },
  // 着物
  { label: "着物", keyword: "着物 アンティーク 正絹" },
  { label: "帯", keyword: "帯 袋帯 アンティーク" },
  // 焼物
  { label: "伊万里", keyword: "伊万里 古伊万里" },
  { label: "有田焼", keyword: "有田焼 アンティーク" },
  { label: "九谷焼", keyword: "九谷焼 アンティーク" },
  { label: "備前焼", keyword: "備前焼 茶碗" },
  // 香道具
  { label: "香炉", keyword: "香炉 古美術" },
  // 家具
  { label: "箪笥", keyword: "箪笥 アンティーク 和家具" },
  { label: "船箪笥", keyword: "船箪笥" },
  // 古銭
  { label: "古銭", keyword: "古銭 寛永通宝" },
  { label: "古紙幣", keyword: "古紙幣 アンティーク" },
  // ガラス
  { label: "江戸切子", keyword: "江戸切子" },
  { label: "薩摩切子", keyword: "薩摩切子" },
  // 文房具
  { label: "硯", keyword: "硯 書道具" },
];

interface PipelineStep {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error" | "skipped";
  processed: number;
  total: number;
  errors: string[];
}

interface PipelineState {
  running: boolean;
  startedAt: string | null;
  keyword: string;
  maxItems: number;
  autoProcess: boolean;
  steps: PipelineStep[];
}

export default function ScrapePage() {
  const [keyword, setKeyword] = useState("兜 甲冑");
  const [maxItems, setMaxItems] = useState(100);
  const [autoProcess, setAutoProcess] = useState(true);
  const [state, setState] = useState<PipelineState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function ensurePolling() {
    if (pollRef.current) return; // 既に走ってる
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch("/api/pipeline");
        if (!r.ok) return;
        const d = await r.json();
        setState(d);
        if (!d.running && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch { /* ignore */ }
    }, 2000);
  }

  // Poll server state (初回ロードのみ。fetchState はクロージャ参照)
  useEffect(() => {
    fetchState();
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    // 初回のみ実行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchState() {
    try {
      const res = await fetch("/api/pipeline");
      if (!res.ok) return;
      const data = await res.json();
      setState(data);
      if (data.running) ensurePolling();
    } catch { /* ignore */ }
  }

  async function startPipeline() {
    setError(null);
    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", keyword, maxItems, autoProcess }),
      });
      const raw = await res.text();
      let data: Record<string, unknown> = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { /* ignore */ }
      if (!res.ok || data.error) {
        setError(String(data.error || res.statusText));
        return;
      }
      fetchState();
      ensurePolling();
    } catch (err) {
      setError(`ネットワークエラー: ${err instanceof Error ? err.message : err}`);
    }
  }

  async function stopPipeline() {
    await fetch("/api/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    });
    setTimeout(fetchState, 1000);
  }

  async function runStep(stepId: string, stepAction: string) {
    setError(null);
    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_step", stepId, stepAction }),
      });
      const raw = await res.text();
      let data: Record<string, unknown> = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { /* ignore */ }
      if (!res.ok || data.error) {
        setError(String(data.error || res.statusText));
        return;
      }
      fetchState();
      ensurePolling();
    } catch (err) {
      setError(`ネットワークエラー: ${err instanceof Error ? err.message : err}`);
    }
  }

  const running = state?.running ?? false;
  const steps = state?.steps ?? [];
  const totalProcessed = steps.reduce((s, step) => s + step.processed, 0);
  const activeStep = steps.find((s) => s.status === "running");
  const hasProgress = steps.some((s) => s.status !== "pending");

  return (
    <div className="max-w-2xl mx-auto space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="text-center space-y-1.5 pt-2">
        <h1 className="text-[22px] sm:text-xl font-bold tracking-tight">スクレイピング</h1>
        <p className="text-[12px] sm:text-xs text-muted-foreground px-2">
          メルカリから取得 → 詳細情報 → 画像処理 → 費用計算を自動実行
        </p>
        {running && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            サーバーで処理中 — ページを離れてもOK
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 flex items-start justify-between gap-2">
          <span className="text-xs text-red-400">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400/60 hover:text-red-400 text-xs shrink-0">×</button>
        </div>
      )}

      {/* Search Form */}
      <div className="rounded-xl bg-card border border-border p-4 space-y-4">
        {/* Presets — horizontal scroll on mobile so they don't crush */}
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-2">
            クイック検索
          </label>
          <div className="flex sm:flex-wrap gap-2 overflow-x-auto sm:overflow-visible no-scrollbar -mx-1 px-1">
            {presets.map((p) => (
              <button
                key={p.keyword}
                onClick={() => setKeyword(p.keyword)}
                disabled={running}
                className={`shrink-0 px-3.5 py-2.5 sm:py-1.5 rounded-lg text-[13px] sm:text-xs font-medium transition-colors whitespace-nowrap ${
                  keyword === p.keyword
                    ? "bg-primary text-primary-foreground"
                    : "bg-accent text-muted-foreground hover:text-foreground"
                } disabled:opacity-50`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Keyword + Count — stack on mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-2">
              検索キーワード
            </label>
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="兜 甲冑"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              className="h-11 sm:h-9 text-[15px] sm:text-sm"
              disabled={running}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-2">
              取得件数
            </label>
            <div className="flex gap-1.5">
              {[100, 500, 1000, 3000].map((n) => (
                <button
                  key={n}
                  onClick={() => setMaxItems(n)}
                  disabled={running}
                  className={`flex-1 py-3 sm:py-2 rounded-lg text-[13px] sm:text-xs font-medium transition-colors tabular-nums ${
                    maxItems === n
                      ? "bg-primary text-primary-foreground"
                      : "bg-accent text-muted-foreground hover:text-foreground"
                  } disabled:opacity-50`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Auto-process toggle — bigger switch on mobile */}
        <label className="flex items-center gap-3 cursor-pointer py-1 min-w-0">
          <div
            onClick={() => !running && setAutoProcess(!autoProcess)}
            className={`relative w-12 h-7 sm:w-10 sm:h-5 rounded-full transition-colors flex-shrink-0 ${
              autoProcess ? "bg-primary" : "bg-accent"
            }`}
          >
            <div
              className={`absolute top-0.5 w-6 h-6 sm:w-4 sm:h-4 rounded-full bg-white transition-transform ${
                autoProcess ? "translate-x-[22px] sm:translate-x-5" : "translate-x-0.5"
              }`}
            />
          </div>
          <span className="text-[13px] sm:text-sm text-muted-foreground min-w-0 leading-snug">
            <span className="sm:hidden">取得後に自動処理</span>
            <span className="hidden sm:inline">スクレイプ後に自動処理（詳細取得・画像処理・費用計算）</span>
          </span>
        </label>

        {/* Submit / Stop */}
        <div className="flex gap-2 sm:gap-3">
          <Button
            onClick={startPipeline}
            disabled={running}
            className="flex-1 h-12 sm:h-10 text-[14px] sm:text-sm font-semibold gap-2 min-w-0"
          >
            {running ? (
              <>
                <svg className="w-4 h-4 animate-spin-slow shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                </svg>
                <span className="truncate">{activeStep ? `${activeStep.label}中...` : "処理中..."}</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                </svg>
                パイプライン実行
              </>
            )}
          </Button>
          {running && (
            <Button variant="destructive" onClick={stopPipeline} className="h-12 sm:h-10 px-5 shrink-0">
              停止
            </Button>
          )}
        </div>
      </div>

      {/* Pipeline Progress */}
      {hasProgress && (
        <div className="rounded-xl bg-card border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold">処理パイプライン</h3>
            <div className="flex items-center gap-3">
              {totalProcessed > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  合計 {totalProcessed} 件処理
                </span>
              )}
              {state?.startedAt && (
                <span className="text-[10px] text-muted-foreground/50">
                  {new Date(state.startedAt).toLocaleTimeString("ja-JP")} 開始
                </span>
              )}
            </div>
          </div>

          <div className="divide-y divide-border">
            {steps.map((step) => (
              <div key={step.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {/* Status icon */}
                  <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center text-sm flex-shrink-0">
                    {step.status === "running" ? (
                      <svg className="w-4 h-4 text-primary animate-spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                      </svg>
                    ) : step.status === "done" ? (
                      <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                    ) : step.status === "error" ? (
                      <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                      </svg>
                    ) : step.status === "skipped" ? (
                      <svg className="w-4 h-4 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061A1.125 1.125 0 0 1 3 16.811V8.69ZM12.75 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061a1.125 1.125 0 0 1-1.683-.977V8.69Z" />
                      </svg>
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${
                        step.status === "running" ? "text-primary" :
                        step.status === "done" ? "text-emerald-400" :
                        step.status === "skipped" ? "text-muted-foreground/40" :
                        "text-muted-foreground"
                      }`}>
                        {step.label}
                        {step.status === "skipped" && <span className="text-xs ml-1">(skip)</span>}
                      </span>
                      {step.total > 0 && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {step.processed} / {step.total}
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    {(step.status === "running" || step.status === "done") && step.total > 0 && (
                      <div className="mt-2 h-1.5 rounded-full bg-accent overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            step.status === "done" ? "bg-emerald-400" : "bg-primary"
                          }`}
                          style={{ width: `${Math.min((step.processed / step.total) * 100, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Errors */}
                {step.errors.length > 0 && (
                  <div className="mt-2 ml-11 text-[11px] text-red-400/80 space-y-0.5">
                    {step.errors.slice(-3).map((err, i) => (
                      <p key={i} className="truncate">{err}</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick re-process for existing items */}
      <div className="rounded-xl bg-card/50 border border-border/50 p-4 space-y-2.5">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          既存アイテムの再処理
        </h3>
        <p className="text-[11px] text-muted-foreground/60">
          スクレイプ済みアイテムに対して個別実行
        </p>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={running} className="h-10 sm:h-8 text-[13px] sm:text-[12px]"
            onClick={() => runStep("details", "fetch_details")}>
            詳細取得
          </Button>
          <Button variant="outline" size="sm" disabled={running} className="h-10 sm:h-8 text-[13px] sm:text-[12px]"
            onClick={() => runStep("images", "infer_images")}>
            画像取得
          </Button>
          <Button variant="outline" size="sm" disabled={running} className="h-10 sm:h-8 text-[13px] sm:text-[12px]"
            onClick={() => runStep("images", "process_images")}>
            画像処理
          </Button>
          <Button variant="outline" size="sm" disabled={running} className="h-10 sm:h-8 text-[13px] sm:text-[12px]"
            onClick={() => runStep("costs", "calculate_costs")}>
            費用計算
          </Button>
        </div>
      </div>
    </div>
  );
}
