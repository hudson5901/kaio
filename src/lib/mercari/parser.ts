interface Dimensions {
  weightG: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
}

/**
 * メルカリの説明文からサイズ・重量をパース
 */
export function parseDimensions(description: string): Dimensions {
  const result: Dimensions = {
    weightG: null,
    lengthCm: null,
    widthCm: null,
    heightCm: null,
  };

  if (!description) return result;

  // 重量パターン
  // "重さ約1.2kg", "重量: 800g", "約500グラム", "1.5キロ"
  const weightPatterns = [
    /(?:重[さ量]|weight)[：:\s]*約?(\d+\.?\d*)\s*(?:kg|キロ)/i,
    /(?:重[さ量]|weight)[：:\s]*約?(\d+\.?\d*)\s*(?:g|グラム)/i,
    /約?(\d+\.?\d*)\s*(?:kg|キロ)(?:\s*(?:程度|ほど|くらい))?/i,
    /約?(\d+\.?\d*)\s*(?:g|グラム)(?:\s*(?:程度|ほど|くらい))?/i,
  ];

  for (const pattern of weightPatterns) {
    const match = pattern.exec(description);
    if (match) {
      const value = parseFloat(match[1]);
      // kg or g
      if (pattern.source.includes("kg") || pattern.source.includes("キロ")) {
        result.weightG = value * 1000;
      } else {
        result.weightG = value;
      }
      break;
    }
  }

  // 全長パターン (刀の場合、全長が最も重要)
  // "全長約70cm", "刃長: 60cm", "全長70センチ", "長さ: 65cm"
  const lengthPatterns = [
    /(?:全長|刃[渡長]|長さ|blade\s*length)[：:\s]*約?(\d+\.?\d*)\s*(?:cm|センチ)/i,
    /(?:全長|刃[渡長]|長さ|blade\s*length)[：:\s]*約?(\d+\.?\d*)\s*(?:mm|ミリ)/i,
    /(?:全長|刃[渡長]|長さ|blade\s*length)[：:\s]*約?(\d+\.?\d*)\s*(?:m|メートル)/i,
    /約?(\d+\.?\d*)\s*(?:cm|センチ)\s*(?:×|x|X|\*)\s*(?:\d+\.?\d*)\s*(?:cm|センチ)/i,
  ];

  for (const pattern of lengthPatterns) {
    const match = pattern.exec(description);
    if (match) {
      const value = parseFloat(match[1]);
      if (pattern.source.includes("mm") || pattern.source.includes("ミリ")) {
        result.lengthCm = value / 10;
      } else if (pattern.source.includes("m|メートル")) {
        result.lengthCm = value * 100;
      } else {
        result.lengthCm = value;
      }
      break;
    }
  }

  // 幅パターン
  const widthPatterns = [
    /(?:幅|width)[：:\s]*約?(\d+\.?\d*)\s*(?:cm|センチ)/i,
    /(?:幅|width)[：:\s]*約?(\d+\.?\d*)\s*(?:mm|ミリ)/i,
  ];

  for (const pattern of widthPatterns) {
    const match = pattern.exec(description);
    if (match) {
      const value = parseFloat(match[1]);
      if (pattern.source.includes("mm") || pattern.source.includes("ミリ")) {
        result.widthCm = value / 10;
      } else {
        result.widthCm = value;
      }
      break;
    }
  }

  // サイズパターン (LxWxH)
  // "サイズ: 70x10x5cm", "70cm×10cm×5cm"
  const sizePattern = /(\d+\.?\d*)\s*(?:cm)?\s*[×xX\*]\s*(\d+\.?\d*)\s*(?:cm)?\s*[×xX\*]\s*(\d+\.?\d*)\s*(?:cm|センチ)/i;
  const sizeMatch = sizePattern.exec(description);
  if (sizeMatch) {
    const dims = [parseFloat(sizeMatch[1]), parseFloat(sizeMatch[2]), parseFloat(sizeMatch[3])].sort(
      (a, b) => b - a
    );
    result.lengthCm = result.lengthCm ?? dims[0];
    result.widthCm = result.widthCm ?? dims[1];
    result.heightCm = result.heightCm ?? dims[2];
  }

  // 刀特有：尺・寸からの変換
  // "二尺三寸" = 2尺3寸 = 69.7cm
  const shakuPattern = /(\d+)\s*尺\s*(\d*)\s*寸?/;
  const shakuMatch = shakuPattern.exec(description);
  if (shakuMatch && !result.lengthCm) {
    const shaku = parseInt(shakuMatch[1], 10);
    const sun = shakuMatch[2] ? parseInt(shakuMatch[2], 10) : 0;
    result.lengthCm = shaku * 30.3 + sun * 3.03;
  }

  return result;
}

/**
 * アイテムの英語タイトルを生成（刀、兜、甲冑、鍔など対応）
 */
export function generateEnglishTitle(title: string, description: string): string {
  const text = title + description;
  let engTitle = "Japanese Antique";

  // 種類判定（優先度順）
  if (/兜/.test(text)) engTitle = "Japanese Kabuto Samurai Helmet";
  else if (/甲冑|鎧/.test(text)) engTitle = "Japanese Yoroi Samurai Armor";
  else if (/面頬|面具/.test(text)) engTitle = "Japanese Menpo Samurai Face Guard";
  else if (/鍔/.test(text)) engTitle = "Japanese Tsuba Sword Guard";
  else if (/目貫/.test(text)) engTitle = "Japanese Menuki Sword Fitting";
  else if (/小柄/.test(text)) engTitle = "Japanese Kozuka Knife Handle";
  else if (/縁頭/.test(text)) engTitle = "Japanese Fuchi-Kashira Sword Fitting";
  else if (/短刀/.test(text)) engTitle = "Japanese Tanto Short Sword";
  else if (/脇差/.test(text)) engTitle = "Japanese Wakizashi Sword";
  else if (/太刀/.test(text)) engTitle = "Japanese Tachi Sword";
  else if (/軍刀/.test(text)) engTitle = "Japanese WWII Military Sword Gunto";
  else if (/居合/.test(text)) engTitle = "Japanese Iaito Practice Sword";
  else if (/模造刀/.test(text)) engTitle = "Japanese Replica Katana Sword";
  else if (/日本刀|刀/.test(text)) engTitle = "Japanese Katana Sword";

  // 銘があれば追加
  const meiPattern = /(?:銘|在銘)[：:\s「]*([^」\s]+)/;
  const meiMatch = meiPattern.exec(description);
  if (meiMatch) {
    engTitle += ` - ${meiMatch[1]}`;
  }

  // 時代があれば追加
  const eraKeywords = [
    { jp: "室町", en: "Muromachi Period" },
    { jp: "江戸", en: "Edo Period" },
    { jp: "幕末", en: "Bakumatsu" },
    { jp: "明治", en: "Meiji Era" },
    { jp: "大正", en: "Taisho Era" },
    { jp: "昭和", en: "Showa Era" },
    { jp: "鎌倉", en: "Kamakura Period" },
    { jp: "南北朝", en: "Nanbokucho Period" },
    { jp: "戦国", en: "Sengoku Period" },
  ];

  for (const era of eraKeywords) {
    if (text.includes(era.jp)) {
      engTitle += ` ${era.en}`;
      break;
    }
  }

  return engTitle;
}

/**
 * アイテムの英語説明文を生成
 */
export function generateEnglishDescription(
  title: string,
  description: string,
  dimensions: Dimensions
): string {
  const text = title + description;
  const lines: string[] = [];

  // カテゴリ判定
  let category = "JAPANESE ANTIQUE";
  if (/兜/.test(text)) category = "JAPANESE SAMURAI HELMET (KABUTO)";
  else if (/甲冑|鎧/.test(text)) category = "JAPANESE SAMURAI ARMOR (YOROI)";
  else if (/鍔/.test(text)) category = "JAPANESE SWORD GUARD (TSUBA)";
  else if (/刀|太刀|脇差|短刀/.test(text)) category = "AUTHENTIC JAPANESE SWORD";

  lines.push(`=== ${category} ===`);
  lines.push("");
  lines.push(`Original Title: ${title}`);
  lines.push("");

  if (dimensions.lengthCm) {
    const label = /兜/.test(text) ? "Height" : /鍔/.test(text) ? "Diameter" : "Length";
    lines.push(`${label}: approximately ${dimensions.lengthCm.toFixed(1)} cm (${(dimensions.lengthCm / 2.54).toFixed(1)} inches)`);
  }
  if (dimensions.weightG) {
    lines.push(`Weight: approximately ${dimensions.weightG}g (${(dimensions.weightG / 453.592).toFixed(2)} lbs)`);
  }
  if (dimensions.widthCm) {
    lines.push(`Width: approximately ${dimensions.widthCm.toFixed(1)} cm`);
  }
  if (dimensions.heightCm) {
    lines.push(`Height: approximately ${dimensions.heightCm.toFixed(1)} cm`);
  }

  lines.push("");
  lines.push("Shipped from Japan with proper export documentation.");
  lines.push("Please note: Import regulations vary by country. Buyer is responsible for checking local laws.");
  lines.push("");
  lines.push("--- Original Description (Japanese) ---");
  lines.push(description.slice(0, 1000));

  return lines.join("\n");
}
