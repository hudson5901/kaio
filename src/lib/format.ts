/**
 * 表示用フォーマッタ集
 */

export function formatUsd(value: number | null | undefined, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${value.toFixed(decimals)}`;
}

export function formatJpy(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `¥${Math.round(value).toLocaleString()}`;
}

export function formatWeight(grams: number | null | undefined): string {
  if (grams == null || !Number.isFinite(grams)) return "—";
  return `${Math.round(grams).toLocaleString()}g`;
}

export function formatCm(cm: number | null | undefined): string {
  if (cm == null || !Number.isFinite(cm)) return "—";
  return `${cm} cm`;
}

export const STATUS_LABELS: Record<string, string> = {
  // mercariStatus
  available: "在庫あり",
  sold: "売り切れ",
  deleted: "削除済み",
  // ebayStatus
  draft: "下書き",
  listed: "出品中",
  removed: "取り下げ",
};

export const STATUS_COLORS: Record<string, string> = {
  available: "bg-emerald-500",
  sold: "bg-red-400",
  deleted: "bg-zinc-500",
  draft: "bg-zinc-400",
  listed: "bg-blue-400",
  removed: "bg-zinc-500",
};

export const DECISION_LABELS: Record<string, string> = {
  list: "出品",
  considering: "検討",
  pass: "パス",
  out_of_stock: "メルカリ在庫なし",
};
