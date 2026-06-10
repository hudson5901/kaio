import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

interface ScoreInput {
  title: string;
  description: string | null;
  priceJpy: number;
  imageCount: number;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  weightG: number | null;
}

interface ScoreResult {
  score: number; // 0-100
  reason: string; // Japanese explanation
}

export async function scoreItem(input: ScoreInput): Promise<ScoreResult> {
  const prompt = `あなたは日本の古美術品・武具のeBay転売の専門家です。
以下のメルカリ出品アイテムを分析し、eBayでの転売収益性を0〜100のスコアで評価してください。

【商品情報】
タイトル: ${input.title}
説明文: ${input.description || "なし"}
価格: ¥${input.priceJpy.toLocaleString()}
画像枚数: ${input.imageCount}
サイズ: ${input.lengthCm ? `全長${input.lengthCm}cm` : "不明"} ${input.widthCm ? `幅${input.widthCm}cm` : ""} ${input.heightCm ? `高さ${input.heightCm}cm` : ""}
重量: ${input.weightG ? `${input.weightG}g` : "不明"}

【評価基準】
- 希少性・コレクター需要（海外のコレクターが欲しがるか）
- 状態の良さ（説明文から推定）
- 海外需要（欧米市場での人気度）
- 利益率（仕入れ値に対してどれだけマークアップできるか）
- 送料に対するサイズ・重量の効率
- 画像の充実度

以下のJSON形式で回答してください。他のテキストは含めないでください。
{"score": <0-100の整数>, "reason": "<日本語で50文字以内の理由>"}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });

  try {
    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const result = JSON.parse(jsonMatch[0]);
    return {
      score: Math.max(0, Math.min(100, Math.round(result.score))),
      reason: result.reason || "評価理由なし",
    };
  } catch {
    return { score: 50, reason: "AI評価に失敗しました" };
  }
}
