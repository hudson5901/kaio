/**
 * 兜・甲冑カテゴリ定義
 *
 * メルカリの兜アイテムを6つのカテゴリに分類し、
 * eBay出品時のテンプレート・デフォルト値・Item Specificsを提供する。
 */

export type KabutoCategory =
  | "A" | "B" | "C" | "D" | "E" | "F"
  | "G" | "H" | "I" | "J" | "K" | "L"
  | "M" | "N" | "O" | "P" | "Q" | "R"
  | "S" | "T" | "U" | "V" | "W" | "X";

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
    ebayCategoryId: "262317", // Collectibles & Art > Asian Antiques > Japan > Armor
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
    ebayCategoryId: "262317",
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
    ebayCategoryId: "262317",
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
    ebayCategoryId: "262317",
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
    ebayCategoryId: "262317",
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
    ebayCategoryId: "262317",
    defaultCondition: "USED_GOOD",
    keywords: [],
    negativeKeywords: [],
  },

  G: {
    id: "G",
    name: "衝立・屏風",
    nameEn: "Folding Screen / Byobu / Tsuitate",
    description: "和室用衝立・屏風。装飾画・書・蒔絵などが描かれた木製枠の仕切り。",
    priceRangeJpy: { min: 5000, max: 200000 },
    titleTemplate: "Japanese Vintage Folding Screen Byobu Tsuitate Painted Wooden Partition",
    titleKeywords: [
      "Japanese", "Vintage", "Antique", "Folding Screen", "Byobu", "Tsuitate",
      "Painted", "Wooden", "Partition", "Decorative",
    ],
    defaultAspects: {
      Type: ["Folding Screen"],
      "Primary Material": ["Wood", "Paper"],
      Color: ["Multicolor"],
      "Original/Reproduction": ["Original"],
      "Featured Refinements": ["Byobu, Tsuitate, Folding Screen"],
      "Region/Country of Origin": ["Japan"],
      Age: ["Unknown"],
    },
    defaultWeightG: 8000,
    defaultDimensions: { lengthCm: 60, widthCm: 15, heightCm: 90 },
    promptHints: "This is a Japanese folding screen (byobu) or single-panel partition (tsuitate). Describe the painted scene (landscape, flowers, birds, calligraphy), number of panels, and material (wood, paper, silk).",
    ebayCategoryId: "20507", // Asian Antiques > Japan > Other (旧 20510 Screens は廃止)
    defaultCondition: "USED_GOOD",
    keywords: ["衝立", "屏風", "ついたて", "びょうぶ", "六曲", "二曲", "蒔絵衝立"],
    negativeKeywords: ["兜", "鎧", "刀"],
  },

  H: {
    id: "H",
    name: "置物・人形",
    nameEn: "Okimono Figurine / Statue",
    description: "彫刻・置物・人形。木彫・象牙風・金属・陶器など素材多様。",
    priceRangeJpy: { min: 3000, max: 100000 },
    titleTemplate: "Japanese Vintage Okimono Figurine Hand Carved Sculpture Statue",
    titleKeywords: [
      "Japanese", "Vintage", "Antique", "Okimono", "Figurine",
      "Sculpture", "Statue", "Hand Carved", "Decorative",
    ],
    defaultAspects: {
      Type: ["Statue"],
      "Primary Material": ["Wood"],
      Color: ["Brown"],
      "Original/Reproduction": ["Original"],
      "Featured Refinements": ["Okimono, Japanese Figurine"],
      "Region/Country of Origin": ["Japan"],
      Age: ["Unknown"],
    },
    defaultWeightG: 1500,
    defaultDimensions: { lengthCm: 20, widthCm: 15, heightCm: 25 },
    promptHints: "This is an okimono (decorative ornament/figurine). Identify the subject (animal, deity, person, mythological creature), carving style, and material. Note any signature (mei) if visible.",
    ebayCategoryId: "20507", // Asian Antiques > Japan > Other
    defaultCondition: "USED_GOOD",
    keywords: ["置物", "おきもの", "彫刻", "木彫", "招き猫", "達磨", "干支", "縁起物"],
    negativeKeywords: ["兜", "鎧", "刀"],
  },

  I: {
    id: "I",
    name: "日本酒・酒器",
    nameEn: "Japanese Sake Bottle / Sake Vessel",
    description: "日本酒の瓶（ヴィンテージ含む）、または陶器の酒器・徳利・盃。",
    priceRangeJpy: { min: 2000, max: 80000 },
    titleTemplate: "Japanese Sake Bottle Tokkuri Sakazuki Ceramic Vessel Vintage",
    titleKeywords: [
      "Japanese", "Sake", "Bottle", "Tokkuri", "Sakazuki",
      "Vessel", "Ceramic", "Pottery", "Vintage", "Antique",
    ],
    defaultAspects: {
      Type: ["Sake Set"],
      "Primary Material": ["Ceramic"],
      Color: ["Multicolor"],
      "Original/Reproduction": ["Original"],
      "Featured Refinements": ["Sake Vessel, Tokkuri"],
      "Region/Country of Origin": ["Japan"],
      Age: ["Unknown"],
    },
    defaultWeightG: 1000,
    defaultDimensions: { lengthCm: 15, widthCm: 15, heightCm: 25 },
    promptHints: "This is either a Japanese sake bottle (collectible/vintage) or a ceramic sake vessel (tokkuri for serving, sakazuki/ochoko for drinking). For bottles, mention brewery, vintage, fill level. For ceramics, mention kiln/region (Bizen, Shigaraki, Imari, Arita), glaze, and condition.",
    ebayCategoryId: "20505", // Asian Antiques > Japan > Tea & Sake Sets
    defaultCondition: "USED_GOOD",
    keywords: ["日本酒", "徳利", "盃", "酒器", "ぐい呑み", "おちょこ", "とっくり", "酒瓶", "古酒"],
    negativeKeywords: ["兜", "鎧", "刀"],
  },

  J: {
    id: "J",
    name: "茶道具",
    nameEn: "Tea Ceremony Set / Chanoyu",
    description: "茶碗・茶釜・茶筅・棗・水差しなど、茶道で使われる道具一式。",
    priceRangeJpy: { min: 3000, max: 200000 },
    titleTemplate: "Japanese Tea Ceremony Set Chawan Bowl Chanoyu Matcha Vintage",
    titleKeywords: [
      "Japanese", "Tea Ceremony", "Chanoyu", "Chawan", "Matcha",
      "Bowl", "Set", "Vintage", "Antique", "Pottery",
    ],
    defaultAspects: {
      Type: ["Tea Bowl"],
      "Primary Material": ["Ceramic"],
      Color: ["Brown"],
      "Original/Reproduction": ["Original"],
      "Featured Refinements": ["Tea Ceremony, Chanoyu, Matcha"],
      "Region/Country of Origin": ["Japan"],
      Age: ["Unknown"],
    },
    defaultWeightG: 1500,
    defaultDimensions: { lengthCm: 18, widthCm: 18, heightCm: 12 },
    promptHints: "This is a tea ceremony (chanoyu / sado) item. Identify the specific type: chawan (bowl), chasen (whisk), chashaku (scoop), natsume (caddy), kama (kettle), mizusashi (water jar). Mention kiln/region (Raku, Hagi, Karatsu, Mino) and any tomobako (signed box).",
    ebayCategoryId: "20505", // Asian Antiques > Japan > Tea & Sake Sets
    defaultCondition: "USED_GOOD",
    keywords: ["茶道", "茶道具", "茶碗", "茶筅", "茶釜", "棗", "水差し", "茶杓", "抹茶碗"],
    negativeKeywords: ["兜", "鎧", "刀"],
  },

  K: {
    id: "K",
    name: "漆器・蒔絵",
    nameEn: "Lacquerware / Makie",
    description: "重箱・椀・盆・箱物などの漆器。蒔絵・螺鈿・金粉装飾を含む。",
    priceRangeJpy: { min: 3000, max: 150000 },
    titleTemplate: "Japanese Vintage Lacquerware Makie Jubako Box Bowl Gold Decorated",
    titleKeywords: [
      "Japanese", "Vintage", "Antique", "Lacquerware", "Lacquer",
      "Makie", "Jubako", "Box", "Bowl", "Gold", "Decorated",
    ],
    defaultAspects: {
      Type: ["Lacquerware"],
      "Primary Material": ["Lacquer", "Wood"],
      Color: ["Black", "Gold"],
      "Original/Reproduction": ["Original"],
      "Featured Refinements": ["Lacquer, Makie, Urushi"],
      "Region/Country of Origin": ["Japan"],
      Age: ["Unknown"],
    },
    defaultWeightG: 2000,
    defaultDimensions: { lengthCm: 25, widthCm: 25, heightCm: 20 },
    promptHints: "This is a lacquerware (urushi) item. Identify form (jubako stacked box, bowl, tray, document box) and decoration technique (makie gold powder painting, raden mother-of-pearl inlay, kinpaku gold leaf).",
    ebayCategoryId: "20507", // Asian Antiques > Japan > Other (旧 20503 Lacquer は廃止)
    defaultCondition: "USED_GOOD",
    keywords: ["漆器", "重箱", "蒔絵", "螺鈿", "うるし", "漆塗り", "金箔", "蒔絵箱"],
    negativeKeywords: ["兜", "鎧", "刀"],
  },

  M: {
    id: "M",
    name: "鉄瓶・銅器",
    nameEn: "Tetsubin Iron Kettle / Copperware",
    description: "茶釜・鉄瓶・銅製花器など金属工芸品。",
    priceRangeJpy: { min: 5000, max: 200000 },
    titleTemplate: "Japanese Vintage Tetsubin Iron Kettle Cast Iron Teapot Antique",
    titleKeywords: ["Japanese", "Vintage", "Antique", "Tetsubin", "Iron Kettle", "Cast Iron", "Teapot", "Copperware"],
    defaultAspects: {
      Type: ["Tetsubin"],
      "Primary Material": ["Iron"],
      Color: ["Black"],
      "Original/Reproduction": ["Original"],
      "Featured Refinements": ["Tetsubin, Iron Teapot"],
      "Region/Country of Origin": ["Japan"],
      Age: ["Unknown"],
    },
    defaultWeightG: 2500,
    defaultDimensions: { lengthCm: 22, widthCm: 22, heightCm: 22 },
    promptHints: "Cast iron kettle (tetsubin) or copperware. Identify maker (Ryubundo, Nanbu Tekki origin), surface texture (arare nubbin pattern, dragon relief), and condition (rust spots are typical, note severity).",
    ebayCategoryId: "20502", // Metalware
    defaultCondition: "USED_GOOD",
    keywords: ["鉄瓶", "銅器", "南部鉄器", "茶釜", "銅花器", "鉄器"],
    negativeKeywords: ["兜", "鎧", "刀"],
  },

  N: {
    id: "N",
    name: "仏像・仏教美術",
    nameEn: "Buddhist Statue / Buddhist Art",
    description: "仏像・観音像・神像・念珠・仏具など。木彫・金属・陶磁器。",
    priceRangeJpy: { min: 5000, max: 300000 },
    titleTemplate: "Japanese Vintage Buddhist Statue Buddha Kannon Wood Carved Antique",
    titleKeywords: ["Japanese", "Vintage", "Antique", "Buddhist", "Buddha", "Kannon", "Statue", "Wood Carved", "Bronze"],
    defaultAspects: {
      Type: ["Statue"],
      "Primary Material": ["Wood"],
      Color: ["Brown"],
      "Original/Reproduction": ["Original"],
      "Featured Refinements": ["Buddhist Art, Buddha Statue"],
      "Region/Country of Origin": ["Japan"],
      Age: ["Unknown"],
    },
    defaultWeightG: 2000,
    defaultDimensions: { lengthCm: 18, widthCm: 15, heightCm: 30 },
    promptHints: "Buddhist statue or religious art. Identify the deity (Buddha, Kannon Bodhisattva, Amida, Jizo, Fudo Myo-o, Bishamonten), pose (standing, seated, mudra hand gesture), and material (wood, bronze, lacquer). Note any base, halo (kohai), or signed box.",
    ebayCategoryId: "20507",
    defaultCondition: "USED_GOOD",
    keywords: ["仏像", "観音", "如来", "菩薩", "念珠", "仏具", "仏教美術", "木彫仏"],
    negativeKeywords: ["兜", "鎧"],
  },

  O: {
    id: "O",
    name: "浮世絵・木版画",
    nameEn: "Ukiyo-e Woodblock Print",
    description: "浮世絵・木版画。江戸期〜近代の版画作品。",
    priceRangeJpy: { min: 3000, max: 200000 },
    titleTemplate: "Japanese Vintage Ukiyo-e Woodblock Print Original Antique Edo",
    titleKeywords: ["Japanese", "Vintage", "Antique", "Ukiyo-e", "Woodblock Print", "Original", "Edo", "Meiji"],
    defaultAspects: {
      Type: ["Painting & Scroll"],
      "Primary Material": ["Paper"],
      Color: ["Multicolor"],
      "Original/Reproduction": ["Original"],
      "Featured Refinements": ["Ukiyo-e, Woodblock Print"],
      "Region/Country of Origin": ["Japan"],
      Age: ["1800-1899"],
    },
    defaultWeightG: 300,
    defaultDimensions: { lengthCm: 40, widthCm: 1, heightCm: 28 },
    promptHints: "Japanese woodblock print (ukiyo-e). Identify the artist (Hokusai, Hiroshige, Utamaro, Kuniyoshi, Yoshitoshi, modern shin-hanga), subject (beauty bijin-ga, landscape fukei, kabuki, warrior), publisher seal, era (Edo, Meiji, Taisho, Showa), and condition (foxing, fading, trimming).",
    ebayCategoryId: "20509",
    defaultCondition: "USED_GOOD",
    keywords: ["浮世絵", "木版画", "版画", "錦絵", "錦繪", "北斎", "広重", "歌川"],
    negativeKeywords: ["兜", "鎧", "刀"],
  },

  P: {
    id: "P",
    name: "雛人形・市松人形",
    nameEn: "Hina Doll / Ichimatsu Doll",
    description: "雛祭り用の人形、市松人形、御所人形など日本人形。",
    priceRangeJpy: { min: 5000, max: 200000 },
    titleTemplate: "Japanese Vintage Hina Doll Ningyo Ichimatsu Traditional Antique",
    titleKeywords: ["Japanese", "Vintage", "Antique", "Hina", "Doll", "Ningyo", "Ichimatsu", "Traditional", "Gofun"],
    defaultAspects: {
      Type: ["Doll"],
      "Primary Material": ["Mixed Materials"],
      Color: ["Multicolor"],
      "Original/Reproduction": ["Original"],
      "Featured Refinements": ["Hina Doll, Japanese Doll"],
      "Region/Country of Origin": ["Japan"],
      Age: ["Unknown"],
    },
    defaultWeightG: 1500,
    defaultDimensions: { lengthCm: 20, widthCm: 15, heightCm: 30 },
    promptHints: "Japanese traditional doll. Identify type: Hina-ningyo (emperor/empress for Hina Matsuri March 3), Ichimatsu (child doll with painted face), Gosho-ningyo (palace doll), Kimekomi (cloth-inlay). Mention kimono fabric, gofun white face paint, glass eyes, hair (natural or silk), and accessories (fan, sword).",
    ebayCategoryId: "20507",
    defaultCondition: "USED_GOOD",
    keywords: ["雛人形", "市松人形", "御所人形", "日本人形", "ひな人形", "親王飾り", "ガラス人形"],
    negativeKeywords: ["兜", "鎧", "刀"],
  },

  Q: {
    id: "Q",
    name: "印籠・根付",
    nameEn: "Inro / Netsuke",
    description: "帯から下げる小物入れ印籠と帯留め根付。象牙・木彫・蒔絵。",
    priceRangeJpy: { min: 5000, max: 300000 },
    titleTemplate: "Japanese Vintage Inro Netsuke Carved Antique Edo Meiji Original",
    titleKeywords: ["Japanese", "Vintage", "Antique", "Inro", "Netsuke", "Carved", "Edo", "Meiji"],
    defaultAspects: {
      Type: ["Other"],
      "Primary Material": ["Wood"],
      Color: ["Brown"],
      "Original/Reproduction": ["Original"],
      "Featured Refinements": ["Inro, Netsuke"],
      "Region/Country of Origin": ["Japan"],
      Age: ["Unknown"],
    },
    defaultWeightG: 200,
    defaultDimensions: { lengthCm: 8, widthCm: 6, heightCm: 4 },
    promptHints: "Inro (small lacquered case worn at obi) or netsuke (carved toggle). For inro: count compartments (3-5 sections), describe makie/raden decoration, mention himotoshi cord holes. For netsuke: identify material (boxwood, ivory-look, antler, ceramic), subject (animal, mask, figure), and any signature.",
    ebayCategoryId: "20503", // Lacquer
    defaultCondition: "USED_GOOD",
    keywords: ["印籠", "根付", "ねつけ", "ネツケ", "Inro", "Netsuke", "帯留め"],
    negativeKeywords: ["兜", "鎧", "刀"],
  },

  R: {
    id: "R",
    name: "着物・帯",
    nameEn: "Kimono / Obi",
    description: "着物本体および帯。絹・木綿・人造繊維。",
    priceRangeJpy: { min: 3000, max: 100000 },
    titleTemplate: "Japanese Vintage Kimono Obi Silk Traditional Antique Robe",
    titleKeywords: ["Japanese", "Vintage", "Kimono", "Obi", "Silk", "Traditional", "Robe", "Antique"],
    defaultAspects: {
      Type: ["Kimono"],
      "Primary Material": ["Silk"],
      Color: ["Multicolor"],
      "Original/Reproduction": ["Original"],
      "Featured Refinements": ["Kimono, Obi"],
      "Region/Country of Origin": ["Japan"],
      Age: ["Unknown"],
    },
    defaultWeightG: 1200,
    defaultDimensions: { lengthCm: 30, widthCm: 25, heightCm: 5 },
    promptHints: "Kimono (robe) or obi (sash). Identify garment type: furisode (long sleeve), tomesode (married women), houmongi (visiting), iromuji (solid color), yukata (cotton summer); for obi: maru obi, fukuro obi, nagoya obi. Note fabric (silk, cotton, polyester), dyeing technique (yuzen, shibori, kasuri), motifs, lining condition.",
    ebayCategoryId: "20507", // Asian Antiques > Japan > Other (旧 20510 Textiles は廃止)
    defaultCondition: "USED_GOOD",
    keywords: ["着物", "帯", "振袖", "留袖", "訪問着", "袋帯", "名古屋帯", "正絹"],
    negativeKeywords: ["兜", "鎧", "刀"],
  },

  S: {
    id: "S",
    name: "陶磁器・焼物",
    nameEn: "Pottery / Porcelain / Yakimono",
    description: "伊万里・有田・九谷・備前・信楽・萩・志野など各地の焼物。",
    priceRangeJpy: { min: 3000, max: 200000 },
    titleTemplate: "Japanese Vintage Imari Arita Pottery Porcelain Antique Vase Bowl",
    titleKeywords: ["Japanese", "Vintage", "Antique", "Imari", "Arita", "Kutani", "Pottery", "Porcelain", "Vase", "Bowl"],
    defaultAspects: {
      Type: ["Vase"],
      "Primary Material": ["Porcelain"],
      Color: ["Blue", "White"],
      "Original/Reproduction": ["Original"],
      "Featured Refinements": ["Imari, Arita, Kutani"],
      "Region/Country of Origin": ["Japan"],
      Age: ["Unknown"],
    },
    defaultWeightG: 2000,
    defaultDimensions: { lengthCm: 20, widthCm: 20, heightCm: 30 },
    promptHints: "Japanese pottery or porcelain. Identify kiln/region (Imari, Arita, Kutani, Bizen, Shigaraki, Mino, Hagi, Karatsu, Mashiko), shape (vase tsubo, bowl chawan, plate sara), glaze (sometsuke blue-white, akae enamel, kintarashi gold), and any kiln mark on the base.",
    ebayCategoryId: "20500", // Ceramics/Pottery
    defaultCondition: "USED_GOOD",
    keywords: ["伊万里", "有田", "九谷", "備前", "信楽", "美濃", "萩焼", "志野", "陶器", "磁器", "焼物"],
    negativeKeywords: ["兜", "鎧", "刀"],
  },

  T: {
    id: "T",
    name: "香道具・香炉",
    nameEn: "Incense Burner / Koro",
    description: "香炉・香道具・線香立てなど。陶器・金属・木製。",
    priceRangeJpy: { min: 3000, max: 100000 },
    titleTemplate: "Japanese Vintage Incense Burner Koro Censer Antique Bronze Ceramic",
    titleKeywords: ["Japanese", "Vintage", "Antique", "Incense Burner", "Koro", "Censer", "Bronze"],
    defaultAspects: {
      Type: ["Incense Burner"],
      "Primary Material": ["Bronze"],
      Color: ["Brown"],
      "Original/Reproduction": ["Original"],
      "Featured Refinements": ["Koro, Incense Burner"],
      "Region/Country of Origin": ["Japan"],
      Age: ["Unknown"],
    },
    defaultWeightG: 1500,
    defaultDimensions: { lengthCm: 18, widthCm: 18, heightCm: 20 },
    promptHints: "Incense burner (koro) or incense tools (kogo, kobako). Identify form (tripod legs, lion finial, dragon handle), material (bronze, copper, ceramic), and decoration.",
    ebayCategoryId: "20502",
    defaultCondition: "USED_GOOD",
    keywords: ["香炉", "香道具", "線香立て", "香道", "香木"],
    negativeKeywords: ["兜", "鎧", "刀"],
  },

  U: {
    id: "U",
    name: "たんす・家具",
    nameEn: "Tansu Chest / Furniture",
    description: "和家具。たんす・船箪笥・帳場箪笥・古道具。",
    priceRangeJpy: { min: 10000, max: 300000 },
    titleTemplate: "Japanese Vintage Tansu Chest Antique Wooden Furniture Drawers Cabinet",
    titleKeywords: ["Japanese", "Vintage", "Antique", "Tansu", "Chest", "Wooden", "Furniture", "Drawers", "Cabinet"],
    defaultAspects: {
      Type: ["Chest"],
      "Primary Material": ["Wood"],
      Color: ["Brown"],
      "Original/Reproduction": ["Original"],
      "Featured Refinements": ["Tansu, Japanese Chest"],
      "Region/Country of Origin": ["Japan"],
      Age: ["Unknown"],
    },
    defaultWeightG: 25000,
    defaultDimensions: { lengthCm: 90, widthCm: 45, heightCm: 90 },
    promptHints: "Japanese tansu (chest) or traditional furniture. Identify type (mizuya kitchen, isho clothing, funa-dansu ship chest, chodansu small accessory), wood (kiri paulownia, keyaki zelkova, hinoki cypress), iron hardware (handles, locks), and condition.",
    ebayCategoryId: "20511", // Furniture
    defaultCondition: "USED_GOOD",
    keywords: ["箪笥", "タンス", "たんす", "船箪笥", "和家具", "古家具", "整理ダンス"],
    negativeKeywords: ["兜", "鎧", "刀"],
  },

  V: {
    id: "V",
    name: "古銭・古紙幣",
    nameEn: "Old Coin / Banknote",
    description: "日本古銭・古紙幣。寛永通宝・天保通宝など。",
    priceRangeJpy: { min: 1000, max: 100000 },
    titleTemplate: "Japanese Vintage Coin Old Currency Antique Edo Meiji Collectible",
    titleKeywords: ["Japanese", "Vintage", "Antique", "Coin", "Currency", "Banknote", "Edo", "Meiji"],
    defaultAspects: {
      Type: ["Coin"],
      "Primary Material": ["Bronze"],
      Color: ["Brown"],
      "Original/Reproduction": ["Original"],
      "Featured Refinements": ["Japanese Coin, Old Currency"],
      "Region/Country of Origin": ["Japan"],
      Age: ["Unknown"],
    },
    defaultWeightG: 50,
    defaultDimensions: { lengthCm: 5, widthCm: 5, heightCm: 1 },
    promptHints: "Japanese old coin or banknote. Identify type (Kanei Tsuho, Tenpo Tsuho, Mon coin, modern Yen), era (Edo, Meiji, Taisho, Showa), metal/material, denomination, and condition (grade if known).",
    ebayCategoryId: "256", // World Coins (Japan)
    defaultCondition: "USED_GOOD",
    keywords: ["古銭", "古紙幣", "寛永通宝", "天保通宝", "古貨幣", "アンティーク貨幣"],
    negativeKeywords: ["兜", "鎧", "刀"],
  },

  W: {
    id: "W",
    name: "ガラス工芸 (江戸切子等)",
    nameEn: "Japanese Glass / Edo Kiriko",
    description: "江戸切子・薩摩切子・ガラス工芸品。",
    priceRangeJpy: { min: 3000, max: 100000 },
    titleTemplate: "Japanese Vintage Edo Kiriko Cut Glass Crystal Antique Sake Cup",
    titleKeywords: ["Japanese", "Vintage", "Antique", "Edo Kiriko", "Cut Glass", "Crystal", "Sake Cup"],
    defaultAspects: {
      Type: ["Glass"],
      "Primary Material": ["Glass"],
      Color: ["Multicolor"],
      "Original/Reproduction": ["Original"],
      "Featured Refinements": ["Edo Kiriko, Cut Glass"],
      "Region/Country of Origin": ["Japan"],
      Age: ["Unknown"],
    },
    defaultWeightG: 500,
    defaultDimensions: { lengthCm: 10, widthCm: 10, heightCm: 12 },
    promptHints: "Japanese cut glass (kiriko). Identify type (Edo Kiriko Tokyo, Satsuma Kiriko Kagoshima), pattern (yarai bamboo lattice, kagome basket, asanoha hemp leaf, kiku chrysanthemum), color (cobalt, red, amber, clear), and shape (sake cup, bowl, vase).",
    ebayCategoryId: "20507",
    defaultCondition: "USED_GOOD",
    keywords: ["江戸切子", "薩摩切子", "ガラス", "切子", "クリスタル", "和ガラス"],
    negativeKeywords: ["兜", "鎧", "刀"],
  },

  X: {
    id: "X",
    name: "文房具・硯",
    nameEn: "Calligraphy Set / Suzuri Inkstone",
    description: "硯・筆・墨・水滴など書道具。",
    priceRangeJpy: { min: 2000, max: 80000 },
    titleTemplate: "Japanese Vintage Calligraphy Set Suzuri Inkstone Sumi Brush Antique",
    titleKeywords: ["Japanese", "Vintage", "Antique", "Calligraphy", "Suzuri", "Inkstone", "Sumi", "Brush"],
    defaultAspects: {
      Type: ["Calligraphy"],
      "Primary Material": ["Stone"],
      Color: ["Black"],
      "Original/Reproduction": ["Original"],
      "Featured Refinements": ["Suzuri, Calligraphy"],
      "Region/Country of Origin": ["Japan"],
      Age: ["Unknown"],
    },
    defaultWeightG: 1000,
    defaultDimensions: { lengthCm: 15, widthCm: 10, heightCm: 5 },
    promptHints: "Calligraphy tools (shodo). Identify item: suzuri inkstone (Akama, Amahata stone), sumi ink stick, fude brush, suiteki water dropper. For suzuri mention origin, carving pattern, dimensions. Note tomobako wood box if present.",
    ebayCategoryId: "20507",
    defaultCondition: "USED_GOOD",
    keywords: ["硯", "墨", "筆", "書道具", "水滴", "文房四宝", "篆刻"],
    negativeKeywords: ["兜", "鎧", "刀"],
  },

  L: {
    id: "L",
    name: "掛軸・書画",
    nameEn: "Hanging Scroll / Kakejiku",
    description: "掛軸・書・水墨画・色紙。日本画・書道作品。",
    priceRangeJpy: { min: 3000, max: 200000 },
    titleTemplate: "Japanese Vintage Hanging Scroll Kakejiku Painted Calligraphy Sumi",
    titleKeywords: [
      "Japanese", "Vintage", "Antique", "Hanging Scroll", "Kakejiku",
      "Painting", "Calligraphy", "Sumi", "Ink", "Silk",
    ],
    defaultAspects: {
      Type: ["Painting & Scroll"],
      "Primary Material": ["Paper", "Silk"],
      Color: ["Multicolor"],
      "Original/Reproduction": ["Original"],
      "Featured Refinements": ["Hanging Scroll, Kakejiku"],
      "Region/Country of Origin": ["Japan"],
      Age: ["Unknown"],
    },
    defaultWeightG: 800,
    defaultDimensions: { lengthCm: 60, widthCm: 5, heightCm: 5 },
    promptHints: "This is a Japanese hanging scroll (kakejiku/kakemono). Identify the subject (landscape, bird-and-flower, calligraphy, Buddhist image), artist signature (mei) and seal (in) if visible, mounting style (silk brocade colors), and tomobako (signed wooden box) if present.",
    ebayCategoryId: "20509", // Asian Antiques > Japan > Paintings & Scrolls
    defaultCondition: "USED_GOOD",
    keywords: ["掛軸", "掛け軸", "書画", "水墨画", "日本画", "色紙", "扁額", "軸装"],
    negativeKeywords: ["兜", "鎧", "刀"],
  },
};

export const CATEGORY_LIST = Object.values(KABUTO_CATEGORIES);

/**
 * カテゴリIDからカテゴリ定義を取得
 */
export function getCategory(id: KabutoCategory): KabutoCategoryDef {
  return KABUTO_CATEGORIES[id];
}
