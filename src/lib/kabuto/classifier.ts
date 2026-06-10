/**
 * 兜・甲冑ルールベース分類ロジック
 *
 * メルカリのタイトル・説明文・価格からカテゴリを自動判定。
 * キーワードマッチング + 価格帯で高速分類（API不要）。
 * 信頼度が低い場合はClaude Haikuにフォールバック。
 */

import { KABUTO_CATEGORIES, type KabutoCategory, type KabutoCategoryDef } from "./categories";

export interface ClassificationResult {
  category: KabutoCategory;
  confidence: number; // 0.0 ~ 1.0
  reason: string;
  method: "rule" | "ai";
}

/**
 * ルールベース分類
 */
export function classifyByRules(
  title: string,
  description: string,
  priceJpy: number
): ClassificationResult {
  const text = `${title} ${description}`.toLowerCase();
  const scores: { id: KabutoCategory; score: number; reasons: string[] }[] = [];

  for (const cat of Object.values(KABUTO_CATEGORIES)) {
    let score = 0;
    const reasons: string[] = [];

    // キーワードマッチ (各+2点、タイトルマッチは+3点)
    for (const kw of cat.keywords) {
      if (title.includes(kw)) {
        score += 3;
        reasons.push(`タイトルに「${kw}」`);
      } else if (text.includes(kw)) {
        score += 2;
        reasons.push(`説明に「${kw}」`);
      }
    }

    // ネガティブキーワード (各-3点)
    for (const nkw of cat.negativeKeywords) {
      if (text.includes(nkw)) {
        score -= 3;
        reasons.push(`除外「${nkw}」`);
      }
    }

    // 価格帯マッチ (+5点)
    if (cat.priceRangeJpy.min > 0 || cat.priceRangeJpy.max) {
      const inRange =
        priceJpy >= cat.priceRangeJpy.min &&
        (cat.priceRangeJpy.max === null || priceJpy <= cat.priceRangeJpy.max);
      if (inRange) {
        score += 5;
        reasons.push("価格帯一致");
      }
    }

    scores.push({ id: cat.id, score, reasons });
  }

  // スコア降順ソート
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  const second = scores[1];

  // 信頼度計算: 最高スコアとの差が大きいほど高い
  const maxPossible = Math.max(best.score, 1);
  const gap = best.score - (second?.score || 0);
  const confidence = Math.min(1, Math.max(0.1, gap / maxPossible * 0.5 + best.score / 20));

  // スコアが低い場合はFにフォールバック
  if (best.score <= 2) {
    return {
      category: "F",
      confidence: 0.3,
      reason: "キーワードマッチが少ないため「その他」に分類",
      method: "rule",
    };
  }

  return {
    category: best.id,
    confidence: Math.round(confidence * 100) / 100,
    reason: best.reasons.slice(0, 3).join("、"),
    method: "rule",
  };
}

/**
 * AI分類（Claude Haiku）
 */
export async function classifyWithAI(
  title: string,
  description: string,
  priceJpy: number
): Promise<ClassificationResult> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();

  const categoryDescriptions = Object.values(KABUTO_CATEGORIES)
    .map((c) => `${c.id}: ${c.name} (${c.priceRangeJpy.min}~${c.priceRangeJpy.max ?? "上限なし"}円)`)
    .join("\n");

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `以下のメルカリ商品を兜・甲冑カテゴリに分類してください。

カテゴリ:
${categoryDescriptions}

商品タイトル: ${title}
説明文（冒頭500文字）: ${(description || "").slice(0, 500)}
価格: ¥${priceJpy.toLocaleString()}

JSONで回答: {"category": "A"~"F", "confidence": 0.0~1.0, "reason": "理由（20文字以内）"}`,
      },
    ],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) {
    return { category: "F", confidence: 0.3, reason: "AI分類失敗", method: "ai" };
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    category: parsed.category as KabutoCategory,
    confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
    reason: parsed.reason || "AI判定",
    method: "ai",
  };
}

/**
 * メイン分類関数: ルールベース → 信頼度低ならAIフォールバック
 */
export async function classifyItem(
  title: string,
  description: string,
  priceJpy: number,
  useAiFallback = true
): Promise<ClassificationResult> {
  const ruleResult = classifyByRules(title, description, priceJpy);

  // 信頼度が十分高ければルールベースの結果を返す
  if (ruleResult.confidence >= 0.6 || !useAiFallback) {
    return ruleResult;
  }

  // AIにフォールバック
  try {
    return await classifyWithAI(title, description, priceJpy);
  } catch (err) {
    console.error("AI classification failed, using rule-based result:", err);
    return ruleResult;
  }
}
