import { describe, it, expect } from "vitest";
import { generateEbayDraftCsv } from "../draft-csv";
import type { EbayListingData } from "../mapping";

function makeListing(overrides: Partial<EbayListingData> = {}): EbayListingData {
  return {
    sku: "KAIO-TEST123",
    title: "Japanese Samurai Kabuto Helmet",
    description: "Test description for eBay listing",
    categoryId: "11644",
    conditionString: "USED_EXCELLENT",
    conditionId: 3000,
    priceUsd: 150,
    shippingCostUsd: 0,
    quantity: 1,
    imageUrls: ["https://example.com/img1.jpg", "https://example.com/img2.jpg"],
    aspects: {
      Type: ["Kabuto"],
      "Country/Region of Manufacture": ["Japan"],
      "Primary Material": ["Iron"],
      Color: ["Black"],
      "Original/Reproduction": ["Original"],
      "Featured Refinements": ["Samurai Helmet"],
      Age: ["Unknown"],
    },
    format: "FixedPrice",
    ...overrides,
  };
}

describe("generateEbayDraftCsv", () => {
  it("has header row as first line (no #INFO rows)", () => {
    const csv = generateEbayDraftCsv([makeListing()]);
    const lines = csv.split("\r\n");
    const header = lines[0];
    expect(header).toContain("*Action");
    expect(header).toContain("*Title");
    expect(header).toContain("*Category");
    expect(header).toContain("*StartPrice");
    expect(header).toContain("PicURL");
    expect(header).toContain("*Description");
  });

  it("uses CRLF line endings", () => {
    const csv = generateEbayDraftCsv([makeListing()]);
    const crlfCount = (csv.match(/\r\n/g) || []).length;
    const lines = csv.split("\r\n");
    expect(crlfCount).toBe(lines.length - 1);
  });

  it("does not start with BOM (BOM is added by downloadEbayDraftCsv only)", () => {
    const csv = generateEbayDraftCsv([makeListing()]);
    expect(csv.charCodeAt(0)).not.toBe(0xFEFF);
    expect(csv.startsWith("*Action")).toBe(true);
  });

  it("joins image URLs with pipe separator", () => {
    const csv = generateEbayDraftCsv([makeListing({
      imageUrls: ["https://a.com/1.jpg", "https://a.com/2.jpg", "https://a.com/3.jpg"],
    })]);
    const lines = csv.split("\r\n");
    const dataRow = lines[1]; // header + data
    expect(dataRow).toContain("https://a.com/1.jpg|https://a.com/2.jpg|https://a.com/3.jpg");
  });

  it("limits images to 24", () => {
    const urls = Array.from({ length: 30 }, (_, i) => `https://a.com/${i}.jpg`);
    const csv = generateEbayDraftCsv([makeListing({ imageUrls: urls })]);
    const lines = csv.split("\r\n");
    const dataRow = lines[1];
    const pipeCount = (dataRow.match(/https:\/\/a\.com\/\d+\.jpg/g) || []).length;
    expect(pipeCount).toBe(24);
  });

  it("rounds price to integer", () => {
    const csv = generateEbayDraftCsv([makeListing({ priceUsd: 1310.7 })]);
    const lines = csv.split("\r\n");
    const dataRow = lines[1];
    expect(dataRow).toContain(",1311,");
  });

  it("escapes fields containing commas", () => {
    const csv = generateEbayDraftCsv([makeListing({
      description: "Hello, world",
    })]);
    const lines = csv.split("\r\n");
    const dataRow = lines[1];
    expect(dataRow).toContain('"');
  });

  it("escapes fields containing double quotes", () => {
    const csv = generateEbayDraftCsv([makeListing({
      description: 'He said "hello"',
    })]);
    const lines = csv.split("\r\n");
    const dataRow = lines[1];
    expect(dataRow).toContain('""hello""');
  });

  it("wraps plain text description in <p> tags", () => {
    const csv = generateEbayDraftCsv([makeListing({
      description: "Line 1\nLine 2",
    })]);
    expect(csv).toContain("<p>Line 1<br>Line 2</p>");
  });

  it("keeps HTML description as-is", () => {
    const csv = generateEbayDraftCsv([makeListing({
      description: "<p>Already HTML</p>",
    })]);
    expect(csv).toContain("<p>Already HTML</p>");
    expect(csv).not.toContain("<p><p>");
  });

  it("outputs Draft as action", () => {
    const csv = generateEbayDraftCsv([makeListing()]);
    const lines = csv.split("\r\n");
    const dataRow = lines[1];
    expect(dataRow.startsWith("Draft,")).toBe(true);
  });

  it("outputs correct SKU", () => {
    const csv = generateEbayDraftCsv([makeListing({ sku: "KAIO-ABC" })]);
    expect(csv).toContain("KAIO-ABC");
  });

  it("handles empty listings array", () => {
    const csv = generateEbayDraftCsv([]);
    const lines = csv.split("\r\n");
    // 1 header only
    expect(lines.length).toBe(1);
  });

  it("includes multiple data rows", () => {
    const csv = generateEbayDraftCsv([
      makeListing({ sku: "KAIO-1" }),
      makeListing({ sku: "KAIO-2" }),
      makeListing({ sku: "KAIO-3" }),
    ]);
    const lines = csv.split("\r\n");
    // 1 header + 3 data = 4 lines
    expect(lines.length).toBe(4);
  });
});
