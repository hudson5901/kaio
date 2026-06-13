"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface AppSettings {
  profitMarginPercent: number;
  ebayFeePercent: number;
  adPercent: number;
  customsDutyPercent: number;
  salesTaxPercent: number;
  shippingDiscountPercent: number;
  defaultWeightG: number;
  autoSyncEnabled: boolean;
  autoSyncIntervalMinutes: number;
}

// 入力フィールドのバリデーション仕様
type NumericKey = Exclude<keyof AppSettings, "autoSyncEnabled">;
const FIELD_SPEC: Record<NumericKey, { min: number; max: number; integer?: boolean; label: string }> = {
  profitMarginPercent: { min: 0, max: 100, label: "利益マージン" },
  ebayFeePercent: { min: 0, max: 100, label: "eBay手数料率" },
  adPercent: { min: 0, max: 100, label: "広告費率" },
  customsDutyPercent: { min: 0, max: 100, label: "関税率" },
  salesTaxPercent: { min: 0, max: 100, label: "売上税率" },
  shippingDiscountPercent: { min: 0, max: 95, label: "送料割引率" },
  defaultWeightG: { min: 1, max: 100000, integer: true, label: "デフォルト重量" },
  autoSyncIntervalMinutes: { min: 10, max: 1440, integer: true, label: "自動同期間隔" },
};

export default function SettingsPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  // 入力中の生の文字列を保持 (空文字 / NaN を正しく扱うため)
  const [drafts, setDrafts] = useState<Record<NumericKey, string>>({} as Record<NumericKey, string>);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rateInfo, setRateInfo] = useState<{ rate: number; source: string; updatedAt: string | null } | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // 認証確認 (admin/users と同じパターン)
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((me) => {
        if (me?.error || !me?.id) { router.push("/login"); return; }
        setAuthChecked(true);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  useEffect(() => {
    if (!authChecked) return;
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d === "object" && "profitMarginPercent" in d) {
          setSettings(d);
          const next: Partial<Record<NumericKey, string>> = {};
          for (const k of Object.keys(FIELD_SPEC) as NumericKey[]) {
            next[k] = String((d as AppSettings)[k] ?? "");
          }
          setDrafts(next as Record<NumericKey, string>);
        }
      })
      .catch(() => {});
    fetch("/api/exchange-rate")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.rate) setRateInfo(d); })
      .catch(() => {});
  }, [authChecked]);

  useEffect(() => () => { if (savedTimerRef.current) clearTimeout(savedTimerRef.current); }, []);

  // ドラフト文字列をパースして検証エラーを返す
  function getFieldError(key: NumericKey, raw: string): string | null {
    const spec = FIELD_SPEC[key];
    const trimmed = raw.trim();
    if (trimmed === "") return "入力してください";
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return "数値として無効です";
    if (spec.integer && !Number.isInteger(n)) return "整数を入力してください";
    if (n < spec.min) return `${spec.min}以上で入力してください`;
    if (n > spec.max) return `${spec.max}以下で入力してください`;
    return null;
  }

  const fieldErrors: Partial<Record<NumericKey, string>> = {};
  for (const k of Object.keys(FIELD_SPEC) as NumericKey[]) {
    const e = getFieldError(k, drafts[k] ?? "");
    if (e) fieldErrors[k] = e;
  }
  const hasErrors = Object.keys(fieldErrors).length > 0;

  function updateDraft(key: NumericKey, raw: string) {
    setDrafts((prev) => ({ ...prev, [key]: raw }));
    setSaved(false);
    setSaveError(null);
  }

  async function handleSave() {
    if (!settings || hasErrors) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      // 全フィールドが検証済みなので、ここで数値化
      const next: AppSettings = { ...settings };
      for (const k of Object.keys(FIELD_SPEC) as NumericKey[]) {
        (next as Record<NumericKey, number>)[k] = Number(drafts[k]);
      }
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        setSaveError(`保存に失敗しました (HTTP ${res.status}${txt ? `: ${txt.slice(0, 200)}` : ""})`);
      } else {
        setSettings(next);
        setSaved(true);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaved(false), 3000);
      }
    } catch (e) {
      setSaveError(`保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  if (!authChecked || !settings) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="w-6 h-6 text-primary animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
        </svg>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">設定</h1>
        <p className="text-xs text-muted-foreground mt-0.5">費用パラメータとAPI設定</p>
      </div>

      {/* Cost Settings */}
      <div className="rounded-xl bg-card border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold">送料・費用パラメータ</h3>
            <p className="text-[11px] text-muted-foreground">利益計算に使用するパラメータ（変更は即座に反映）</p>
          </div>
        </div>
        <div className="p-4 space-y-4">
          {/* Live Exchange Rate */}
          <div className="rounded-lg bg-accent/50 p-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">現在の為替レート (USD/JPY)</p>
              <p className="text-xl font-bold mt-0.5">
                {rateInfo ? `¥${rateInfo.rate.toFixed(2)}` : "読み込み中..."}
              </p>
              {rateInfo && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {rateInfo.source === "live" ? "リアルタイム" : rateInfo.source === "cached" ? "キャッシュ" : "フォールバック"}
                  {rateInfo.updatedAt && ` (${new Date(rateInfo.updatedAt).toLocaleString("ja-JP")})`}
                </p>
              )}
            </div>
            <div className={`w-3 h-3 rounded-full ${rateInfo?.source === "fallback" ? "bg-amber-400" : "bg-emerald-400"} animate-pulse`} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              { key: "profitMarginPercent", label: "利益マージン (%)", step: "0.1" },
              { key: "ebayFeePercent", label: "eBay手数料率 (%)", step: "0.1" },
              { key: "adPercent", label: "広告費率 (%)", step: "0.1" },
              { key: "customsDutyPercent", label: "関税率 (%)", step: "0.1" },
              { key: "salesTaxPercent", label: "売上税率 (%)", step: "0.1" },
              { key: "shippingDiscountPercent", label: "送料割引率 (%, eLogi等)", step: "1", hint: "FedEx List Rate に対する割引率。50 = 半額。" },
              { key: "defaultWeightG", label: "デフォルト重量 (g)", step: "1" },
              { key: "autoSyncIntervalMinutes", label: "自動同期間隔 (分)", step: "1" },
            ] as { key: NumericKey; label: string; step: string; hint?: string }[]).map((f) => {
              const spec = FIELD_SPEC[f.key];
              const err = fieldErrors[f.key];
              return (
                <div key={f.key}>
                  <label className="text-[12px] sm:text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">{f.label}</label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={drafts[f.key] ?? ""}
                    onChange={(e) => updateDraft(f.key, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "e" || e.key === "E") e.preventDefault(); }}
                    className={`h-11 sm:h-9 ${err ? "border-red-500 focus-visible:ring-red-500/30" : ""}`}
                    step={f.step}
                    min={spec.min}
                    max={spec.max}
                    aria-invalid={!!err}
                    aria-describedby={err ? `${f.key}-err` : undefined}
                  />
                  {err && <p id={`${f.key}-err`} className="text-[12px] sm:text-[10px] text-red-500 mt-1">{err}</p>}
                  {!err && f.hint && <p className="text-[12px] sm:text-[10px] text-muted-foreground/70 mt-1">{f.hint}</p>}
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            <Button onClick={handleSave} disabled={saving || hasErrors} className="gap-2 h-11 sm:h-9 w-full sm:w-auto">
              {saved ? (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                  保存しました
                </>
              ) : saving ? "保存中..." : hasErrors ? "入力エラーを修正してください" : "設定を保存"}
            </Button>
            {saveError && (
              <p className="text-xs text-red-500">{saveError}</p>
            )}
          </div>
        </div>
      </div>

      {/* API Keys Status */}
      <div className="rounded-xl bg-card border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" /></svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold">API設定</h3>
            <p className="text-[11px] text-muted-foreground">.env.local で設定（サーバー再起動で反映）</p>
          </div>
        </div>
        <div className="p-4 space-y-2">
          {[
            { name: "eBay API", envKeys: ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"], desc: "出品・在庫管理" },
            { name: "remove.bg API", envKeys: ["REMOVE_BG_API_KEY"], desc: "背景除去（黒背景加工）" },
            { name: "Anthropic API", envKeys: ["ANTHROPIC_API_KEY"], desc: "AI英語テキスト生成" },
          ].map(({ name, envKeys, desc }) => (
            <div key={name} className="flex items-center justify-between py-1.5">
              <div>
                <p className="text-sm font-medium">{name}</p>
                <p className="text-[11px] text-muted-foreground">{desc}</p>
                <p className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">{envKeys.join(", ")}</p>
              </div>
              <span className="text-xs text-muted-foreground">.env.local で設定</span>
            </div>
          ))}
        </div>
      </div>

      {/* Env template */}
      <div className="rounded-xl bg-card border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" /></svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold">.env.local テンプレート</h3>
              <p className="text-[11px] text-muted-foreground">プロジェクトルートに配置</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(envTemplate);
              alert("クリップボードにコピーしました");
            }}
            className="gap-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg>
            コピー
          </Button>
        </div>
        <div className="p-4">
          <pre className="text-xs bg-accent/50 p-3 rounded-lg overflow-x-auto font-mono leading-relaxed text-muted-foreground">
{envTemplate}
          </pre>
        </div>
      </div>
    </div>
  );
}

const envTemplate = `# eBay API
EBAY_CLIENT_ID=your_client_id
EBAY_CLIENT_SECRET=your_client_secret
EBAY_REDIRECT_URI=http://localhost:3000/api/ebay/callback
EBAY_SANDBOX=true

# eBay Business Policies
EBAY_FULFILLMENT_POLICY_ID=your_policy_id
EBAY_PAYMENT_POLICY_ID=your_policy_id
EBAY_RETURN_POLICY_ID=your_policy_id
EBAY_LOCATION_KEY=default

# Image Processing
REMOVE_BG_API_KEY=your_remove_bg_key

# AI Generation
ANTHROPIC_API_KEY=your_anthropic_key

# App
NEXT_PUBLIC_BASE_URL=http://localhost:3000`;
