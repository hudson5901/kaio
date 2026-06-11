import type { EbayListingData } from "./mapping";

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export function validateEbayListing(listing: EbayListingData): ValidationResult {
  const errors: ValidationError[] = [];

  if (!listing.sku) {
    errors.push({ field: "sku", message: "SKUが必要です" });
  }

  if (!listing.title) {
    errors.push({ field: "title", message: "タイトルが必要です" });
  } else if (listing.title.length > 80) {
    errors.push({ field: "title", message: `タイトルが80文字を超えています (${listing.title.length}文字)` });
  }

  if (!listing.priceUsd || listing.priceUsd <= 0) {
    errors.push({ field: "priceUsd", message: "価格が正の数である必要があります" });
  }

  if (!listing.categoryId) {
    errors.push({ field: "categoryId", message: "カテゴリIDが必要です" });
  }

  if (!listing.description || listing.description.trim().length < 20) {
    errors.push({ field: "description", message: "説明文が短すぎます（20文字以上必要）" });
  }

  if (listing.description && /mercari\.com|rakuten\.co/i.test(listing.description)) {
    errors.push({ field: "description", message: "説明文に外部マーケットプレイスのリンクが含まれています" });
  }

  if (listing.imageUrls.length === 0) {
    errors.push({ field: "imageUrls", message: "画像が1枚以上必要です" });
  } else {
    const invalidUrls = listing.imageUrls.filter((url) => !url.startsWith("https://"));
    if (invalidUrls.length > 0) {
      errors.push({ field: "imageUrls", message: `https://で始まらない画像URLがあります (${invalidUrls.length}枚)` });
    }
  }

  return { valid: errors.length === 0, errors };
}
