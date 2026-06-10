import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const OUTPUT_SIZE = 1600; // eBay recommended
const BUCKET = "processed-images";

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
 * PhotoRoom API で背景除去
 * API Key が未設定の場合はスキップして元画像を返す
 */
async function removeBackgroundPhotoRoom(imageBuffer: Buffer): Promise<Buffer> {
  const apiKey = process.env.PHOTOROOM_API_KEY;
  if (!apiKey) {
    console.log("[画像処理] PHOTOROOM_API_KEY未設定、背景除去スキップ");
    return imageBuffer;
  }

  const formData = new FormData();
  formData.append("image_file", new Blob([imageBuffer as unknown as BlobPart], { type: "image/jpeg" }), "image.jpg");

  const res = await fetch("https://image-api.photoroom.com/v2/edit", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      Accept: "image/png",
    },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PhotoRoom API failed: ${res.status} ${text}`);
  }

  return Buffer.from(await res.arrayBuffer());
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
 * Compose image on white background, centered
 */
async function composeOnWhite(
  imageBuffer: Buffer,
  canvasSize: number
): Promise<Buffer> {
  return sharp(imageBuffer)
    .resize(canvasSize, canvasSize, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * Process a single image: remove background + retouch + compose on white
 */
async function processSingleImage(imageBuffer: Buffer): Promise<Buffer> {
  let processed: Buffer;

  try {
    processed = await removeBackgroundPhotoRoom(imageBuffer);
  } catch (err) {
    console.error("Background removal failed, using original:", err);
    processed = imageBuffer;
  }

  try {
    processed = await autoRetouch(processed);
  } catch {
    // ignore retouch failure
  }

  return composeOnWhite(processed, OUTPUT_SIZE);
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
