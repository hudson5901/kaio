import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getCategory, type KabutoCategory } from "@/lib/kabuto/categories";

const GEMINI_MODEL = "gemini-3.1-pro-preview";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `You are an expert eBay seller at "kaito_japanese_samurai_store" (100% positive feedback, 38+ sales). You specialize in Japanese samurai armor, helmets, and antiques shipped from Japan.

You write professional, compelling eBay listings that drive sales. Your style is:
- Confident and knowledgeable about Japanese armor terminology
- Honest about condition (builds trust and reduces returns)
- SEO-optimized titles that use every character wisely
- Clean HTML descriptions that look professional on both desktop and mobile

REFERENCE — Here is one of your best-selling listings for style/format reference:

TITLE: "Vintage Japanese Samurai Helmet MENPO Antique Hideyoshi Kabuto Armor Yoroi"

DESCRIPTION (item-specific part only — Shipping/Notice sections are added automatically):
<h3>Authentic Japanese Samurai Menpo (Face Guard)</h3>
<p>A striking piece of Japanese samurai armor history. This menpo features detailed craftsmanship with a fierce expression, characteristic of Edo-period facial armor designed to intimidate opponents on the battlefield. The piece shows beautiful patina and aging consistent with its age.</p>
<table>
<tr><td><strong>Type</strong></td><td>Menpo (Face Guard)</td></tr>
<tr><td><strong>Period/Era</strong></td><td>Edo Period Style</td></tr>
<tr><td><strong>Material</strong></td><td>Iron, Lacquer</td></tr>
<tr><td><strong>Condition</strong></td><td>Good vintage condition with age-appropriate wear</td></tr>
</table>
<h3>Condition Details</h3>
<p>This menpo is in good vintage condition with natural aging and patina. There are minor scratches and wear consistent with age. The lacquer shows some crazing typical of antique pieces. This is a display/collectible piece and is not intended for wearing.</p>
<h3>Measurements</h3>
<p>Approximately 20cm x 18cm (7.9" x 7.1"). Weight: approximately 800g (1.8 lbs).</p>`;

/** 固定フッター — 全リスティングに統一付与 */
const FOOTER_HTML = `<hr/>
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
<li>Colors may vary slightly due to monitor settings</li>
</ul>
<p>30-day returns accepted. Item must be returned in original condition.</p>`;

/**
 * AI生成の説明文をサニタイズ＋固定フッター付与
 */
function finalizeDescription(raw: string): string {
  let desc = raw
    // mercari/rakutenリンク除去
    .replace(/https?:\/\/[^\s"'<>]*mercari\.com[^\s"'<>]*/gi, "")
    .replace(/https?:\/\/[^\s"'<>]*rakuten\.co[^\s"'<>]*/gi, "")
    // AI が Shipping/Important Notice を含めてしまった場合は除去
    .replace(/<hr\s*\/?>[\s\S]*<h3>\s*Shipping\s*<\/h3>[\s\S]*$/i, "")
    .replace(/<h3>\s*Shipping\s*<\/h3>[\s\S]*$/i, "")
    .trim();

  return desc + "\n" + FOOTER_HTML;
}

/**
 * 画像URLからbase64を取得
 */
async function fetchImageAsBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const mimeType = contentType.startsWith("image/") ? contentType : "image/jpeg";
    return { base64: buf.toString("base64"), mimeType };
  } catch {
    return null;
  }
}

/**
 * Gemini API を呼び出す
 */
async function callGemini(
  parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }>,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 16000,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Gemini API error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");
  return text;
}

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
    // カテゴリ情報を取得
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
      ? `\n**Category:** ${category.id} - ${category.nameEn}\n**Hints:** ${category.promptHints}\n**Title Keywords:** ${category.titleKeywords.join(", ")}\n**Condition:** ${category.defaultCondition}`
      : "";

    const existingAspects = item.ebayAspects
      ? JSON.parse(item.ebayAspects)
      : category?.defaultAspects || {};

    // 画像を取得してAIに渡す（最大3枚）
    const imageUrls: string[] = item.mercariImages
      ? JSON.parse(item.mercariImages).slice(0, 3)
      : [];

    const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [];

    // 画像パーツを追加
    for (const url of imageUrls) {
      const img = await fetchImageAsBase64(url);
      if (img) {
        parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
      }
    }

    // テキストプロンプト
    parts.push({
      text: `Generate an eBay listing for this item. Look at the photos carefully and describe what you actually see.

**ITEM INFO:**
- Japanese Title: ${item.mercariTitle}
- Japanese Description: ${item.mercariDescription || "N/A"}
- Purchase Price: ¥${item.mercariPrice.toLocaleString()}
- Dimensions: ${dimensionsStr}${categoryPrompt}

## TITLE RULES (max 80 characters)
- Create a UNIQUE title specific to THIS item
- Start with "Vintage", "Antique", or "Japanese"
- Include specific item type (MENPO, Kabuto, Yoroi, etc.)
- Include maker/artist name if mentioned in description
- Include distinguishing features you see in photos (Dragon, Gold, Iron, etc.)
- Pack with SEO keywords: Samurai, Helmet, Kabuto, Armor, Yoroi
- NO special characters, NO price, NO exclamation marks

## DESCRIPTION RULES (100% English HTML)
- Write ENTIRELY in English — translate ALL Japanese text
- Describe what you SEE in the photos (colors, materials, decorations, damages)
- Do NOT invent details not visible in photos or mentioned in description
- Do NOT include mercari.com URLs or references to other marketplaces
- Use simple HTML only: h3, p, strong, ul, li, table, tr, td, hr

Sections (follow the reference listing format exactly):
1. **Opening heading + 2-3 sentences** — What is this piece? Why is it special?
2. **Item Details table** — Type, Period/Era, Material, Maker (if known), Included Items, Condition
3. **Condition Details** — Honest 2-3 sentences from Japanese description + what you see in photos
4. **Measurements** — cm AND inches, g AND lbs (if available)

DO NOT include Shipping or Important Notice sections — those are added automatically.

## ASPECTS (Item Specifics) — each value is a string array
- "Type": e.g. ["Kabuto"], ["Yoroi Set"], ["Menpo"]
- "Primary Material": e.g. ["Iron"], ["Mixed Materials"]
- "Color": dominant color(s) you see, e.g. ["Gold", "Black"]
- "Original/Reproduction": ["Vintage Original"] or ["Reproduction"]
- "Featured Refinements": one comma-separated string, e.g. ["samurai helmet,kabuto,armor yoroi"]
- "Region/Country of Origin": ["Japan"]
- "Age": ["Pre-1800"], ["1800-1899"], ["1900-1940"], ["Post-1940"], or ["Unknown"]

Respond with JSON:
{"title":"...","description":"<h3>...</h3><p>...</p>...","aspects":{...}}`,
    });

    const text = await callGemini(parts);

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse AI response");
    }

    const generated = JSON.parse(jsonMatch[0]);

    // タイトル: 80文字制限
    const title = (generated.title || "").slice(0, 80).trim();

    // 説明文: サニタイズ + 固定フッター付与
    const description = finalizeDescription(generated.description || "");

    // aspectsをマージ（AI生成 > 既存）
    const mergedAspects = {
      ...existingAspects,
      ...(generated.aspects || {}),
    };

    // Save to DB
    await db
      .update(schema.items)
      .set({
        ebayTitle: title,
        ebayDescription: description,
        ebayAspects: JSON.stringify(mergedAspects),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.items.id, id));

    return NextResponse.json({
      success: true,
      title,
      description,
      aspects: mergedAspects,
    });
  } catch (error) {
    console.error("AI generation error:", error);
    // Fallback to rule-based generation
    const { generateEnglishTitle, generateEnglishDescription, parseDimensions } =
      await import("@/lib/mercari/parser");

    const desc = item.mercariDescription || "";
    const dimensions = parseDimensions(desc);
    const title = generateEnglishTitle(item.mercariTitle, desc);
    const generatedDesc = generateEnglishDescription(
      item.mercariTitle,
      desc,
      dimensions
    );

    const htmlDesc = generatedDesc
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

    const fullHtmlDesc = finalizeDescription(htmlDesc);

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
