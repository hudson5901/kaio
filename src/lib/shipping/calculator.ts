/**
 * 利益計算エンジン
 *
 * 計算式（ユーザーのスプシに準拠）:
 *
 * 粗利 = 円換算売上 - eBay手数料 - 広告費 - 関税 - 仕入れ価格 - 送料見込み
 *
 * ① 円換算売上 = 販売価格($) × 為替
 * ② eBay手数料 = (円換算売上 + 送料見込み) × 16%
 * ③ 広告費 = (円換算売上 + 送料見込み) × 広告%
 * ④ 関税 = (円換算売上 + 送料見込み) × 関税率 (骨董品=10%)
 *
 * 送料は EMS テーブルから重量で引く
 */

import { getExchangeRate } from "@/lib/exchange-rate";

const DEFAULT_EXCHANGE_RATE = 155;

// EMS送料テーブル (日本→アメリカ, 2024年版概算, 円建て)
const EMS_RATES_JPY: { maxWeightG: number; cost: number }[] = [
  { maxWeightG: 500, cost: 3350 },
  { maxWeightG: 600, cost: 3550 },
  { maxWeightG: 700, cost: 3750 },
  { maxWeightG: 800, cost: 3950 },
  { maxWeightG: 900, cost: 4150 },
  { maxWeightG: 1000, cost: 4350 },
  { maxWeightG: 1250, cost: 4850 },
  { maxWeightG: 1500, cost: 5350 },
  { maxWeightG: 1750, cost: 5850 },
  { maxWeightG: 2000, cost: 6350 },
  { maxWeightG: 2500, cost: 7100 },
  { maxWeightG: 3000, cost: 7850 },
  { maxWeightG: 4000, cost: 9350 },
  { maxWeightG: 5000, cost: 10850 },
  { maxWeightG: 6000, cost: 12350 },
  { maxWeightG: 7000, cost: 13850 },
  { maxWeightG: 8000, cost: 15350 },
  { maxWeightG: 9000, cost: 16850 },
  { maxWeightG: 10000, cost: 18350 },
  { maxWeightG: 15000, cost: 25350 },
  { maxWeightG: 20000, cost: 32350 },
  { maxWeightG: 25000, cost: 39350 },
  { maxWeightG: 30000, cost: 46350 },
];

// デフォルトの料率
const DEFAULT_EBAY_FEE_RATE = 0.16;       // 16%
const DEFAULT_AD_RATE = 0.05;             // 5%
const DEFAULT_CUSTOMS_RATE = 0.10;        // 骨董品 10%
const DEFAULT_PROFIT_MARGIN = 0.30;       // 30%
const DEFAULT_WEIGHT_G = 2000;

export interface CostBreakdown {
  // 入力
  exchangeRate: number;
  mercariPriceJpy: number;
  ebayPriceUsd: number;
  // 送料
  shippingCostJpy: number;
  shippingCostUsd: number;
  // 円換算
  revenueJpy: number;
  // 各コスト（円建て）
  ebayFeeJpy: number;
  adCostJpy: number;
  customsDutyJpy: number;
  // 各コスト（USD建て）
  ebayFeeUsd: number;
  adCostUsd: number;
  customsDutyUsd: number;
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
 * EMS送料を計算（円）
 */
function calculateEmsShipping(weightG: number): number {
  for (const rate of EMS_RATES_JPY) {
    if (weightG <= rate.maxWeightG) {
      return rate.cost;
    }
  }
  return 50000;
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
  // 料率（設定画面から渡す）
  ebayFeeRate?: number;
  adRate?: number;
  customsRate?: number;
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
    profitMargin = DEFAULT_PROFIT_MARGIN,
  } = params;

  // --- 重量 ---
  let effectiveWeight = weightG || DEFAULT_WEIGHT_G;

  if (lengthCm && widthCm && heightCm) {
    const vol = calculateVolumetricWeight(lengthCm, widthCm, heightCm);
    effectiveWeight = Math.max(effectiveWeight, vol);
  } else if (lengthCm) {
    const w = widthCm || 3;
    const h = heightCm || 10;
    const vol = calculateVolumetricWeight(lengthCm, w, h);
    effectiveWeight = Math.max(effectiveWeight, vol);
  }

  // --- 送料 ---
  const shippingCostJpy = calculateEmsShipping(effectiveWeight);
  const shippingCostUsd = shippingCostJpy / exchangeRate;

  // --- eBay販売価格 ---
  let ebayPriceUsd: number;

  if (params.ebayPriceUsd && params.ebayPriceUsd > 0) {
    // 既に価格が設定されている → その価格で利益計算
    ebayPriceUsd = params.ebayPriceUsd;
  } else {
    // 価格未設定 → 目標利益率から逆算
    // 粗利 = 円換算売上 - (円換算売上+送料)*feeTotal - 仕入れ - 送料
    // 目標: 粗利 = 仕入れ × profitMargin
    // price×rate - (price×rate+ship)×fees - cost - ship = cost×margin
    // price×rate × (1 - fees) - ship×fees - cost - ship = cost×margin
    // price×rate × (1 - fees) = cost×(1+margin) + ship×(1+fees)
    // price = (cost×(1+margin) + ship×(1+fees)) / (rate × (1 - fees))
    const totalFeeRate = ebayFeeRate + adRate + customsRate;
    const numerator = mercariPriceJpy * (1 + profitMargin) + shippingCostJpy * (1 + totalFeeRate);
    const denominator = exchangeRate * (1 - totalFeeRate);
    ebayPriceUsd = Math.ceil(numerator / denominator);
  }

  // --- 円換算売上 ---
  const revenueJpy = ebayPriceUsd * exchangeRate;

  // --- 各費用（円建て, スプシ式: (円換算売上 + 送料見込み) × 率）---
  const feeBase = revenueJpy + shippingCostJpy;
  const ebayFeeJpy = feeBase * ebayFeeRate;
  const adCostJpy = feeBase * adRate;
  const customsDutyJpy = feeBase * customsRate;

  // --- 粗利（円）---
  const profitJpy = revenueJpy - ebayFeeJpy - adCostJpy - customsDutyJpy - mercariPriceJpy - shippingCostJpy;

  // --- USD換算 ---
  const ebayFeeUsd = ebayFeeJpy / exchangeRate;
  const adCostUsd = adCostJpy / exchangeRate;
  const customsDutyUsd = customsDutyJpy / exchangeRate;
  const profitUsd = profitJpy / exchangeRate;

  return {
    exchangeRate,
    mercariPriceJpy,
    ebayPriceUsd: round2(ebayPriceUsd),
    shippingCostJpy: roundJpy(shippingCostJpy),
    shippingCostUsd: round2(shippingCostUsd),
    revenueJpy: roundJpy(revenueJpy),
    ebayFeeJpy: roundJpy(ebayFeeJpy),
    adCostJpy: roundJpy(adCostJpy),
    customsDutyJpy: roundJpy(customsDutyJpy),
    ebayFeeUsd: round2(ebayFeeUsd),
    adCostUsd: round2(adCostUsd),
    customsDutyUsd: round2(customsDutyUsd),
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
