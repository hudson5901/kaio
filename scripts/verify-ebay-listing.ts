/**
 * Trading API の VerifyAddFixedPriceItem で公開せず検証だけ実行
 * 実装に必須項目が全部揃ってるか、本番でちゃんと通るか事前確認
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { callTradingApi } from "../src/lib/ebay/trading";
import { mapItemToEbayListing } from "../src/lib/ebay/mapping";

const args = process.argv.slice(2);
const itemIdArg = args[0];

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client, { schema });

  const item = itemIdArg
    ? await db.query.items.findFirst({ where: eq(schema.items.id, itemIdArg) })
    : await db.query.items.findFirst({
        where: (i, { and: a, eq: e, isNotNull: nn }) =>
          a(
            e(i.ebayStatus, "draft"),
            e(i.decision, "list"),
            nn(i.ebayTitle),
            nn(i.ebayDescription),
            nn(i.processedImages)
          ),
      });

  if (!item) {
    console.error("No suitable item found");
    process.exit(1);
  }

  console.log(`[Test item] id=${item.id} mercariId=${item.mercariId}`);
  console.log(`  title: ${item.ebayTitle?.slice(0, 60)}...`);
  console.log(`  price: $${item.ebayPriceUsd}, shipping: $${item.shippingCostUsd}`);

  const listing = mapItemToEbayListing(item);

  console.log(`  category: ${listing.categoryId}, condition: ${listing.conditionId}`);
  console.log(`  images: ${listing.imageUrls.length} / aspects: ${Object.keys(listing.aspects).length}`);

  const shipProfile = process.env.EBAY_FULFILLMENT_POLICY_ID;
  const payProfile = process.env.EBAY_PAYMENT_POLICY_ID;
  const retProfile = process.env.EBAY_RETURN_POLICY_ID;
  const hasProfiles = !!(shipProfile && payProfile && retProfile);

  console.log(`  using ${hasProfiles ? "Business Policies" : "Inline policies"}`);

  const pictureXml = listing.imageUrls
    .slice(0, 24)
    .map((u) => `<PictureURL>${xmlEscape(u)}</PictureURL>`)
    .join("");

  const aspectXml = Object.entries(listing.aspects)
    .flatMap(([name, values]) =>
      values.map(
        (v) =>
          `<NameValueList><Name>${xmlEscape(name)}</Name><Value>${xmlEscape(String(v))}</Value></NameValueList>`
      )
    )
    .join("");

  const profilesParts: string[] = [];
  if (shipProfile) profilesParts.push(`<SellerShippingProfile><ShippingProfileID>${shipProfile}</ShippingProfileID></SellerShippingProfile>`);
  if (payProfile) profilesParts.push(`<SellerPaymentProfile><PaymentProfileID>${payProfile}</PaymentProfileID></SellerPaymentProfile>`);
  if (retProfile) profilesParts.push(`<SellerReturnProfile><ReturnProfileID>${retProfile}</ReturnProfileID></SellerReturnProfile>`);
  const sellerProfilesXml = profilesParts.length ? `<SellerProfiles>${profilesParts.join("")}</SellerProfiles>` : "";

  const inlineShippingXml = !shipProfile
    ? `<ShippingDetails>
        <ShippingType>Flat</ShippingType>
        <ShippingServiceOptions>
          <ShippingServicePriority>1</ShippingServicePriority>
          <ShippingService>ExpeditedShippingFromOutsideUS</ShippingService>
          <ShippingServiceCost currencyID="USD">${listing.shippingCostUsd.toFixed(2)}</ShippingServiceCost>
        </ShippingServiceOptions>
      </ShippingDetails>` : "";

  const inlineReturnXml = !retProfile
    ? `<ReturnPolicy>
        <ReturnsAcceptedOption>ReturnsAccepted</ReturnsAcceptedOption>
        <RefundOption>MoneyBack</RefundOption>
        <ReturnsWithinOption>Days_30</ReturnsWithinOption>
        <ShippingCostPaidByOption>Buyer</ShippingCostPaidByOption>
      </ReturnPolicy>` : "";

  const policiesXml = `${sellerProfilesXml}${inlineShippingXml}${inlineReturnXml}`;
  void hasProfiles;

  const xmlBody = `<Item>
    <Title>${xmlEscape(listing.title.slice(0, 80))}</Title>
    <Description><![CDATA[${listing.description}]]></Description>
    <PrimaryCategory><CategoryID>${listing.categoryId}</CategoryID></PrimaryCategory>
    <StartPrice currencyID="USD">${listing.priceUsd.toFixed(2)}</StartPrice>
    <ConditionID>${listing.conditionId}</ConditionID>
    <Country>JP</Country>
    <Location>Japan</Location>
    <Currency>USD</Currency>
    <ListingDuration>GTC</ListingDuration>
    <ListingType>FixedPriceItem</ListingType>
    <Quantity>1</Quantity>
    <Site>US</Site>
    <SKU>${xmlEscape(listing.sku)}</SKU>
    <DispatchTimeMax>5</DispatchTimeMax>
    <PictureDetails>${pictureXml}</PictureDetails>
    ${aspectXml ? `<ItemSpecifics>${aspectXml}</ItemSpecifics>` : ""}
    ${policiesXml}
  </Item>`;

  try {
    const res = await callTradingApi("VerifyAddFixedPriceItem", xmlBody);
    console.log("\n=== Verify Success ===");
    console.log("Ack:", res.Ack);
    console.log("Fees:", JSON.stringify(res.Fees, null, 2)?.slice(0, 500));
    if (res.Errors) {
      console.log("Warnings/Errors:", JSON.stringify(res.Errors, null, 2));
    }
  } catch (err) {
    console.error("\n=== Verify Failed ===");
    console.error(err instanceof Error ? err.message : err);
  }

  await client.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
