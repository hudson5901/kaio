/**
 * eBay Promoted Listings のキャンペーン一覧を表示。
 * 出力された ID を Vercel env (EBAY_PROMOTED_CAMPAIGN_ID) に投入すると
 * 自動エンロールで使うキャンペーンを固定できる (省略時は RUNNING の COST_PER_SALE
 * を自動検出)。
 *
 * 使い方: npx tsx scripts/fetch-ebay-campaigns.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { ebayFetch } from "../src/lib/ebay/client";

type Campaign = {
  campaignId: string;
  campaignName: string;
  campaignStatus: string;
  marketplaceId?: string;
  fundingStrategy?: {
    bidPercentage?: string;
    fundingModel?: string;
  };
  startDate?: string;
  endDate?: string;
};

async function main() {
  // 全ステータスを表示
  const statuses = ["RUNNING", "PAUSED", "ENDED", "SCHEDULED"];
  for (const status of statuses) {
    const res = await ebayFetch(
      `/sell/marketing/v1/ad_campaign?marketplace_id=EBAY_US&campaign_status=${status}&limit=50`,
      { method: "GET" }
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error(`[${status}] HTTP ${res.status} ${t.slice(0, 200)}`);
      continue;
    }
    const data: { campaigns?: Campaign[] } = await res.json();
    const campaigns = data.campaigns ?? [];
    if (campaigns.length === 0) continue;
    console.log(`\n=== ${status} (${campaigns.length}件) ===`);
    for (const c of campaigns) {
      console.log(`\n  Name:           ${c.campaignName}`);
      console.log(`  ID:             ${c.campaignId}`);
      console.log(`  FundingModel:   ${c.fundingStrategy?.fundingModel ?? "-"}`);
      console.log(`  BidPercentage:  ${c.fundingStrategy?.bidPercentage ?? "-"}`);
      console.log(`  Start/End:      ${c.startDate ?? "-"} / ${c.endDate ?? "-"}`);
    }
  }

  console.log(`\n=== Vercel env 投入例 ===`);
  console.log(`echo '<CAMPAIGN_ID>' | vercel env add EBAY_PROMOTED_CAMPAIGN_ID production`);
  console.log(`echo '5.0'           | vercel env add EBAY_PROMOTED_AD_RATE production   # 5% 固定`);
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
