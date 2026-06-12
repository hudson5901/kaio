import type { EbayListingData } from "./mapping";

interface EbayCsvColumn {
  header: string;
  value: (listing: EbayListingData) => string;
}

const EBAY_CSV_COLUMNS: EbayCsvColumn[] = [
  { header: "*Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)", value: () => "Draft" },
  { header: "CustomLabel", value: (l) => l.sku },
  { header: "*Category", value: (l) => l.categoryId },
  { header: "*Title", value: (l) => l.title },
  { header: "*ConditionID", value: (l) => String(l.conditionId) },
  { header: "*C:Country/Region of Manufacture", value: (l) => l.aspects["Country/Region of Manufacture"]?.[0] ?? l.aspects["Region/Country of Origin"]?.[0] ?? "Japan" },
  { header: "C:Type", value: (l) => l.aspects["Type"]?.[0] ?? "" },
  { header: "C:Primary Material", value: (l) => l.aspects["Primary Material"]?.[0] ?? "" },
  { header: "C:Color", value: (l) => l.aspects["Color"]?.[0] ?? "" },
  { header: "C:Original/Reproduction", value: (l) => l.aspects["Original/Reproduction"]?.[0] ?? "" },
  { header: "C:Featured Refinements", value: (l) => l.aspects["Featured Refinements"]?.[0] ?? "" },
  { header: "C:Age", value: (l) => l.aspects["Age"]?.[0] ?? "" },
  { header: "PicURL", value: (l) => l.imageUrls.slice(0, 24).join("|") },
  { header: "*Description", value: (l) => wrapDescription(l.description) },
  { header: "*Format", value: () => "FixedPrice" },
  { header: "*Duration", value: () => "GTC" },
  { header: "*StartPrice", value: (l) => String(Math.round(l.priceUsd)) },
  { header: "*Quantity", value: (l) => String(l.quantity) },
  { header: "*Location", value: () => "Tokyo" },
  { header: "ShippingType", value: () => "Flat" },
  { header: "ShippingService-1:Option", value: () => "USPSMedia" },
  { header: "ShippingService-1:Cost", value: () => "0" },
  { header: "ShipToLocation", value: () => "Worldwide" },
  { header: "IntlShippingService-1:Option", value: () => "USPSPriorityMailInternational" },
  { header: "IntlShippingService-1:Cost", value: (l) => l.shippingCostUsd ? String(l.shippingCostUsd) : "0" },
  { header: "IntlShippingService-1:Locations", value: () => "Worldwide" },
  { header: "*DispatchTimeMax", value: () => "3" },
  { header: "ReturnsAcceptedOption", value: () => "ReturnsAccepted" },
  { header: "ReturnsWithinOption", value: () => "Days_30" },
  { header: "RefundOption", value: () => "MoneyBackOrExchange" },
  { header: "ShippingCostPaidByOption", value: () => "Buyer" },
];

/**
 * Description を HTML にラップ（すでにHTMLならそのまま）
 * メルカリ等の外部マーケットプレイスリンクを除去（eBayポリシー違反防止）
 */
function wrapDescription(desc: string): string {
  // 外部マーケットプレイスリンクを除去（eBayはリンク禁止）
  const cleaned = desc
    .replace(/<a[^>]*href=["'][^"']*mercari\.com[^"']*["'][^>]*>.*?<\/a>/gi, "")
    .replace(/https?:\/\/[^\s<"]*mercari\.com[^\s<"]*/gi, "")
    .replace(/<a[^>]*href=["'][^"']*rakuten[^"']*["'][^>]*>.*?<\/a>/gi, "")
    .replace(/https?:\/\/[^\s<"]*rakuten[^\s<"]*/gi, "");

  if (/<[a-z][\s\S]*>/i.test(cleaned)) {
    return cleaned;
  }
  return `<p>${cleaned.replace(/\n/g, "<br>")}</p>`;
}

/**
 * RFC 4180 準拠の CSV エスケープ
 */
function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * EbayListingData[] → eBay File Exchange CSV 文字列
 * ヘッダー行が1行目（#INFO行なし）、UTF-8 BOM付き、改行 CRLF
 */
export function generateEbayDraftCsv(listings: EbayListingData[]): string {
  const lines: string[] = [];

  // ヘッダー行（1行目にすることでeBayにテンプレートとして認識させる）
  lines.push(EBAY_CSV_COLUMNS.map((col) => escapeCsvField(col.header)).join(","));

  // データ行
  for (const listing of listings) {
    const row = EBAY_CSV_COLUMNS.map((col) => escapeCsvField(col.value(listing)));
    lines.push(row.join(","));
  }

  return lines.join("\r\n");
}

/**
 * ブラウザでCSVをダウンロード
 */
export function downloadEbayDraftCsv(listings: EbayListingData[]): void {
  const csv = generateEbayDraftCsv(listings);
  // UTF-8 BOM付き（eBay File Exchangeが認識するために必要）
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ebay-draft-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
