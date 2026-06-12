/**
 * eBay Trading API でセラーの Business Policies を取得
 * 出力された ID を Vercel env (EBAY_FULFILLMENT/PAYMENT/RETURN_POLICY_ID) に設定する
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { callTradingApi } from "../src/lib/ebay/trading";

async function main() {
  try {
    // すべてのプロファイルを取得
    const res = await callTradingApi(
      "GetUserPreferences",
      `<ShowSellerProfilePreferences>true</ShowSellerProfilePreferences>`
    );

    const sellerPrefs = res.SellerProfilePreferences as Record<string, unknown>;
    if (!sellerPrefs?.SupportedSellerProfiles) {
      console.log("Business Policies not enabled or no profiles found");
      console.log("Raw:", JSON.stringify(res, null, 2));
      return;
    }

    const profiles = sellerPrefs.SupportedSellerProfiles as Record<string, unknown>;
    const list = profiles.SupportedSellerProfile;
    const arr = Array.isArray(list) ? list : [list];

    console.log("=== Seller Business Policies ===");
    for (const p of arr) {
      const profile = p as Record<string, unknown>;
      console.log(`\n[${profile.ProfileType}]`);
      console.log(`  ID:   ${profile.ProfileID}`);
      console.log(`  Name: ${profile.ProfileName}`);
      console.log(`  CategoryGroup: ${profile.CategoryGroup}`);
    }

    console.log("\n=== Vercel env投入コマンド ===");
    for (const p of arr) {
      const profile = p as Record<string, unknown>;
      const type = String(profile.ProfileType);
      const id = profile.ProfileID;
      if (type.startsWith("SHIPPING")) {
        console.log(`echo '${id}' | vercel env add EBAY_FULFILLMENT_POLICY_ID production`);
      } else if (type.startsWith("PAYMENT")) {
        console.log(`echo '${id}' | vercel env add EBAY_PAYMENT_POLICY_ID production`);
      } else if (type.startsWith("RETURN")) {
        console.log(`echo '${id}' | vercel env add EBAY_RETURN_POLICY_ID production`);
      }
    }
  } catch (err) {
    console.error("Failed:", err instanceof Error ? err.message : err);
  }
}

main();
