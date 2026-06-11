import { describe, it, expect } from "vitest";
import { validateEbayListing } from "../validation";
import type { EbayListingData } from "../mapping";

function makeListing(overrides: Partial<EbayListingData> = {}): EbayListingData {
  return {
    sku: "KAIO-TEST123",
    title: "Japanese Samurai Kabuto Helmet",
    description: "Test description for eBay listing validation",
    categoryId: "11644",
    conditionString: "USED_EXCELLENT",
    conditionId: 3000,
    priceUsd: 150,
    shippingCostUsd: 0,
    quantity: 1,
    imageUrls: ["https://example.com/img1.jpg"],
    aspects: { Type: ["Kabuto"] },
    format: "FixedPrice",
    ...overrides,
  };
}

describe("validateEbayListing", () => {
  it("returns valid for a complete listing", () => {
    const result = validateEbayListing(makeListing());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("fails when SKU is empty", () => {
    const result = validateEbayListing(makeListing({ sku: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: "sku" })
    );
  });

  it("fails when title is empty", () => {
    const result = validateEbayListing(makeListing({ title: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: "title" })
    );
  });

  it("fails when title exceeds 80 characters", () => {
    const result = validateEbayListing(makeListing({ title: "A".repeat(81) }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: "title" })
    );
  });

  it("passes when title is exactly 80 characters", () => {
    const result = validateEbayListing(makeListing({ title: "A".repeat(80) }));
    expect(result.valid).toBe(true);
  });

  it("fails when price is 0", () => {
    const result = validateEbayListing(makeListing({ priceUsd: 0 }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: "priceUsd" })
    );
  });

  it("fails when price is negative", () => {
    const result = validateEbayListing(makeListing({ priceUsd: -10 }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: "priceUsd" })
    );
  });

  it("fails when categoryId is empty", () => {
    const result = validateEbayListing(makeListing({ categoryId: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: "categoryId" })
    );
  });

  it("fails when no images", () => {
    const result = validateEbayListing(makeListing({ imageUrls: [] }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: "imageUrls" })
    );
  });

  it("fails when images don't start with https://", () => {
    const result = validateEbayListing(makeListing({
      imageUrls: ["http://example.com/img.jpg"],
    }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: "imageUrls" })
    );
  });

  it("reports multiple errors at once", () => {
    const result = validateEbayListing(makeListing({
      sku: "",
      title: "",
      priceUsd: 0,
      imageUrls: [],
    }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });
});
