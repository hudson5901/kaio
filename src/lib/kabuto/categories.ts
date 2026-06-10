/**
 * 兜・甲冑カテゴリ定義
 *
 * メルカリの兜アイテムを6つのカテゴリに分類し、
 * eBay出品時のテンプレート・デフォルト値・Item Specificsを提供する。
 */

export type KabutoCategory = "A" | "B" | "C" | "D" | "E" | "F";

export interface KabutoCategoryDef {
  id: KabutoCategory;
  name: string;
  nameEn: string;
  description: string;

  // 価格帯 (メルカリ円)
  priceRangeJpy: { min: number; max: number | null };

  // eBayタイトル生成
  titleTemplate: string;
  titleKeywords: string[];

  // eBay Item Specifics
  defaultAspects: Record<string, string[]>;

  // デフォルト重量・サイズ (送料計算用)
  defaultWeightG: number;
  defaultDimensions: { lengthCm: number; widthCm: number; heightCm: number };

  // AI生成時の追加指示
  promptHints: string;

  // eBayカテゴリ・コンディション
  ebayCategoryId: string;
  defaultCondition: string;

  // 分類用キーワード
  keywords: string[];
  negativeKeywords: string[];
}

export const KABUTO_CATEGORIES: Record<KabutoCategory, KabutoCategoryDef> = {
  A: {
    id: "A",
    name: "新しめ複合素材兜（箱・小刀付き）",
    nameEn: "Modern Composite Kabuto with Box & Accessories",
    description: "比較的新しい装飾用兜。木製・金属・合成素材の複合。箱や小刀付きが多い。",
    priceRangeJpy: { min: 5000, max: 50000 },
    titleTemplate: "Japanese Samurai Kabuto Helmet Display with Stand Box",
    titleKeywords: [
      "Japanese", "Samurai", "Kabuto", "Helmet", "Display",
      "Decorative", "Dragon", "Stand", "Box",
    ],
    defaultAspects: {
      Type: ["Kabuto"],
      "Primary Material": ["Metal", "Wood"],
      Color: ["Gold", "Black"],
      "Original/Reproduction": ["Reproduction"],
      "Featured Refinements": ["Samurai Helmet"],
      "Region/Country of Origin": ["Japan"],
      Age: ["Post-1940"],
    },
    defaultWeightG: 3000,
    defaultDimensions: { lengthCm: 35, widthCm: 30, heightCm: 35 },
    promptHints: "This is a decorative display kabuto, likely modern reproduction. Often comes with a wooden box and small decorative sword (kogai/kogatana). Emphasize display quality and decorative value. Mention included accessories (box, stand, sword if present).",
    ebayCategoryId: "11644", // Collectibles & Art > Asian Antiques > Japan > Armor
    defaultCondition: "USED_EXCELLENT",
    keywords: ["兜", "飾り", "端午", "五月人形", "置物", "小刀", "箱付き", "台付き", "甲冑飾り"],
    negativeKeywords: ["鎧", "甲冑セット", "着用", "鉄", "江戸", "時代"],
  },

  B: {
    id: "B",
    name: "新しめ鎧兜セット",
    nameEn: "Modern Yoroi Armor & Kabuto Set",
    description: "比較的新しい鎧兜のフルセット。装飾・ディスプレイ用。胴・面頬・篭手などが付属。",
    priceRangeJpy: { min: 20000, max: 150000 },
    titleTemplate: "Japanese Samurai Yoroi Armor Kabuto Helmet Full Set Display",
    titleKeywords: [
      "Japanese", "Samurai", "Yoroi", "Armor", "Kabuto", "Helmet",
      "Full Set", "Display", "Dragon",
    ],
    defaultAspects: {
      Type: ["Yoroi"],
      "Primary Material": ["Iron", "Lacquer"],
      Color: ["Black", "Gold"],
      "Original/Reproduction": ["Reproduction"],
      "Featured Refinements": ["Samurai Armor"],
      "Region/Country of Origin": ["Japan"],
      Age: ["Post-1940"],
    },
    defaultWeightG: 8000,
    defaultDimensions: { lengthCm: 50, widthCm: 45, heightCm: 60 },
    promptHints: "This is a full armor set with kabuto helmet, do (chest), kote (gauntlets), etc. Emphasize the completeness of the set and display quality. List all included pieces.",
    ebayCategoryId: "11644",
    defaultCondition: "USED_EXCELLENT",
    keywords: ["鎧兜", "甲冑セット", "鎧", "甲冑", "フルセット", "胴", "面頬", "篭手", "鎧飾り"],
    negativeKeywords: ["江戸", "時代物", "古い"],
  },

  C: {
    id: "C",
    name: "全金属重量兜のみ",
    nameEn: "Heavy Iron/Metal Kabuto Helmet",
    description: "鉄・金属製の重い兜。アンティーク風だが年代は混在。着用不可のディスプレイ品も含む。",
    priceRangeJpy: { min: 30000, max: 200000 },
    titleTemplate: "Vintage Japanese Samurai Helmet Antique Kabuto Iron Armor Yoroi",
    titleKeywords: [
      "Vintage", "Japanese", "Samurai", "Helmet", "Antique",
      "Kabuto", "Iron", "Armor", "Yoroi", "Metal",
    ],
    defaultAspects: {
      Type: ["Kabuto"],
      "Primary Material": ["Iron"],
      Color: ["Black"],
      "Original/Reproduction": ["Original"],
      "Featured Refinements": ["Samurai Helmet"],
      "Region/Country of Origin": ["Japan"],
      Age: ["Unknown"],
    },
    defaultWeightG: 5000,
    defaultDimensions: { lengthCm: 35, widthCm: 30, heightCm: 30 },
    promptHints: "This is a heavy metal/iron kabuto. Emphasize the weight and solid construction as evidence of quality. Note any battle damage, patina, or aging as authenticity markers. Describe the metal work (rivets, plates, etc). If unwearable, mention it as 'display/collectible piece'.",
    ebayCategoryId: "11644",
    defaultCondition: "USED_ACCEPTABLE",
    keywords: ["鉄", "金属", "鉄製", "鉄兜", "重い", "重量", "アンティーク"],
    negativeKeywords: ["飾り", "五月人形", "プラスチック", "着用可"],
  },

  D: {
    id: "D",
    name: "江戸時代ガチ甲冑（着用可・高額）",
    nameEn: "Edo Period Authentic Samurai Armor",
    description: "江戸時代など歴史的な本物の甲冑。着用可能で高額。鑑定書付きの場合あり。",
    priceRangeJpy: { min: 100000, max: null },
    titleTemplate: "Authentic Edo Period Japanese Samurai Armor Yoroi Kabuto Antique",
    titleKeywords: [
      "Authentic", "Edo", "Period", "Japanese", "Samurai",
      "Armor", "Yoroi", "Kabuto", "Antique", "Wearable",
    ],
    defaultAspects: {
      Type: ["Yoroi"],
      "Primary Material": ["Iron", "Silk", "Lacquer"],
      Color: ["Black", "Red"],
      "Original/Reproduction": ["Original"],
      "Featured Refinements": ["Samurai Armor"],
      "Region/Country of Origin": ["Japan"],
      Age: ["1800-1899"],
    },
    defaultWeightG: 15000,
    defaultDimensions: { lengthCm: 60, widthCm: 50, heightCm: 80 },
    promptHints: "This is an authentic historical Japanese armor. Emphasize provenance, period (Edo, Meiji, etc.), and historical significance. Mention any certificates of authenticity. Describe the craftsmanship in detail (lacquer, lacing patterns, mon/crests). Note that this is a museum-quality collectible. If wearable, mention it.",
    ebayCategoryId: "11644",
    defaultCondition: "USED_GOOD",
    keywords: ["江戸", "時代", "本物", "鑑定", "着用可", "実物", "古い", "年代物", "武士", "戦国"],
    negativeKeywords: ["レプリカ", "飾り", "五月人形", "新品"],
  },

  E: {
    id: "E",
    name: "着用可新品甲冑（数十万）",
    nameEn: "New Wearable Samurai Armor (Premium Reproduction)",
    description: "新品・高品質の着用可能甲冑。コスプレ・武道・ディスプレイ用。職人手作り。",
    priceRangeJpy: { min: 100000, max: 500000 },
    titleTemplate: "Wearable Japanese Samurai Armor Yoroi Kabuto Full Set Handcrafted",
    titleKeywords: [
      "Wearable", "Japanese", "Samurai", "Armor", "Yoroi",
      "Kabuto", "Full Set", "Handcrafted", "New",
    ],
    defaultAspects: {
      Type: ["Yoroi"],
      "Primary Material": ["Iron", "Leather"],
      Color: ["Black", "Red"],
      "Original/Reproduction": ["Reproduction"],
      "Featured Refinements": ["Wearable Armor"],
      "Region/Country of Origin": ["Japan"],
      Age: ["Post-1940"],
    },
    defaultWeightG: 12000,
    defaultDimensions: { lengthCm: 55, widthCm: 45, heightCm: 75 },
    promptHints: "This is a premium quality wearable reproduction armor. Emphasize the craftsmanship, materials quality, and that it's wearable for cosplay, martial arts, or display. Often handcrafted by artisans. Note included pieces and sizing information.",
    ebayCategoryId: "11644",
    defaultCondition: "NEW_OTHER",
    keywords: ["着用可", "新品", "着用", "コスプレ", "武道", "手作り", "職人"],
    negativeKeywords: ["江戸", "時代", "アンティーク"],
  },

  F: {
    id: "F",
    name: "その他",
    nameEn: "Other Japanese Armor/Helmet Items",
    description: "上記に分類できないもの。部品、パーツ、アクセサリー等。",
    priceRangeJpy: { min: 0, max: null },
    titleTemplate: "Japanese Samurai Armor Kabuto Parts Accessories",
    titleKeywords: [
      "Japanese", "Samurai", "Kabuto", "Armor", "Vintage",
    ],
    defaultAspects: {
      Type: ["Kabuto"],
      "Primary Material": ["Mixed Media"],
      "Original/Reproduction": ["Unknown"],
      "Region/Country of Origin": ["Japan"],
    },
    defaultWeightG: 2000,
    defaultDimensions: { lengthCm: 30, widthCm: 25, heightCm: 25 },
    promptHints: "Describe this item accurately based on the available information. Highlight any notable features or materials.",
    ebayCategoryId: "11644",
    defaultCondition: "USED_GOOD",
    keywords: [],
    negativeKeywords: [],
  },
};

export const CATEGORY_LIST = Object.values(KABUTO_CATEGORIES);

/**
 * カテゴリIDからカテゴリ定義を取得
 */
export function getCategory(id: KabutoCategory): KabutoCategoryDef {
  return KABUTO_CATEGORIES[id];
}
