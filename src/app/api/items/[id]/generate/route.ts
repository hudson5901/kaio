import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

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
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: `You are an expert eBay seller specializing in Japanese antiques, swords (katana), armor (yoroi), helmets (kabuto), and sword fittings (tsuba, menuki, fuchi-kashira).

Generate an English eBay listing title and description for this Japanese item.

**Japanese Title:** ${item.mercariTitle}
**Japanese Description:** ${item.mercariDescription || "N/A"}
**Price (JPY):** ¥${item.mercariPrice.toLocaleString()}
**Dimensions:** ${[
            item.lengthCm ? `Length: ${item.lengthCm}cm` : null,
            item.widthCm ? `Width: ${item.widthCm}cm` : null,
            item.heightCm ? `Height: ${item.heightCm}cm` : null,
            item.weightG ? `Weight: ${item.weightG}g` : null,
          ]
            .filter(Boolean)
            .join(", ") || "Unknown"}

Requirements:
1. **Title** (max 80 characters): Include key search terms. Format: "[Type] [Key Details] - [Era/Period if known] [Material if known]". Use terms buyers search for: "Japanese", "Antique", "Samurai", "Katana", "Kabuto", "Tsuba", etc.

2. **Description** (structured HTML for eBay): Write a professional, detailed listing description. Include:
   - A compelling opening line about the item
   - Condition details (infer from description/photos context)
   - Measurements in both cm and inches
   - Historical context if the era/period can be identified
   - Material details if identifiable
   - A note about shipping from Japan
   - Disclaimer about import regulations

Format your response as JSON:
{
  "title": "...",
  "description": "..."
}

The description should use simple HTML tags (p, strong, br, ul, li, h3) for eBay compatibility. Make it sound professional and trustworthy. Do NOT use markdown.`,
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

    // Save to DB
    await db
      .update(schema.items)
      .set({
        ebayTitle: generated.title,
        ebayDescription: generated.description,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.items.id, id));

    return NextResponse.json({
      success: true,
      title: generated.title,
      description: generated.description,
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

    await db
      .update(schema.items)
      .set({
        ebayTitle: title,
        ebayDescription: htmlDesc,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.items.id, id));

    return NextResponse.json({
      success: true,
      title,
      description: htmlDesc,
      fallback: true,
      error: String(error),
    });
  }
}
