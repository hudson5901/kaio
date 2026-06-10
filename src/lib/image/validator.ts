import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";

const client = new Anthropic();

const VALIDATION_SIZE = 800;

interface ValidationResult {
  score: number; // 0-100
  reason: string;
}

/**
 * 処理済み画像を Claude Haiku vision で品質チェックし、背景除去の品質を 0-100 で評価
 */
export async function validateBgRemoval(
  imageBuffer: Buffer
): Promise<ValidationResult> {
  // 800x800 にダウンスケール（コスト削減）
  const resized = await sharp(imageBuffer)
    .resize(VALIDATION_SIZE, VALIDATION_SIZE, { fit: "contain" })
    .jpeg({ quality: 80 })
    .toBuffer();

  const base64 = resized.toString("base64");

  const prompt = `あなたは商品画像の背景除去の品質を評価する専門家です。
この画像は商品の背景を黒に置き換える処理を行った結果です。

以下の基準で品質を0〜100のスコアで評価してください：
- 背景の均一性（黒が均一か、元の背景が残っていないか）
- エッジ品質（商品の輪郭が自然か、ギザギザやハローがないか）
- 商品の完全性（商品の一部が切り取られていないか）
- アーティファクト（不自然な色のにじみ、ゴースト等がないか）
- 全体印象（eBay出品画像として適切か）

以下のJSON形式で回答してください。他のテキストは含めないでください。
{"score": <0-100の整数>, "reason": "<日本語で50文字以内の理由>"}`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: base64 },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const result = JSON.parse(jsonMatch[0]);
    return {
      score: Math.max(0, Math.min(100, Math.round(result.score))),
      reason: result.reason || "評価理由なし",
    };
  } catch (err) {
    console.error("Background removal validation failed:", err);
    return { score: -1, reason: "バリデーションAPI エラー" };
  }
}
