import type { Item } from "@/lib/db/schema";

const CSV_COLUMNS: { header: string; value: (item: Item) => string }[] = [
  { header: "ID", value: (i) => i.id },
  { header: "メルカリID", value: (i) => i.mercariId ?? "" },
  { header: "メルカリタイトル", value: (i) => i.mercariTitle },
  { header: "メルカリ価格(JPY)", value: (i) => String(i.mercariPrice ?? "") },
  { header: "メルカリステータス", value: (i) => i.mercariStatus },
  { header: "メルカリカテゴリ", value: (i) => i.mercariCategory ?? "" },
  { header: "メルカリ状態", value: (i) => i.mercariCondition ?? "" },
  { header: "いいね数", value: (i) => String(i.mercariLikes ?? "") },
  { header: "eBayタイトル", value: (i) => i.ebayTitle ?? "" },
  { header: "eBay価格(USD)", value: (i) => String(i.ebayPriceUsd ?? "") },
  { header: "eBayステータス", value: (i) => i.ebayStatus },
  { header: "eBay出品ID", value: (i) => i.ebayListingId ?? "" },
  { header: "重量(g)", value: (i) => String(i.weightG ?? "") },
  { header: "長さ(cm)", value: (i) => String(i.lengthCm ?? "") },
  { header: "幅(cm)", value: (i) => String(i.widthCm ?? "") },
  { header: "高さ(cm)", value: (i) => String(i.heightCm ?? "") },
  { header: "送料(USD)", value: (i) => String(i.shippingCostUsd ?? "") },
  { header: "関税(USD)", value: (i) => String(i.customsDutyUsd ?? "") },
  { header: "eBay手数料(USD)", value: (i) => String(i.ebayFeeUsd ?? "") },
  { header: "広告費(USD)", value: (i) => String(i.adCostUsd ?? "") },
  { header: "推定利益(USD)", value: (i) => String(i.estimatedProfitUsd ?? "") },
  { header: "兜カテゴリ", value: (i) => i.kabutoCategory ?? "" },
  { header: "AIスコア", value: (i) => String(i.aiScore ?? "") },
  { header: "判定", value: (i) => i.decision ?? "" },
  { header: "作成日", value: (i) => i.createdAt },
  { header: "更新日", value: (i) => i.updatedAt },
];

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportItemsToCSV(items: Item[]): void {
  const header = CSV_COLUMNS.map((c) => escapeCSV(c.header)).join(",");
  const rows = items.map((item) =>
    CSV_COLUMNS.map((c) => escapeCSV(c.value(item))).join(",")
  );
  const csv = [header, ...rows].join("\n");

  // BOM付きUTF-8 for Excel compatibility
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kaio-items-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
