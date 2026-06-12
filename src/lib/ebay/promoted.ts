/**
 * eBay Promoted Listings (Standard / General) 自動エンロールメント。
 *
 * 出品成功後に呼び出して、既存の GENERAL キャンペーンに 5% の bid percentage で
 * 当該リスティングを ad として追加する。
 *
 * 使用 API:
 *   GET  /sell/marketing/v1/ad_campaign?marketplace_id=EBAY_US&campaign_status=ACTIVE
 *   POST /sell/marketing/v1/ad_campaign/{campaign_id}/bulk_create_ads_by_listing_id
 *
 * 環境変数:
 *   EBAY_PROMOTED_CAMPAIGN_ID  - キャンペーン ID を明示指定 (省略時は GENERAL ACTIVE を自動検出)
 *   EBAY_PROMOTED_AD_RATE      - bid percentage (省略時は 5.0)
 */

import { ebayFetch } from "./client";

type CampaignSummary = {
  campaignId: string;
  campaignName: string;
  campaignStatus: string;
  fundingStrategy?: {
    bidPercentage?: string;
    fundingModel?: string;
  };
};

const DEFAULT_AD_RATE = "5.0";

let campaignIdCache: { id: string; expiresAt: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10分

function getConfiguredAdRate(): string {
  // env 末尾改行などを除去
  const raw = process.env.EBAY_PROMOTED_AD_RATE?.trim();
  if (!raw) return DEFAULT_AD_RATE;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 100) return DEFAULT_AD_RATE;
  return n.toFixed(1);
}

/**
 * Promoted Listings General キャンペーン ID を取得。
 * env で指定があればそれを返し、なければ Active な GENERAL キャンペーンを検出。
 */
export async function findActiveCampaignId(): Promise<string | null> {
  // env 優先 (末尾改行除去)
  const fromEnv = process.env.EBAY_PROMOTED_CAMPAIGN_ID?.trim();
  if (fromEnv) return fromEnv;

  // キャッシュ
  if (campaignIdCache && campaignIdCache.expiresAt > Date.now()) {
    return campaignIdCache.id;
  }

  const res = await ebayFetch(
    "/sell/marketing/v1/ad_campaign?marketplace_id=EBAY_US&campaign_status=RUNNING&limit=50",
    { method: "GET" }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn(`[promoted] campaign 取得失敗: HTTP ${res.status} ${text.slice(0, 200)}`);
    return null;
  }
  const data: { campaigns?: CampaignSummary[] } = await res.json();
  const campaigns = data.campaigns ?? [];

  // GENERAL (fundingModel = COST_PER_SALE) を優先
  const general = campaigns.find(
    (c) => c.fundingStrategy?.fundingModel === "COST_PER_SALE"
  );
  const picked = general ?? campaigns[0];
  if (!picked) return null;

  campaignIdCache = { id: picked.campaignId, expiresAt: Date.now() + CACHE_TTL_MS };
  return picked.campaignId;
}

/**
 * 指定 listingId を Promoted Listings General キャンペーンに 5% で追加する。
 * 出品成功後に best-effort で呼び出すこと。失敗しても出品自体の成否には影響させない。
 */
export async function addListingToPromotedCampaign(
  listingId: string,
  options: { adRate?: string } = {}
): Promise<{ ok: true; campaignId: string; adRate: string } | { ok: false; reason: string }> {
  if (!listingId) return { ok: false, reason: "listingId 未指定" };

  const campaignId = await findActiveCampaignId();
  if (!campaignId) return { ok: false, reason: "アクティブな Promoted キャンペーンが見つからない" };

  const adRate = options.adRate ?? getConfiguredAdRate();

  const body = {
    requests: [
      {
        listingId,
        bidPercentage: adRate,
      },
    ],
  };

  const res = await ebayFetch(
    `/sell/marketing/v1/ad_campaign/${campaignId}/bulk_create_ads_by_listing_id`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `HTTP ${res.status}: ${text.slice(0, 300)}` };
  }

  // bulk のレスポンス内に partial fail がないかチェック
  const data: { responses?: Array<{ statusCode: number; errors?: unknown[] }> } = await res
    .json()
    .catch(() => ({}));
  const failed = (data.responses ?? []).filter((r) => r.statusCode >= 400);
  if (failed.length > 0) {
    return {
      ok: false,
      reason: `bulk ad 作成で ${failed.length} 件失敗: ${JSON.stringify(failed[0]).slice(0, 300)}`,
    };
  }

  return { ok: true, campaignId, adRate };
}
