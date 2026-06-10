/**
 * 為替レート取得モジュール
 *
 * 無料API (exchangerate-api.com) を使用して最新のUSD/JPYレートを取得。
 * メモリキャッシュ（1時間）で API 呼び出しを最小化。
 */

const CACHE_TTL_MS = 60 * 60 * 1000; // 1時間
const FALLBACK_RATE = 155;

let cachedRate: { rate: number; fetchedAt: number } | null = null;

/**
 * 最新の USD → JPY レートを取得
 * キャッシュ有効期限内ならキャッシュを返す
 */
export async function getExchangeRate(): Promise<number> {
  if (cachedRate && Date.now() - cachedRate.fetchedAt < CACHE_TTL_MS) {
    return cachedRate.rate;
  }

  try {
    // 無料APIでUSD→JPYレートを取得
    const res = await fetch(
      "https://open.er-api.com/v6/latest/USD",
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) throw new Error(`API error: ${res.status}`);

    const data = await res.json();
    const rate = data.rates?.JPY;

    if (typeof rate !== "number" || rate <= 0) {
      throw new Error("Invalid rate received");
    }

    cachedRate = { rate, fetchedAt: Date.now() };
    console.log(`[為替] USD/JPY = ${rate} (${new Date().toISOString()})`);
    return rate;
  } catch (err) {
    console.warn(`[為替] レート取得失敗、フォールバック使用: ${err}`);
    return cachedRate?.rate ?? FALLBACK_RATE;
  }
}

/**
 * 現在のレート情報を返す（設定画面用）
 */
export async function getExchangeRateInfo(): Promise<{
  rate: number;
  source: "live" | "cached" | "fallback";
  updatedAt: string | null;
}> {
  try {
    const rate = await getExchangeRate();
    return {
      rate,
      source: cachedRate ? (Date.now() - cachedRate.fetchedAt < 1000 ? "live" : "cached") : "fallback",
      updatedAt: cachedRate ? new Date(cachedRate.fetchedAt).toISOString() : null,
    };
  } catch {
    return { rate: FALLBACK_RATE, source: "fallback", updatedAt: null };
  }
}
