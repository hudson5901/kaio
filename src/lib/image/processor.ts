import sharp from "sharp";
import {
  segmentForeground,
  applySegmentationMask,
} from "@imgly/background-removal-node";
import { createClient } from "@supabase/supabase-js";
import { validateBgRemoval } from "./validator";

const OUTPUT_SIZE = 1600; // eBay recommended
const BUCKET = "processed-images";
const VALIDATION_THRESHOLD = 70;
const MAX_RETRIES = 3;

interface MaskParams {
  blur: number;
  threshold: number;
  postBlur: number;
}

const MASK_PRESETS: MaskParams[] = [
  { blur: 1.5, threshold: 128, postBlur: 0.5 }, // デフォルト
  { blur: 2.0, threshold: 100, postBlur: 0.8 }, // 前景保持寄り（切り取りすぎ防止）
  { blur: 1.0, threshold: 160, postBlur: 0.3 }, // ハロー除去寄り（残り背景除去）
];

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not set");
  return createClient(url, key);
}

/**
 * Download image from URL
 */
async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!response.ok)
    throw new Error(`Image download failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Auto-retouch: enhance brightness, contrast, sharpness
 */
async function autoRetouch(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    .modulate({
      brightness: 1.05,
      saturation: 1.1,
    })
    .sharpen({ sigma: 1.0, m1: 1.0, m2: 0.5 })
    .toBuffer();
}

/**
 * ML モデルで生マスクを生成（重い処理、1回だけ実行）
 */
async function generateRawMask(imageBlob: Blob): Promise<Buffer> {
  const maskBlob = await segmentForeground(imageBlob, {
    model: "medium",
    output: { format: "image/png", quality: 1 },
  });
  return Buffer.from(await maskBlob.arrayBuffer());
}

/**
 * 生マスクにパラメータを適用して精製し、元画像に合成
 * リトライ時はこの関数だけ再実行（ML推論をスキップ）
 */
async function applyRefinedMask(
  imageBlob: Blob,
  rawMask: Buffer,
  params: MaskParams
): Promise<Buffer> {
  const refinedMask = await sharp(rawMask)
    .grayscale()
    .blur(params.blur)
    .threshold(params.threshold)
    .blur(params.postBlur)
    .png()
    .toBuffer();

  const maskAsBlob = new Blob([new Uint8Array(refinedMask)], {
    type: "image/png",
  });
  const result = await applySegmentationMask(imageBlob, maskAsBlob, {
    output: { format: "image/png", quality: 1 },
  });
  return Buffer.from(await result.arrayBuffer());
}

/**
 * Compose image on black background, centered at 85% of canvas
 */
async function composeOnBlack(
  imageBuffer: Buffer,
  canvasSize: number
): Promise<Buffer> {
  return sharp(imageBuffer)
    .resize(canvasSize, canvasSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * Process a single image: remove background + validate + retouch + compose on black
 *
 * バリデーションループ:
 * - ML推論は1回だけ実行し、マスクパラメータを変えて最大3回試行
 * - スコア70以上で合格 → 即return
 * - 全試行不合格 → 最高スコアの結果を返す
 * - バリデーションAPIエラー → 現在の結果を受け入れて中断
 */
async function processSingleImage(imageBuffer: Buffer): Promise<Buffer> {
  // 1. ML推論で生マスクを1回だけ生成
  const imageBlob = new Blob([new Uint8Array(imageBuffer)], {
    type: "image/jpeg",
  });
  let rawMask: Buffer;
  try {
    rawMask = await generateRawMask(imageBlob);
  } catch (err) {
    console.error("Background removal failed, falling back to original:", err);
    let processed = imageBuffer;
    try {
      processed = await autoRetouch(processed);
    } catch {
      // ignore retouch failure
    }
    return composeOnBlack(processed, OUTPUT_SIZE);
  }

  // 2. マスクパラメータを変えてリトライ＋バリデーション
  let bestResult: Buffer | null = null;
  let bestScore = -1;

  for (let i = 0; i < MAX_RETRIES; i++) {
    const params = MASK_PRESETS[i];
    const bgRemoved = await applyRefinedMask(imageBlob, rawMask, params);

    let retouched: Buffer;
    try {
      retouched = await autoRetouch(bgRemoved);
    } catch {
      retouched = bgRemoved;
    }

    const composed = await composeOnBlack(retouched, OUTPUT_SIZE);

    // バリデーション
    const { score, reason } = await validateBgRemoval(composed);
    console.log(
      `  Attempt ${i + 1}/${MAX_RETRIES} (blur=${params.blur}, thresh=${params.threshold}): score=${score} - ${reason}`
    );

    // APIエラー（score=-1）→ 現在の結果を受け入れて中断
    if (score < 0) {
      return composed;
    }

    if (score > bestScore) {
      bestScore = score;
      bestResult = composed;
    }

    // 合格 → 即return
    if (score >= VALIDATION_THRESHOLD) {
      return composed;
    }
  }

  // 全試行不合格 → 最高スコアの結果を返す
  console.log(`  All attempts below threshold, using best score: ${bestScore}`);
  return bestResult!;
}

/**
 * Upload buffer to Supabase Storage
 */
async function uploadToStorage(
  filePath: string,
  data: Buffer
): Promise<string> {
  const supabase = getSupabase();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, data, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}

/**
 * Process all images for an item
 */
export async function processItemImages(
  itemId: string,
  imageUrls: string[]
): Promise<string[]> {
  const processedUrls: string[] = [];

  for (let i = 0; i < imageUrls.length; i++) {
    try {
      const imageBuffer = await downloadImage(imageUrls[i]);
      const processed = await processSingleImage(imageBuffer);

      const filePath = `${itemId}/${i}.jpg`;
      const publicUrl = await uploadToStorage(filePath, processed);
      processedUrls.push(publicUrl);
    } catch (err) {
      console.error(`Image processing failed for ${imageUrls[i]}:`, err);
    }
  }

  return processedUrls;
}
