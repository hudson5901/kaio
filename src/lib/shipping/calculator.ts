/**
 * 利益計算エンジン
 *
 * 純利益 = (販売価格 + 売上税6%) - eBay手数料16% - 広告費5% - 売上税6% - 関税10% - 送料 - 仕入
 *
 * 内訳（円建て、ebayPrice = 販売価格×為替）:
 *   - 受領総額       = ebayPrice × (1 + salesTax)        ← buyerから受け取る総額
 *   - eBay手数料     = 受領総額 × ebayFee%                ← 売上税込ベースで請求
 *   - 広告費         = 受領総額 × ad%                     ← 売上税込ベースで請求
 *   - 売上税remit    = ebayPrice × salesTax              ← 州税納付
 *   - 関税           = ebayPrice × customs%               ← 古美術 10%
 *   - 送料           = FedEx IP テーブル (実重量と容積重量のmax)
 *   - 仕入           = メルカリ価格
 *
 * 送料は FedEx International Priority の重量別テーブル (実重量と容積重量の max) で計算
 */

import { getExchangeRate } from "@/lib/exchange-rate";

const DEFAULT_EXCHANGE_RATE = 155;

// FedEx International Priority 公開料金 概算 (日本→アメリカ, 2026年版, 円建て)
// 参考: corporate.beforward.jp / FedEx 公開List Rate
// 1kg=19,490 / 5kg=53,230 / 10kg=66,630 を実測値とし、補間/外挿で構築
// 実契約があればこの 60〜80% 程度で済むので保守的見積もり
const FEDEX_RATES_JPY: { maxWeightG: number; cost: number }[] = [
  { maxWeightG: 500, cost: 11000 },
  { maxWeightG: 1000, cost: 19490 },
  { maxWeightG: 1500, cost: 27800 },
  { maxWeightG: 2000, cost: 35000 },
  { maxWeightG: 2500, cost: 41000 },
  { maxWeightG: 3000, cost: 46000 },
  { maxWeightG: 4000, cost: 50500 },
  { maxWeightG: 5000, cost: 53230 },
  { maxWeightG: 6000, cost: 56500 },
  { maxWeightG: 7000, cost: 60000 },
  { maxWeightG: 8000, cost: 63000 },
  { maxWeightG: 9000, cost: 65000 },
  { maxWeightG: 10000, cost: 66630 },
  { maxWeightG: 15000, cost: 80000 },
  { maxWeightG: 20000, cost: 95000 },
  { maxWeightG: 25000, cost: 110000 },
  { maxWeightG: 30000, cost: 125000 },
  { maxWeightG: 40000, cost: 155000 },
  { maxWeightG: 50000, cost: 185000 },
  { maxWeightG: 60000, cost: 215000 },
  { maxWeightG: 68000, cost: 235000 }, // IP上限
];
// 68kg超は1kgあたり ¥3500 で外挿（IPFサービス相当）
const FEDEX_OVER_LIMIT_PER_KG = 3500;

// デフォルトの料率
const DEFAULT_EBAY_FEE_RATE = 0.16;       // 16%
const DEFAULT_AD_RATE = 0.05;             // 5%
const DEFAULT_CUSTOMS_RATE = 0.10;        // 骨董品 10%
const DEFAULT_SALES_TAX_RATE = 0.06;      // 米国売上税 6% (eBayがbuyerから徴収→州税)
const DEFAULT_PROFIT_MARGIN = 0.30;       // 30%
const DEFAULT_WEIGHT_G = 2000;
const PACKAGING_OVERHEAD_CM = 7; // ダンボール梱包で各辺+7cm

export interface CostBreakdown {
  // 入力
  exchangeRate: number;
  mercariPriceJpy: number;
  ebayPriceUsd: number;
  // 送料
  shippingCostJpy: number;
  shippingCostUsd: number;
  // 課金重量 (実重量と容積重量の max)
  chargeableWeightG: number;
  volumetricWeightG: number;
  actualWeightG: number;
  // 円換算
  revenueJpy: number;
  // 各コスト（円建て）
  ebayFeeJpy: number;
  adCostJpy: number;
  customsDutyJpy: number;
  salesTaxJpy: number;
  // 各コスト（USD建て）
  ebayFeeUsd: number;
  adCostUsd: number;
  customsDutyUsd: number;
  salesTaxUsd: number;
  // 利益
  profitJpy: number;
  profitUsd: number;
  // 推奨価格（eBay販売価格が未設定の場合に提案）
  suggestedPriceUsd: number;
}

/**
 * 容積重量の計算 (cm → g)
 */
function calculateVolumetricWeight(
  lengthCm: number,
  widthCm: number,
  heightCm: number
): number {
  return (lengthCm * widthCm * heightCm) / 5000 * 1000;
}

/**
 * FedEx International Priority 送料を計算（円）
 * 68kg超は1kgあたり ¥3500 で外挿
 */
function calculateFedexShipping(weightG: number): number {
  for (const rate of FEDEX_RATES_JPY) {
    if (weightG <= rate.maxWeightG) {
      return rate.cost;
    }
  }
  const lastTier = FEDEX_RATES_JPY[FEDEX_RATES_JPY.length - 1];
  const overKg = (weightG - lastTier.maxWeightG) / 1000;
  return lastTier.cost + Math.ceil(overKg) * FEDEX_OVER_LIMIT_PER_KG;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundJpy(n: number): number {
  return Math.round(n);
}

/**
 * 利益計算（ユーザーのスプシ式に準拠）
 *
 * ebayPriceUsd が指定されていれば、その価格での利益を計算。
 * 指定されていなければ、suggestedPriceUsd を逆算して提案。
 */
export function calculateCosts(params: {
  mercariPriceJpy: number;
  ebayPriceUsd?: number | null;  // 既にeBay価格が決まっている場合
  weightG?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  exchangeRate?: number;
  kabutoCategory?: string | null; // カテゴリ別デフォルト重量用
  // 料率（設定画面から渡す）
  ebayFeeRate?: number;
  adRate?: number;
  customsRate?: number;
  salesTaxRate?: number;
  profitMargin?: number;
}): CostBreakdown {
  const {
    mercariPriceJpy,
    weightG,
    lengthCm,
    widthCm,
    heightCm,
    exchangeRate = DEFAULT_EXCHANGE_RATE,
    ebayFeeRate = DEFAULT_EBAY_FEE_RATE,
    adRate = DEFAULT_AD_RATE,
    customsRate = DEFAULT_CUSTOMS_RATE,
    salesTaxRate = DEFAULT_SALES_TAX_RATE,
    profitMargin = DEFAULT_PROFIT_MARGIN,
  } = params;

  // --- 重量 (カテゴリ別デフォルトを使用) ---
  let categoryDefaultWeight = DEFAULT_WEIGHT_G;
  if (params.kabutoCategory) {
    try {
      const { getCategory } = require("@/lib/kabuto/categories");
      const cat = getCategory(params.kabutoCategory);
      if (cat) categoryDefaultWeight = cat.defaultWeightG;
    } catch { /* ignore */ }
  }
  const actualWeight = weightG || categoryDefaultWeight;

  // 容積重量: 梱包オーバーヘッド(+7cm/辺)を加算してから計算
  let volumetricWeight = 0;
  if (lengthCm && widthCm && heightCm) {
    volumetricWeight = calculateVolumetricWeight(
      lengthCm + PACKAGING_OVERHEAD_CM,
      widthCm + PACKAGING_OVERHEAD_CM,
      heightCm + PACKAGING_OVERHEAD_CM
    );
  } else if (lengthCm || widthCm || heightCm) {
    const l = (lengthCm || 20) + PACKAGING_OVERHEAD_CM;
    const w = (widthCm || 20) + PACKAGING_OVERHEAD_CM;
    const h = (heightCm || 20) + PACKAGING_OVERHEAD_CM;
    volumetricWeight = calculateVolumetricWeight(l, w, h);
  }

  // FedEx は実重量と容積重量の高い方を課金重量とする
  const chargeableWeight = Math.max(actualWeight, volumetricWeight);

  // --- 送料 (FedEx International Priority) ---
  const shippingCostJpy = calculateFedexShipping(chargeableWeight);
  const shippingCostUsd = shippingCostJpy / exchangeRate;

  // --- eBay販売価格 ---
  // 純利益 = 売上×(1+tax) - 売上×(1+tax)×(fee+ad) - 売上×tax - 売上×customs - 送料 - 仕入
  //       = 売上 × k - 送料 - 仕入,  where k = (1+tax)(1-fee-ad) - tax - customs
  // 目標: 純利益 = 仕入 × margin
  // → 売上 = (仕入×(1+margin) + 送料) / k
  const profitCoefficient =
    (1 + salesTaxRate) * (1 - ebayFeeRate - adRate) - salesTaxRate - customsRate;

  let ebayPriceUsd: number;
  if (params.ebayPriceUsd && params.ebayPriceUsd > 0) {
    ebayPriceUsd = params.ebayPriceUsd;
  } else {
    const numerator = mercariPriceJpy * (1 + profitMargin) + shippingCostJpy;
    const denominator = exchangeRate * profitCoefficient;
    ebayPriceUsd = Math.ceil(numerator / denominator);
  }

  // --- 円換算売上 ---
  const revenueJpy = ebayPriceUsd * exchangeRate;
  const grossWithTaxJpy = revenueJpy * (1 + salesTaxRate);

  // --- 各費用（円建て）---
  // eBay手数料・広告費は 売上税込のグロス で請求される
  const ebayFeeJpy = grossWithTaxJpy * ebayFeeRate;
  const adCostJpy = grossWithTaxJpy * adRate;
  // 売上税は buyer から受け取った分を州に納付 (実質パススルー)
  const salesTaxJpy = revenueJpy * salesTaxRate;
  // 関税は売上に対して
  const customsDutyJpy = revenueJpy * customsRate;

  // --- 純利益（円）---
  // 受領総額 - eBay手数料 - 広告費 - 売上税納付 - 関税 - 送料 - 仕入
  const profitJpy =
    grossWithTaxJpy -
    ebayFeeJpy -
    adCostJpy -
    salesTaxJpy -
    customsDutyJpy -
    shippingCostJpy -
    mercariPriceJpy;

  // --- USD換算 ---
  const ebayFeeUsd = ebayFeeJpy / exchangeRate;
  const adCostUsd = adCostJpy / exchangeRate;
  const customsDutyUsd = customsDutyJpy / exchangeRate;
  const salesTaxUsd = salesTaxJpy / exchangeRate;
  const profitUsd = profitJpy / exchangeRate;

  return {
    exchangeRate,
    mercariPriceJpy,
    ebayPriceUsd: round2(ebayPriceUsd),
    shippingCostJpy: roundJpy(shippingCostJpy),
    shippingCostUsd: round2(shippingCostUsd),
    chargeableWeightG: roundJpy(chargeableWeight),
    volumetricWeightG: roundJpy(volumetricWeight),
    actualWeightG: roundJpy(actualWeight),
    revenueJpy: roundJpy(revenueJpy),
    ebayFeeJpy: roundJpy(ebayFeeJpy),
    adCostJpy: roundJpy(adCostJpy),
    customsDutyJpy: roundJpy(customsDutyJpy),
    salesTaxJpy: roundJpy(salesTaxJpy),
    ebayFeeUsd: round2(ebayFeeUsd),
    adCostUsd: round2(adCostUsd),
    customsDutyUsd: round2(customsDutyUsd),
    salesTaxUsd: round2(salesTaxUsd),
    profitJpy: roundJpy(profitJpy),
    profitUsd: round2(profitUsd),
    suggestedPriceUsd: round2(ebayPriceUsd),
  };
}

/**
 * ライブ為替レートで費用計算
 */
export async function calculateCostsWithLiveRate(
  params: Omit<Parameters<typeof calculateCosts>[0], "exchangeRate">
): Promise<CostBreakdown> {
  const rate = await getExchangeRate().catch(() => DEFAULT_EXCHANGE_RATE);
  return calculateCosts({ ...params, exchangeRate: rate });
}

// 後方互換: 旧インターフェース名
export type ShippingEstimate = CostBreakdown;
