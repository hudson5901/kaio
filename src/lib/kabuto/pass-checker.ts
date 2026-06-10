/**
 * パスチェッカー: ユーザーの判定パターンから自動パス候補を検出
 *
 * ユーザーのpass/list履歴から学習したキーワード・価格パターンで
 * 新規アイテムが「パス」すべきかどうかを判定する。
 */

export interface PassCheckResult {
  shouldPass: boolean;
  confidence: number; // 0.0 ~ 1.0
  reasons: string[];
}

// パス傾向の強いキーワード（ユーザーの過去判定から抽出）
const PASS_KEYWORDS: { keyword: string; weight: number }[] = [
  // 非甲冑グッズ（強いパスシグナル）
  { keyword: "フィギュア", weight: 8 },
  { keyword: "ガチャ", weight: 9 },
  { keyword: "カプセル", weight: 8 },
  { keyword: "マスコット", weight: 9 },
  { keyword: "ぬいぐるみ", weight: 9 },
  { keyword: "ストラップ", weight: 9 },
  { keyword: "キーホルダー", weight: 9 },
  { keyword: "シール", weight: 8 },
  { keyword: "カード", weight: 6 },
  { keyword: "ペーパークラフト", weight: 8 },
  // 書籍・メディア
  { keyword: "図録", weight: 7 },
  { keyword: "書籍", weight: 8 },
  { keyword: "漫画", weight: 9 },
  { keyword: "コミック", weight: 9 },
  { keyword: "dvd", weight: 8 },
  { keyword: "ゲーム", weight: 7 },
  // 陶器・食器
  { keyword: "茶碗", weight: 8 },
  { keyword: "皿", weight: 7 },
  { keyword: "焼", weight: 4 }, // "美濃焼" etc. but also "漆焼"
  { keyword: "陶器", weight: 7 },
  { keyword: "飾り皿", weight: 8 },
  { keyword: "蓋物", weight: 7 },
  { keyword: "蒔絵", weight: 5 },
  // 衣類・アクセ
  { keyword: "tシャツ", weight: 9 },
  { keyword: "コスプレ", weight: 6 },
  { keyword: "衣装", weight: 6 },
  { keyword: "アクセサリー", weight: 7 },
  { keyword: "ペンダント", weight: 8 },
  { keyword: "指輪", weight: 8 },
  // スマホ・デジタル
  { keyword: "iphone", weight: 9 },
  { keyword: "スマホ", weight: 9 },
  { keyword: "ケース", weight: 4 }, // "ガラスケース" is positive
  // キャラクターグッズ
  { keyword: "ドラゴンボール", weight: 9 },
  { keyword: "ガンダム", weight: 9 },
  { keyword: "ワンピース", weight: 7 },
  { keyword: "ポスター", weight: 8 },
  { keyword: "タペストリー", weight: 8 },
  // その他小物
  { keyword: "ミニチュア", weight: 7 },
  { keyword: "おもちゃ", weight: 6 },
  { keyword: "トイ", weight: 7 },
  { keyword: "プラモ", weight: 7 },
  { keyword: "小物入れ", weight: 7 },
];

// 出品傾向のキーワード（パスのネガティブシグナル）
const LIST_KEYWORDS: { keyword: string; weight: number }[] = [
  { keyword: "五月人形", weight: 6 },
  { keyword: "兜飾り", weight: 7 },
  { keyword: "鎧飾り", weight: 7 },
  { keyword: "鎧兜", weight: 6 },
  { keyword: "大鎧", weight: 7 },
  { keyword: "甲冑", weight: 4 },
  { keyword: "端午の節句", weight: 6 },
  { keyword: "ガラスケース", weight: 5 },
  { keyword: "源氏兜", weight: 8 },
  { keyword: "鍬形", weight: 7 },
  { keyword: "前立", weight: 6 },
  { keyword: "具足", weight: 6 },
  { keyword: "武具", weight: 5 },
  { keyword: "金箔", weight: 5 },
  { keyword: "漆", weight: 4 },
  { keyword: "号", weight: 3 },
];

/**
 * アイテムがパスすべきかどうかを判定
 */
export function checkShouldPass(
  title: string,
  description: string | null,
  priceJpy: number
): PassCheckResult {
  const text = `${title} ${description || ""}`.toLowerCase();
  const reasons: string[] = [];
  let passScore = 0;
  let listScore = 0;

  // パスキーワードチェック
  for (const { keyword, weight } of PASS_KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) {
      passScore += weight;
      if (weight >= 7) reasons.push(`「${keyword}」検出`);
    }
  }

  // 出品キーワードチェック
  for (const { keyword, weight } of LIST_KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) {
      listScore += weight;
    }
  }

  // 価格判定
  if (priceJpy < 2000) {
    passScore += 6;
    reasons.push("低価格(¥2,000未満)");
  } else if (priceJpy < 5000) {
    passScore += 3;
    reasons.push("低価格帯");
  } else if (priceJpy >= 15000) {
    listScore += 4;
  } else if (priceJpy >= 30000) {
    listScore += 6;
  }

  // タイトルに「作」が含まれ、人名っぽい場合は出品寄り
  if (/[一-龥]{2,4}\s*作/.test(title)) {
    listScore += 5;
  }

  // "ガラスケース" は "ケース" のパスシグナルを打ち消す
  if (text.includes("ガラスケース")) {
    passScore -= 4;
  }

  // スコア計算
  const netScore = passScore - listScore;
  const shouldPass = netScore > 5;
  const confidence = Math.min(1, Math.max(0, Math.abs(netScore) / 20));

  if (shouldPass && reasons.length === 0) {
    reasons.push("パスパターン一致");
  }

  return {
    shouldPass,
    confidence: Math.round(confidence * 100) / 100,
    reasons,
  };
}

/**
 * バッチでパスチェック（一覧表示用）
 */
export function batchCheckShouldPass(
  items: Array<{ id: string; mercariTitle: string; mercariDescription: string | null; mercariPrice: number }>
): Map<string, PassCheckResult> {
  const results = new Map<string, PassCheckResult>();
  for (const item of items) {
    results.set(item.id, checkShouldPass(item.mercariTitle, item.mercariDescription, item.mercariPrice));
  }
  return results;
}
