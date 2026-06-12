/**
 * eBay 側の Business Policies と Promoted Listings キャンペーンを
 * Trading API と REST API の両方から取得して、env と比較する診断 API。
 *
 * 出品時 [37] Input data is invalid (ShippingProfileID) などのエラーを切り分けるため。
 *
 * GET /api/admin/ebay-diagnostics
 *   - admin ユーザーのみアクセス可
 *   - レスポンス: { tradingApiProfiles, restPolicies, campaigns, env }
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";

export const maxDuration = 60;

async function requireAdmin(): Promise<{ ok: true } | { ok: false; reason: string; status: number }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, reason: "未ログイン", status: 401 };
    if (user.role !== "admin") return { ok: false, reason: "admin 限定", status: 403 };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `auth error: ${e instanceof Error ? e.message : String(e)}`, status: 500 };
  }
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const env = {
    EBAY_FULFILLMENT_POLICY_ID: process.env.EBAY_FULFILLMENT_POLICY_ID || null,
    EBAY_PAYMENT_POLICY_ID: process.env.EBAY_PAYMENT_POLICY_ID || null,
    EBAY_RETURN_POLICY_ID: process.env.EBAY_RETURN_POLICY_ID || null,
    EBAY_PROMOTED_CAMPAIGN_ID: process.env.EBAY_PROMOTED_CAMPAIGN_ID || null,
    EBAY_PROMOTED_AD_RATE: process.env.EBAY_PROMOTED_AD_RATE || null,
    EBAY_BEST_OFFER: process.env.EBAY_BEST_OFFER || "on (default)",
  };

  type Trading = {
    type?: string;
    id?: string;
    name?: string;
    categoryGroup?: unknown;
  };
  type RestPolicy = {
    id: string;
    name: string;
    marketplaceId?: string;
    categoryTypes?: unknown;
  };
  type Campaign = {
    campaignId: string;
    campaignName: string;
    campaignStatus: string;
    marketplaceId?: string;
    fundingStrategy?: unknown;
  };

  const result: {
    tradingApiProfiles: Trading[];
    restPolicies: {
      fulfillment: RestPolicy[] | { error: string };
      payment: RestPolicy[] | { error: string };
      return: RestPolicy[] | { error: string };
    };
    campaigns: Campaign[] | { error: string };
    env: typeof env;
    suggestions: string[];
  } = {
    tradingApiProfiles: [],
    restPolicies: {
      fulfillment: { error: "not fetched" },
      payment: { error: "not fetched" },
      return: { error: "not fetched" },
    },
    campaigns: { error: "not fetched" },
    env,
    suggestions: [],
  };

  // ---- Trading API: GetUserPreferences (Auth'n'Auth token) ----
  try {
    const { callTradingApi } = await import("@/lib/ebay/trading");
    const tradingRes = await callTradingApi(
      "GetUserPreferences",
      `<ShowSellerProfilePreferences>true</ShowSellerProfilePreferences>`
    );
    const sellerPrefs = tradingRes.SellerProfilePreferences as Record<string, unknown> | undefined;
    if (sellerPrefs?.SupportedSellerProfiles) {
      const supported = sellerPrefs.SupportedSellerProfiles as Record<string, unknown>;
      const list = supported.SupportedSellerProfile;
      const arr = Array.isArray(list) ? list : list ? [list] : [];
      result.tradingApiProfiles = arr.map((p) => {
        const profile = p as Record<string, unknown>;
        return {
          type: String(profile.ProfileType ?? ""),
          id: String(profile.ProfileID ?? ""),
          name: String(profile.ProfileName ?? ""),
          categoryGroup: profile.CategoryGroup,
        };
      });
    }
  } catch (e) {
    result.tradingApiProfiles = [
      { name: `Trading API error: ${e instanceof Error ? e.message : String(e)}` },
    ];
  }

  // ---- REST API: list Business Policies (OAuth user token) ----
  const { ebayFetch } = await import("@/lib/ebay/client");
  async function listRest(path: string): Promise<RestPolicy[] | { error: string }> {
    try {
      const res = await ebayFetch(`${path}?marketplace_id=EBAY_US`);
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return { error: `HTTP ${res.status}: ${t.slice(0, 300)}` };
      }
      const data = await res.json();
      const items =
        (data.fulfillmentPolicies as RestPolicy[] | undefined) ||
        (data.paymentPolicies as RestPolicy[] | undefined) ||
        (data.returnPolicies as RestPolicy[] | undefined) ||
        [];
      return items.map((p: Record<string, unknown>) => ({
        id: String(
          p.fulfillmentPolicyId ?? p.paymentPolicyId ?? p.returnPolicyId ?? ""
        ),
        name: String(p.name ?? ""),
        marketplaceId: p.marketplaceId as string | undefined,
        categoryTypes: p.categoryTypes,
      }));
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }
  result.restPolicies.fulfillment = await listRest("/sell/account/v1/fulfillment_policy");
  result.restPolicies.payment = await listRest("/sell/account/v1/payment_policy");
  result.restPolicies.return = await listRest("/sell/account/v1/return_policy");

  // ---- REST API: list Ad Campaigns ----
  try {
    const res = await ebayFetch(
      "/sell/marketing/v1/ad_campaign?marketplace_id=EBAY_US&limit=50"
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      result.campaigns = { error: `HTTP ${res.status}: ${t.slice(0, 300)}` };
    } else {
      const data = await res.json();
      result.campaigns = ((data.campaigns as Campaign[]) ?? []).map((c) => ({
        campaignId: c.campaignId,
        campaignName: c.campaignName,
        campaignStatus: c.campaignStatus,
        marketplaceId: c.marketplaceId,
        fundingStrategy: c.fundingStrategy,
      }));
    }
  } catch (e) {
    result.campaigns = { error: e instanceof Error ? e.message : String(e) };
  }

  // ---- 比較ヒント ----
  const fulfillmentRest = result.restPolicies.fulfillment;
  if (Array.isArray(fulfillmentRest)) {
    const env_id = env.EBAY_FULFILLMENT_POLICY_ID;
    const matched = fulfillmentRest.find((p) => p.id === env_id);
    if (!matched && env_id) {
      result.suggestions.push(
        `⚠ env の EBAY_FULFILLMENT_POLICY_ID=${env_id} は REST API の fulfillment_policy 一覧に見つかりません。Trading API と REST API で ID が異なる可能性があります。`
      );
    }
    const onlyUsa = fulfillmentRest.find((p) =>
      p.name.toLowerCase().includes("only usa") && p.name.toLowerCase().includes("7 business")
    );
    if (onlyUsa) {
      result.suggestions.push(
        `候補: "Only USA..." policy の REST API ID = ${onlyUsa.id} (現 env: ${env_id})`
      );
    }
  }
  if (Array.isArray(result.campaigns)) {
    const running = result.campaigns.filter((c) => c.campaignStatus === "RUNNING");
    if (running.length === 0) {
      result.suggestions.push(`⚠ RUNNING 状態のキャンペーンがありません。Promoted Listings 自動エンロールはスキップされます。`);
    } else {
      result.suggestions.push(
        `RUNNING キャンペーン: ${running
          .map((c) => `${c.campaignName} (${c.campaignId})`)
          .join(", ")}`
      );
    }
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
