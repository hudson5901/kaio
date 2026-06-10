import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getCategory, KABUTO_CATEGORIES, type KabutoCategory } from "@/lib/kabuto/categories";

const client = new Anthropic();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const item = await db.query.items.findFirst({
    where: eq(schema.items.id, id),
  });

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  try {
    // カテゴリ情報を取得（設定済みならそれを使用、なければ汎用）
    const category = item.kabutoCategory
      ? getCategory(item.kabutoCategory as KabutoCategory)
      : null;

    const dimensionsStr = [
      item.lengthCm ? `Length: ${item.lengthCm}cm` : null,
      item.widthCm ? `Width: ${item.widthCm}cm` : null,
      item.heightCm ? `Height: ${item.heightCm}cm` : null,
      item.weightG ? `Weight: ${item.weightG}g` : null,
    ]
      .filter(Boolean)
      .join(", ") || "Unknown";

    const categoryPrompt = category
      ? `
**Item Category:** ${category.id} - ${category.nameEn}
**Category Hints:** ${category.promptHints}
**Required Title Keywords (use as many as fit):** ${category.titleKeywords.join(", ")}
**Default eBay Condition:** ${category.defaultCondition}
`
      : "";

    const existingAspects = item.ebayAspects
      ? JSON.parse(item.ebayAspects)
      : category?.defaultAspects || {};

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: `You are an expert eBay seller specializing in Japanese samurai armor (yoroi), helmets (kabuto), and antiques.

Generate an optimized eBay listing for this Japanese item.

**Japanese Title:** ${item.mercariTitle}
**Japanese Description:** ${item.mercariDescription || "N/A"}
**Price (JPY):** ¥${item.mercariPrice.toLocaleString()}
**Dimensions:** ${dimensionsStr}
${categoryPrompt}

## TITLE (max 80 characters)
Create an SEO-optimized title. Reference format: "Vintage Japanese Samurai Helmet Antique Kabuto Dragon Armor Yoroi unwearable"
- Pack with high-search-volume keywords: Japanese, Samurai, Helmet, Kabuto, Antique, Vintage, Armor, Yoroi, Dragon, Iron, etc.
- DO NOT use special characters or all-caps
- Every word should be a searchable keyword - no filler words

## DESCRIPTION (structured HTML)
Write a professional HTML description with these sections. Use only simple HTML tags (h3, p, strong, br, ul, li, table, tr, td, hr) for eBay compatibility.

### Required sections:

1. **Opening** - Brief compelling introduction (2-3 sentences about the item)

2. **Item Details** - HTML table format:
   | Detail | Value |
   |--------|-------|
   | Type | (Kabuto/Yoroi/etc) |
   | Period/Era | (infer from description, or "Unknown") |
   | Primary Material | (Iron/Wood/Lacquer/etc) |
   | Included Items | (list all accessories: box, stand, sword, etc) |
   | Condition | (infer from Japanese description) |

3. **Measurements** - Both cm AND inches:
   - Height: Xcm (X inches)
   - Width: Xcm (X inches)
   - Weight: Xg (X lbs)

4. **Shipping** section:
   <h3>Shipping</h3>
   <ul>
   <li>Ships from Japan via EMS (Express Mail Service)</li>
   <li>Estimated delivery: 3-7 business days to USA/Europe</li>
   <li>Carefully packed with protective materials for safe international shipping</li>
   <li>Tracking number provided</li>
   </ul>

5. **Important Notice** section:
   <h3>Important Notice</h3>
   <ul>
   <li>Import duties, taxes, and charges are the buyer's responsibility</li>
   <li>Please check your country's import regulations before purchasing</li>
   <li>Colors may vary slightly due to monitor settings</li>
   </ul>

6. **Return Policy**:
   <p>30-day returns accepted. Item must be returned in original condition.</p>

## ASPECTS (Item Specifics)
Extract from the Japanese description and return as JSON object. Required fields:
- "Type": e.g. ["Kabuto"], ["Yoroi"], ["Kabuto", "Menpo"]
- "Primary Material": e.g. ["Iron"], ["Iron", "Lacquer"], ["Wood", "Metal"]
- "Color": e.g. ["Black"], ["Gold", "Black"]
- "Original/Reproduction": ["Original"] or ["Reproduction"]
- "Featured Refinements": e.g. ["Samurai Helmet"], ["Samurai Armor"]
- "Region/Country of Origin": ["Japan"]
- "Age": e.g. ["1800-1899"], ["Post-1940"], ["Unknown"]

## Response format (JSON):
{
  "title": "...",
  "description": "<h3>...</h3><p>...</p>...",
  "aspects": {"Type": ["Kabuto"], "Primary Material": ["Iron"], ...}
}

IMPORTANT: Description must use only HTML, no markdown. Make it professional and trustworthy.`,
        },
      ],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse AI response");
    }

    const generated = JSON.parse(jsonMatch[0]);

    // aspectsをマージ（AI生成 > 既存）
    const mergedAspects = {
      ...existingAspects,
      ...(generated.aspects || {}),
    };

    // Save to DB
    await db
      .update(schema.items)
      .set({
        ebayTitle: generated.title,
        ebayDescription: generated.description,
        ebayAspects: JSON.stringify(mergedAspects),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.items.id, id));

    return NextResponse.json({
      success: true,
      title: generated.title,
      description: generated.description,
      aspects: mergedAspects,
    });
  } catch (error) {
    console.error("AI generation error:", error);
    // Fallback to rule-based generation
    const { generateEnglishTitle, generateEnglishDescription, parseDimensions } =
      await import("@/lib/mercari/parser");

    const description = item.mercariDescription || "";
    const dimensions = parseDimensions(description);
    const title = generateEnglishTitle(item.mercariTitle, description);
    const desc = generateEnglishDescription(
      item.mercariTitle,
      description,
      dimensions
    );

    // Convert plain text to simple HTML
    const htmlDesc = desc
      .split("\n")
      .map((line) => {
        if (line.startsWith("==="))
          return `<h3>${line.replace(/=/g, "").trim()}</h3>`;
        if (line.startsWith("---"))
          return `<hr/>`;
        if (line.includes(":"))
          return `<p><strong>${line.split(":")[0]}:</strong>${line.split(":").slice(1).join(":")}</p>`;
        if (line.trim()) return `<p>${line}</p>`;
        return "";
      })
      .join("\n");

    // Append shipping/notice sections to fallback too
    const shippingHtml = `
<hr/>
<h3>Shipping</h3>
<ul>
<li>Ships from Japan via EMS (Express Mail Service)</li>
<li>Estimated delivery: 3-7 business days to USA/Europe</li>
<li>Carefully packed with protective materials for safe international shipping</li>
<li>Tracking number provided</li>
</ul>
<h3>Important Notice</h3>
<ul>
<li>Import duties, taxes, and charges are the buyer's responsibility</li>
<li>Please check your country's import regulations before purchasing</li>
</ul>
<p>30-day returns accepted. Item must be returned in original condition.</p>`;

    const fullHtmlDesc = htmlDesc + shippingHtml;

    await db
      .update(schema.items)
      .set({
        ebayTitle: title,
        ebayDescription: fullHtmlDesc,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.items.id, id));

    return NextResponse.json({
      success: true,
      title,
      description: fullHtmlDesc,
      fallback: true,
      error: String(error),
    });
  }
}
