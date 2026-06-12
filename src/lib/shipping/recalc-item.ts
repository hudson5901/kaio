/**
 * アイテム費用再計算の単一ソース。
 * recalc API / batch / pipeline / detail page recalc は全てこれを呼ぶこと。
 *
 * - settings.json の利率と利益マージンを必ず使用
 * - 利益率下限を保証する価格自動引上げ (max(existing, floor))
 * - 戻り値は DB update payload と costs
 */
import type { Item } from "@/lib/db/schema";
import { calculateCostsWithLiveRate, type CostBreakdown } from "./calculator";
import { getSettings } from "@/lib/settings";

export interface RecalcResult {
  costs: CostBreakdown;
  finalPriceUsd: number;
  update: {
    shippingCostUsd: number;
    customsDutyUsd: number;
    ebayFeeUsd: number;
    adCostUsd: number;
    ebayPriceUsd: number;
    estimatedProfitUsd: number;
    updatedAt: string;
  };
}

export async function recalculateForItem(item: Item): Promise<RecalcResult> {
  const settings = await getSettings();
  const common = {
    mercariPriceJpy: item.mercariPrice,
    weightG: item.weightG,
    lengthCm: item.lengthCm,
    widthCm: item.widthCm,
    heightCm: item.heightCm,
    kabutoCategory: item.kabutoCategory,
    ebayFeeRate: settings.ebayFeePercent / 100,
    adRate: settings.adPercent / 100,
    customsRate: settings.customsDutyPercent / 100,
    salesTaxRate: settings.salesTaxPercent / 100,
    profitMargin: settings.profitMarginPercent / 100,
    shippingDiscountRate: (settings.shippingDiscountPercent ?? 0) / 100,
  };

  // 1) 利益率下限 (margin floor) を満たす最低価格を逆算
  const floor = await calculateCostsWithLiveRate({
    ...common,
    ebayPriceUsd: null,
  });

  // 2) 既存価格 vs フロアの高い方を採用 (自動引き上げ)
  const finalPriceUsd = Math.max(item.ebayPriceUsd ?? 0, floor.suggestedPriceUsd);

  // 3) 最終価格で正式な breakdown を計算
  const costs = await calculateCostsWithLiveRate({
    ...common,
    ebayPriceUsd: finalPriceUsd,
  });

  return {
    costs,
    finalPriceUsd,
    update: {
      shippingCostUsd: costs.shippingCostUsd,
      customsDutyUsd: costs.customsDutyUsd,
      ebayFeeUsd: costs.ebayFeeUsd,
      adCostUsd: costs.adCostUsd,
      ebayPriceUsd: finalPriceUsd,
      estimatedProfitUsd: costs.profitUsd,
      updatedAt: new Date().toISOString(),
    },
  };
}
