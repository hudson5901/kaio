import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getCategory, type KabutoCategory } from "@/lib/kabuto/categories";

export const maxDuration = 300;

const GEMINI_MODEL = "gemini-3.1-pro-preview";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `You are an expert eBay seller at "kaito_japanese_samurai_store" (100% positive feedback, 38+ sales). You specialize in Japanese samurai armor, helmets, and antiques shipped from Japan.

You write professional, compelling eBay listings that drive sales. Your style is:
- Confident and knowledgeable about Japanese armor terminology
- Honest about condition (builds trust and reduces returns)
- SEO-optimized titles that use every character wisely

REFERENCE — Standard output format for the item-specific section (everything else is added automatically).
All listings follow this exact format. Fill ONLY the bracketed dynamic values for each item.

[Age] Edo Period Style
[Material] Iron, Lacquer
[Artist] Unknown
[Size Approx.]
W31 × D25 × H26 cm
Only included Kabuto

[Description]
This is an antique Japanese samurai helmet, known as a kabuto.
It features a Momonari-style design, a classic helmet shape.
Please check all photos carefully before purchasing.`;

/** 固定フッター (英語) — 全リスティングに統一付与 */
const FOOTER_HTML = `<hr/>
<p><strong>[Shipping]</strong></p>
<p>We ship from Japan using FedEx, DHL, UPS, or Japan Post, depending on the destination and shipping conditions.</p>
<p>We usually ship within 3–10 business days after receiving cleared payment.</p>
<p>Delivery may take longer depending on customs clearance, local delivery conditions, or transportation delays in your country.</p>
<p><strong>[International Buyers]</strong></p>
<p><strong>United States:</strong> Import duties and fees are included when shipped under eBay's DDP process.</p>
<p><strong>Other Countries:</strong> Import duties, taxes, customs fees, or other charges are not included in the item price or shipping cost. These charges are the buyer's responsibility.</p>
<p>Please check with your country's customs office before purchasing if you are unsure about possible additional costs.</p>
<p><strong>[Customs Declaration]</strong></p>
<p>We declare the item accurately and at the actual purchase value.</p>
<p>We do not mark items as "gifts" or declare a lower value, as this is prohibited by international customs regulations.</p>
<p><strong>[After Purchase]</strong></p>
<p>Please contact us if there are any problems after you receive the item.</p>
<p>We will do our best to resolve the issue.</p>
<p>We promise to pack your item carefully.</p>
<p>If you are looking for other Japanese antiques or samurai items, please feel free to contact us.</p>
<p>We may be able to find them for you.</p>`;

/** 固定フッター (日本語) — 文言チェック用 */
const FOOTER_HTML_JA = `<hr/>
<p><strong>[配送]</strong></p>
<p>配送先と輸送状況に応じて、FedEx、DHL、UPS、または日本郵便で日本から発送します。</p>
<p>通常はご入金確認後3〜10営業日以内に発送します。</p>
<p>通関、配送状況、輸送遅延により、到着が遅れる場合があります。</p>
<p><strong>[海外バイヤーへの案内]</strong></p>
<p><strong>米国向け:</strong> eBayのDDPプロセスで発送する場合、輸入関税および手数料は商品代金に含まれます。</p>
<p><strong>その他の国:</strong> 輸入関税・税金・通関手数料などは商品代金および送料に含まれません。これらはお客様のご負担となります。</p>
<p>追加費用についてご不明な点があれば、購入前にお住まいの国の税関にご確認ください。</p>
<p><strong>[関税申告について]</strong></p>
<p>商品は実際の購入価格で正確に申告します。</p>
<p>国際税関規則違反のため、商品を「ギフト」として申告したり、低い金額で申告することはいたしません。</p>
<p><strong>[ご購入後]</strong></p>
<p>商品到着後に問題があれば、お気軽にご連絡ください。</p>
<p>最善を尽くして解決いたします。</p>
<p>大切に梱包してお送りいたします。</p>
<p>他に日本のアンティークや侍関連品をお探しでしたら、お気軽にご相談ください。</p>
<p>お探しできるかもしれません。</p>`;

/**
 * AI生成の説明文をサニタイズ＋固定フッター付与
 */
function finalizeDescription(raw: string, lang: "en" | "ja" = "en"): string {
  const shippingMarkers = lang === "ja"
    ? ["[配送]", "[海外バイヤー", "[関税申告", "[ご購入後]"]
    : ["[Shipping]", "[International Buyers]", "[Customs Declaration]", "[After Purchase]"];
  let desc = raw
    .replace(/https?:\/\/[^\s"'<>]*mercari\.com[^\s"'<>]*/gi, "")
    .replace(/https?:\/\/[^\s"'<>]*rakuten\.co[^\s"'<>]*/gi, "")
    .trim();
  // AI が誤って固定フッター部分まで生成した場合、最初のフッター見出し以降を切り捨て
  for (const marker of shippingMarkers) {
    const idx = desc.indexOf(marker);
    if (idx > 0) {
      // 直前の <hr/> や <strong> 開きタグも巻き込んで切る
      const cutTo = Math.max(0, desc.lastIndexOf("<", idx));
      desc = desc.slice(0, cutTo).trim();
      break;
    }
  }
  return desc + "\n" + (lang === "ja" ? FOOTER_HTML_JA : FOOTER_HTML);
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

## DESCRIPTION RULES (100% English HTML, FIXED TEMPLATE — fill only the bracketed values)

You MUST produce the description in this EXACT structure. The HTML below is the template;
replace ONLY the bracketed values with what fits THIS specific item.

<p><strong>[Age]</strong> {era e.g. "Edo Period Style", "Meiji Period", "Showa Era", "Pre-1800", "1900-1940"}</p>
<p><strong>[Material]</strong> {main materials, comma separated, e.g. "Iron, Lacquer", "Mixed Materials", "Iron, Silk, Gold Leaf"}</p>
<p><strong>[Artist]</strong> {maker name from the Japanese title/description if any, otherwise "Unknown"}</p>
<p><strong>[Size Approx.]</strong></p>
<p>W{width} × D{depth} × H{height} cm<br/>{what is included, e.g. "Only included Kabuto", "Kabuto + Yoroi Set", "Helmet, Yumi, Tachi"}</p>
<p><strong>[Description]</strong></p>
<p>{Sentence 1: What this piece is in plain English.}<br/>{Sentence 2: A distinguishing feature you actually see in the photos (style, decoration, condition).}<br/>{Sentence 3 (optional): Honest condition note. End with "Please check all photos carefully before purchasing."}</p>

RULES:
- Write entirely in English (translate every Japanese fragment).
- Describe what you SEE in the photos. Don't invent details.
- Don't include mercari.com URLs or other marketplace references.
- DO NOT include Shipping / International Buyers / Customs Declaration / After Purchase sections — those are added automatically.
- If a dimension is missing, omit that letter (e.g. "W31 × H26 cm") rather than guessing.

## ASPECTS (Item Specifics) — each value is a string array
- "Type": e.g. ["Kabuto"], ["Yoroi Set"], ["Menpo"]
- "Primary Material": e.g. ["Iron"], ["Mixed Materials"]
- "Color": dominant color(s) you see, e.g. ["Gold", "Black"]
- "Original/Reproduction": ["Vintage Original"] or ["Reproduction"]
- "Featured Refinements": one comma-separated string, e.g. ["samurai helmet,kabuto,armor yoroi"]
- "Region/Country of Origin": ["Japan"]
- "Age": ["Pre-1800"], ["1800-1899"], ["1900-1940"], ["Post-1940"], or ["Unknown"]

## JAPANESE TRANSLATION (for the seller to verify wording)
Provide a natural Japanese translation of your English output so the seller can confirm the English version is accurate. The Japanese is NOT for buyers — it's a back-translation for QA.

- "titleJa": natural Japanese title that conveys the SAME meaning as your English title (no 80-char limit, use full kanji/kana naturally)
- "descriptionJa": back-translate the English description into Japanese with the EXACT SAME template structure ([Age]/[Material]/[Artist]/[Size Approx.]/[Description] sections, same paragraph breaks). Use the same brackets but translate the labels (e.g. <strong>[時代]</strong>, <strong>[素材]</strong>, <strong>[作家]</strong>, <strong>[サイズ目安]</strong>, <strong>[説明]</strong>). Do NOT include 配送 / 海外バイヤー / 関税申告 / ご購入後 sections — added automatically.
- "aspectsJa": same KEYS as "aspects" (English keys like "Type", "Color"), but VALUES translated to Japanese. e.g. {"Type": ["甲冑セット、兜、五月人形"], "Color": ["金", "橙", "黒"], "Primary Material": ["混合素材、金属、布"]}

Respond with JSON:
{"title":"...","description":"<h3>...</h3><p>...</p>...","aspects":{...},"titleJa":"...","descriptionJa":"<h3>...</h3><p>...</p>...","aspectsJa":{...}}`,
    });

    const text = await callGemini(parts);

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse AI response");
    }

    const generated = JSON.parse(jsonMatch[0]);

    // タイトル: 80文字制限（英語のみ。日本語訳はチェック用なので長さ制限なし）
    const title = (generated.title || "").slice(0, 80).trim();
    const titleJa = (generated.titleJa || "").trim() || null;

    // 説明文: サニタイズ + 固定フッター付与
    const description = finalizeDescription(generated.description || "");
    const descriptionJa = generated.descriptionJa
      ? finalizeDescription(generated.descriptionJa, "ja")
      : null;

    // aspectsをマージ（AI生成 > 既存）
    const mergedAspects = {
      ...existingAspects,
      ...(generated.aspects || {}),
    };
    const aspectsJa = generated.aspectsJa && typeof generated.aspectsJa === "object"
      ? generated.aspectsJa
      : null;

    // Save to DB
    await db
      .update(schema.items)
      .set({
        ebayTitle: title,
        ebayDescription: description,
        ebayAspects: JSON.stringify(mergedAspects),
        ebayTitleJa: titleJa,
        ebayDescriptionJa: descriptionJa,
        ebayAspectsJa: aspectsJa ? JSON.stringify(aspectsJa) : null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.items.id, id));

    return NextResponse.json({
      success: true,
      title,
      description,
      aspects: mergedAspects,
      titleJa,
      descriptionJa,
      aspectsJa,
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

    // フォールバック時の日本語訳は元のメルカリ情報をそのまま流用（AI失敗時のチェック用フォールバック）
    const titleJa = item.mercariTitle;
    const descriptionJa = item.mercariDescription
      ? finalizeDescription(`<p>${item.mercariDescription.replace(/\n/g, "</p><p>")}</p>`, "ja")
      : null;

    await db
      .update(schema.items)
      .set({
        ebayTitle: title,
        ebayDescription: fullHtmlDesc,
        ebayTitleJa: titleJa,
        ebayDescriptionJa: descriptionJa,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.items.id, id));

    return NextResponse.json({
      success: true,
      title,
      description: fullHtmlDesc,
      titleJa,
      descriptionJa,
      fallback: true,
      error: String(error),
    });
  }
}
