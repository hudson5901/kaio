import { describe, it, expect } from "vitest";
import { mapItemToEbayListing, CONDITION_ID_MAP } from "../mapping";
import type { Item } from "@/lib/db/schema";

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "test-id",
    mercariId: "m12345",
    mercariUrl: "https://mercari.com/item/m12345",
    mercariTitle: "テスト兜",
    mercariDescription: "テスト説明文",
    mercariPrice: 10000,
    mercariImages: null,
    mercariStatus: "available",
    mercariSeller: null,
    mercariCategory: null,
    mercariCondition: null,
    mercariShippingFrom: null,
    mercariFeatures: null,
    mercariLikes: null,
    mercariListedAt: null,
    ebayListingId: null,
    ebayOfferId: null,
    ebayPriceUsd: 150,
    ebayTitle: null,
    ebayDescription: null,
    ebayTitleJa: null,
    ebayDescriptionJa: null,
    ebayAspectsJa: null,
    ebayStatus: "draft",
    ebayCategoryId: null,
    ebayCategoryPath: null,
    processedImages: null,
    weightG: null,
    lengthCm: null,
    widthCm: null,
    heightCm: null,
    shippingCostUsd: null,
    customsDutyUsd: null,
    ebayFeeUsd: null,
    adCostUsd: null,
    estimatedProfitUsd: null,
    kabutoCategory: null,
    kabutoCategoryConfidence: null,
    ebayAspects: null,
    decision: "list",
    aiScore: null,
    aiScoreReason: null,
    staffChecks: null,
    allCheckedAt: null,
    listingScheduledAt: null,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("mapItemToEbayListing", () => {
  it("generates SKU from mercariId", () => {
    const listing = mapItemToEbayListing(makeItem({ mercariId: "ABC123" }));
    expect(listing.sku).toBe("KAIO-ABC123");
  });

  it("uses AI-generated title and description when available", () => {
    const listing = mapItemToEbayListing(makeItem({
      ebayTitle: "Custom AI Title",
      ebayDescription: "Custom AI Description",
    }));
    expect(listing.title).toBe("Custom AI Title");
    expect(listing.description).toBe("Custom AI Description");
  });

  it("falls back to generated title when no AI title", () => {
    const listing = mapItemToEbayListing(makeItem({
      ebayTitle: null,
      ebayDescription: null,
      mercariTitle: "兜 テスト",
    }));
    expect(listing.title).toContain("Kabuto");
  });

  it("truncates title to 80 characters", () => {
    const longTitle = "A".repeat(100);
    const listing = mapItemToEbayListing(makeItem({
      ebayTitle: longTitle,
      ebayDescription: "desc",
    }));
    expect(listing.title.length).toBe(80);
  });

  it("maps condition string to condition ID", () => {
    const listing = mapItemToEbayListing(makeItem({ kabutoCategory: "A" }));
    // Category A → USED_EXCELLENT → 3000
    expect(listing.conditionString).toBe("USED_EXCELLENT");
    expect(listing.conditionId).toBe(3000);
  });

  it("maps NEW_OTHER condition correctly", () => {
    const listing = mapItemToEbayListing(makeItem({ kabutoCategory: "E" }));
    expect(listing.conditionString).toBe("NEW_OTHER");
    expect(listing.conditionId).toBe(1500);
  });

  it("parses processedImages JSON", () => {
    const listing = mapItemToEbayListing(makeItem({
      processedImages: JSON.stringify([
        "https://example.com/img1.jpg",
        "https://example.com/img2.jpg",
        "http://invalid.com/img3.jpg",
      ]),
    }));
    expect(listing.imageUrls).toEqual([
      "https://example.com/img1.jpg",
      "https://example.com/img2.jpg",
    ]);
  });

  it("handles invalid processedImages JSON", () => {
    const listing = mapItemToEbayListing(makeItem({ processedImages: "invalid json" }));
    expect(listing.imageUrls).toEqual([]);
  });

  it("uses category aspects when kabutoCategory is set", () => {
    const listing = mapItemToEbayListing(makeItem({ kabutoCategory: "A" }));
    expect(listing.aspects.Type).toEqual(["Kabuto"]);
  });

  it("uses ebayAspects when saved in DB", () => {
    const aspects = { Type: ["Yoroi"], Color: ["Red"] };
    const listing = mapItemToEbayListing(makeItem({
      ebayAspects: JSON.stringify(aspects),
    }));
    // Type/Color はユーザー指定そのまま、Brand と Country/Region は eBay 必須として自動補完
    expect(listing.aspects.Type).toEqual(["Yoroi"]);
    expect(listing.aspects.Color).toEqual(["Red"]);
    expect(listing.aspects.Brand).toEqual(["Unbranded"]);
    expect(listing.aspects["Country/Region of Manufacture"]).toEqual(["Japan"]);
  });

  it("preserves user-specified Brand when present", () => {
    const aspects = { Type: ["Kabuto"], Brand: ["Vintage Maker"] };
    const listing = mapItemToEbayListing(makeItem({
      ebayAspects: JSON.stringify(aspects),
    }));
    expect(listing.aspects.Brand).toEqual(["Vintage Maker"]);
  });

  it("auto-adds Brand=Unbranded for items without aspects", () => {
    const listing = mapItemToEbayListing(makeItem({
      ebayAspects: null,
      kabutoCategory: null,
    }));
    expect(listing.aspects.Brand).toEqual(["Unbranded"]);
  });

  it("returns priceUsd from item", () => {
    const listing = mapItemToEbayListing(makeItem({ ebayPriceUsd: 299 }));
    expect(listing.priceUsd).toBe(299);
  });

  it("returns 0 for missing price", () => {
    const listing = mapItemToEbayListing(makeItem({ ebayPriceUsd: null }));
    expect(listing.priceUsd).toBe(0);
  });

  it("always returns quantity 1 and FixedPrice format", () => {
    const listing = mapItemToEbayListing(makeItem());
    expect(listing.quantity).toBe(1);
    expect(listing.format).toBe("FixedPrice");
  });
});

describe("CONDITION_ID_MAP", () => {
  it("maps all expected conditions", () => {
    expect(CONDITION_ID_MAP.NEW).toBe(1000);
    expect(CONDITION_ID_MAP.NEW_OTHER).toBe(1500);
    expect(CONDITION_ID_MAP.NEW_WITH_DEFECTS).toBe(1750);
    expect(CONDITION_ID_MAP.USED_EXCELLENT).toBe(3000);
    expect(CONDITION_ID_MAP.USED_VERY_GOOD).toBe(3000);
    expect(CONDITION_ID_MAP.USED_GOOD).toBe(3000);
    expect(CONDITION_ID_MAP.USED_ACCEPTABLE).toBe(3000);
    expect(CONDITION_ID_MAP.FOR_PARTS_OR_NOT_WORKING).toBe(7000);
  });
});
