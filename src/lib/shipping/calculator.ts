/**
 * 利益計算エンジン (送料無料出品 + DDP 想定)
 *
 * 純利益 = (販売価格 + 売上税6%) - eBay手数料16% - 広告費5%
 *         - 売上税6% - 関税10% - 送料 - 仕入
 *
 * 内訳（円建て、price = ebayPriceUsd × exchangeRate, eBay売上 = price × (1+tax)）:
 *   - eBay売上       = price × (1 + salesTax)               ← buyerが払う総額
 *   - eBay手数料     = eBay売上 × ebayFee%                   ← 売上税込で請求、送料は含めない
 *   - 広告費         = eBay売上 × ad%                        ← 売上税込で請求、送料は含めない
 *   - 売上税remit    = price × salesTax                     ← buyer徴収分を州に納付 (パススルー)
 *   - 関税           = (price + 送料) × customs%             ← 税抜の販売価格 + 送料に対して
 *   - 送料           = eLogi FICP テーブル (実重量と容積重量のmax)
 *   - 仕入           = メルカリ価格
 *
 * 送料は eLogi FICP (FedEx International Connect Plus) のアメリカ向け料金表で計算。
 * 課金重量 = max(実重量, 容積重量)、容積重量 = (L+7)(W+7)(H+7)/5000g。
 */

import { getExchangeRate } from "@/lib/exchange-rate";
import { getCategory } from "@/lib/kabuto/categories";

const DEFAULT_EXCHANGE_RATE = 155;

// eLogi FICP (FedEx International Connect Plus) 輸出料金, 北米向け (米国)
// 出典: eLogi会員専用送料目安表 (2025年11月版)
// 円建て、0.5kg刻みで32.5kgまで、燃油サーチャージ込み
const ELOGI_FICP_US_RATES_JPY: { maxWeightG: number; cost: number }[] = [
  { maxWeightG: 500, cost: 3200 },
  { maxWeightG: 1000, cost: 3600 },
  { maxWeightG: 1500, cost: 3900 },
  { maxWeightG: 2000, cost: 4200 },
  { maxWeightG: 2500, cost: 4700 },
  { maxWeightG: 3000, cost: 5400 },
  { maxWeightG: 3500, cost: 5700 },
  { maxWeightG: 4000, cost: 6200 },
  { maxWeightG: 4500, cost: 7000 },
  { maxWeightG: 5000, cost: 7600 },
  { maxWeightG: 5500, cost: 9200 },
  { maxWeightG: 6000, cost: 9400 },
  { maxWeightG: 6500, cost: 9900 },
  { maxWeightG: 7000, cost: 10100 },
  { maxWeightG: 7500, cost: 10600 },
  { maxWeightG: 8000, cost: 10900 },
  { maxWeightG: 8500, cost: 11300 },
  { maxWeightG: 9000, cost: 11600 },
  { maxWeightG: 9500, cost: 13900 },
  { maxWeightG: 10000, cost: 14200 },
  { maxWeightG: 10500, cost: 14800 },
  { maxWeightG: 11000, cost: 15100 },
  { maxWeightG: 11500, cost: 15700 },
  { maxWeightG: 12000, cost: 16000 },
  { maxWeightG: 12500, cost: 18000 },
  { maxWeightG: 13000, cost: 18400 },
  { maxWeightG: 13500, cost: 19000 },
  { maxWeightG: 14000, cost: 19300 },
  { maxWeightG: 14500, cost: 19900 },
  { maxWeightG: 15000, cost: 20300 },
  { maxWeightG: 15500, cost: 20900 },
  { maxWeightG: 16000, cost: 22900 },
  { maxWeightG: 16500, cost: 23500 },
  { maxWeightG: 17000, cost: 23900 },
  { maxWeightG: 17500, cost: 24500 },
  { maxWeightG: 18000, cost: 24900 },
  { maxWeightG: 18500, cost: 25500 },
  { maxWeightG: 19000, cost: 26000 },
  { maxWeightG: 19500, cost: 26600 },
  { maxWeightG: 20000, cost: 27000 },
  { maxWeightG: 20500, cost: 27600 },
  { maxWeightG: 21000, cost: 31900 },
  { maxWeightG: 21500, cost: 32800 },
  { maxWeightG: 22000, cost: 33500 },
  { maxWeightG: 22500, cost: 34400 },
  { maxWeightG: 23000, cost: 35100 },
  { maxWeightG: 23500, cost: 36000 },
  { maxWeightG: 24000, cost: 36600 },
  { maxWeightG: 24500, cost: 37500 },
  { maxWeightG: 25000, cost: 38200 },
  { maxWeightG: 25500, cost: 39100 },
  { maxWeightG: 26000, cost: 39800 },
  { maxWeightG: 26500, cost: 40700 },
  { maxWeightG: 27000, cost: 41400 },
  { maxWeightG: 27500, cost: 42300 },
  { maxWeightG: 28000, cost: 43000 },
  { maxWeightG: 28500, cost: 43900 },
  { maxWeightG: 29000, cost: 44600 },
  { maxWeightG: 29500, cost: 45500 },
  { maxWeightG: 30000, cost: 46100 },
  { maxWeightG: 30500, cost: 47000 },
  { maxWeightG: 31000, cost: 47700 },
  { maxWeightG: 31500, cost: 48600 },
  { maxWeightG: 32000, cost: 49300 },
  { maxWeightG: 32500, cost: 50200 },
];

// 33kg以上は重量帯ごとの 1kgあたり料金 × 請求重量 で計算
const ELOGI_FICP_US_PER_KG_JPY: { maxWeightKg: number; perKg: number }[] = [
  { maxWeightKg: 44, perKg: 1561 },
  { maxWeightKg: 70, perKg: 1453 },
  { maxWeightKg: 99, perKg: 1435 },
  { maxWeightKg: 299, perKg: 1439 },
  { maxWeightKg: 499, perKg: 1358 },
  { maxWeightKg: 999, perKg: 1338 },
  { maxWeightKg: 99999, perKg: 1334 },
];

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
 * eLogi FICP (FedEx International Connect Plus) アメリカ向け送料を計算（円）
 * 32.5kg以下はテーブル参照、それ以上は重量帯ごとの1kgあたり料金を採用。
 */
function calculateElogiFicpUsShipping(weightG: number): number {
  for (const rate of ELOGI_FICP_US_RATES_JPY) {
    if (weightG <= rate.maxWeightG) {
      return rate.cost;
    }
  }
  const weightKg = Math.ceil(weightG / 1000);
  for (const tier of ELOGI_FICP_US_PER_KG_JPY) {
    if (weightKg <= tier.maxWeightKg) {
      return weightKg * tier.perKg;
    }
  }
  return weightKg * 1334;
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
  // 手動送料指定 (USD)。設定すると FedEx テーブルではなくこの値を採用。
  shippingCostUsdOverride?: number | null;
  // FedEx List Rate に対する割引率 (0.0-1.0)。eLogi 契約レートを模擬。
  shippingDiscountRate?: number;
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
    const cat = getCategory(params.kabutoCategory as Parameters<typeof getCategory>[0]);
    if (cat) categoryDefaultWeight = cat.defaultWeightG;
  }
  const actualWeight = weightG || categoryDefaultWeight;

  // 容積重量: 梱包オーバーヘッド(+7cm/辺)を加算してから計算
  // 3辺すべて揃っているときだけ計算する。1辺でも不明なら 0 (実重量で課金)。
  // 「わからない値を 20cm で勝手に埋める」ことはしない。
  let volumetricWeight = 0;
  if (lengthCm && widthCm && heightCm) {
    volumetricWeight = calculateVolumetricWeight(
      lengthCm + PACKAGING_OVERHEAD_CM,
      widthCm + PACKAGING_OVERHEAD_CM,
      heightCm + PACKAGING_OVERHEAD_CM
    );
  }

  // FedEx は実重量と容積重量の高い方を課金重量とする
  const chargeableWeight = Math.max(actualWeight, volumetricWeight);

  // --- 送料 (eLogi FICP テーブル × 割引率 or 手動上書き) ---
  // eLogi 生料金が既に大幅割引込みなので、shippingDiscountRate は微調整用 (デフォルト0)
  const override = params.shippingCostUsdOverride;
  const discountRate = Math.min(
    Math.max(params.shippingDiscountRate ?? 0, 0),
    0.95
  );
  const shippingCostJpy =
    override != null && Number.isFinite(override) && override >= 0
      ? override * exchangeRate
      : calculateElogiFicpUsShipping(chargeableWeight) * (1 - discountRate);
  const shippingCostUsd = shippingCostJpy / exchangeRate;

  // --- eBay販売価格 ---
  // 純利益 = price×(1+tax) - price×(1+tax)×(fee+ad) - price×tax
  //         - (price+ship)×customs - ship - cost
  //       = price × [(1+tax)(1-fee-ad) - tax - customs] - ship×(1+customs) - cost
  //       = price × k - ship × (1+customs) - cost
  //         where k = (1+tax)(1-fee-ad) - tax - customs
  // 目標: 純利益 = cost × margin
  // → price = (cost×(1+margin) + ship×(1+customs)) / k
  const profitCoefficient =
    (1 + salesTaxRate) * (1 - ebayFeeRate - adRate) - salesTaxRate - customsRate;

  let ebayPriceUsd: number;
  if (params.ebayPriceUsd && params.ebayPriceUsd > 0) {
    ebayPriceUsd = params.ebayPriceUsd;
  } else if (mercariPriceJpy > 0) {
    const numerator =
      mercariPriceJpy * (1 + profitMargin) +
      shippingCostJpy * (1 + customsRate);
    const denominator = exchangeRate * profitCoefficient;
    ebayPriceUsd = Math.ceil(numerator / denominator);
  } else {
    // 仕入価格が 0 (eBay インポート分など) の場合は逆算しない
    ebayPriceUsd = 0;
  }

  // --- 円換算売上 ---
  const revenueJpy = ebayPriceUsd * exchangeRate;
  const grossWithTaxJpy = revenueJpy * (1 + salesTaxRate);

  // --- 各費用（円建て）---
  // eBay手数料・広告費は 売上税込のグロス で請求される (送料無料出品想定: 送料は基礎に含めない)
  const ebayFeeJpy = grossWithTaxJpy * ebayFeeRate;
  const adCostJpy = grossWithTaxJpy * adRate;
  // 売上税は buyer から受け取った分を州に納付 (実質パススルー)
  const salesTaxJpy = revenueJpy * salesTaxRate;
  // 関税は (販売価格 + 送料) を Declared Value (税抜) として 10%
  const customsDutyJpy = (revenueJpy + shippingCostJpy) * customsRate;

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
