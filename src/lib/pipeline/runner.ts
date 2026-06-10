import { updateStep, setRunning, isAborted } from "./state";
import { createNotification } from "@/lib/notifications";

/**
 * サーバーサイドパイプライン実行
 * fire-and-forget で実行され、ページ遷移しても処理が続く
 */
export async function runServerPipeline(
  keyword: string,
  maxItems: number,
  autoProcess: boolean
) {
  try {
    // Step 1: スクレイプ
    updateStep("scrape", { status: "running" });

    const { scrapeMercari } = await import("@/lib/mercari/scraper");
    const scrapeResult = await scrapeMercari(keyword, maxItems, false);

    if (isAborted()) { setRunning(false); return; }

    const scrapeHasErrors = scrapeResult.errors.length > scrapeResult.added;
    updateStep("scrape", {
      status: scrapeHasErrors ? "error" : "done",
      processed: scrapeResult.added,
      total: scrapeResult.added + scrapeResult.skipped,
      errors: scrapeResult.errors.slice(-5),
    });

    // スクレイプ完了通知
    if (scrapeResult.added > 0) {
      await createNotification("new_items", "スクレイプ完了", `「${keyword}」で${scrapeResult.added}件の新規アイテムを取得しました（スキップ: ${scrapeResult.skipped}件）`);
    }
    if (scrapeHasErrors) {
      await createNotification("error", "スクレイプエラー", `${scrapeResult.errors.length}件のエラーが発生しました: ${scrapeResult.errors[0]}`);
    }

    if (!autoProcess) {
      setRunning(false);
      return;
    }

    // 処理対象の件数を取得
    const counts = await getProcessingCounts();

    // Step 1.5: 自動分類（ルールベース）
    const countsCls = await getProcessingCounts();
    await runBatchStep("classify", "classify", countsCls.needsClassify);
    if (isAborted()) { setRunning(false); return; }

    // Step 2: 詳細取得
    await runBatchStep("details", "fetch_details", counts.needsDetails);
    if (isAborted()) { setRunning(false); return; }

    // Step 3: 画像処理
    const counts2 = await getProcessingCounts();
    await runBatchStep("images", "process_images", counts2.needsImages);
    if (isAborted()) { setRunning(false); return; }

    // Step 4: 費用計算
    const counts3 = await getProcessingCounts();
    await runBatchStep("costs", "calculate_costs", counts3.needsCosts);

    // パイプライン完了通知
    await createNotification("new_items", "パイプライン完了", `全ステップが完了しました（${scrapeResult.added}件処理）`);

  } catch (err) {
    console.error("Pipeline error:", err);
    await createNotification("error", "パイプラインエラー", `パイプライン実行中にエラーが発生: ${String(err).slice(0, 200)}`);
  } finally {
    setRunning(false);
  }
}

/**
 * 個別ステップのみ実行
 */
export async function runSingleStep(
  stepId: string,
  action: string,
) {
  try {
    const counts = await getProcessingCounts();
    let total: number;
    switch (action) {
      case "fetch_details": total = counts.needsDetails; break;
      case "infer_images": total = counts.needsInferImages; break;
      case "process_images": total = counts.needsImages; break;
      case "calculate_costs": total = counts.needsCosts; break;
      case "classify": total = counts.needsClassify; break;
      default: total = 0;
    }

    await runBatchStep(stepId, action, total);
  } catch (err) {
    console.error(`Step ${stepId} error:`, err);
  } finally {
    setRunning(false);
  }
}

async function runBatchStep(stepId: string, action: string, total: number) {
  if (total === 0) {
    updateStep(stepId, { status: "skipped", total: 0, processed: 0 });
    return;
  }

  updateStep(stepId, { status: "running", total, processed: 0 });

  let remaining = total;
  let processed = 0;
  const allErrors: string[] = [];
  const batchSize = action === "fetch_details" ? 3 : 5;

  while (remaining > 0 && !isAborted()) {
    try {
      const { batchProcess } = await import("@/lib/pipeline/batch");
      const data = await batchProcess(action, batchSize);

      const stepProcessed = data.processed;
      processed += stepProcessed;
      if (data.errors?.length) allErrors.push(...data.errors);
      remaining = data.remaining;

      updateStep(stepId, {
        processed,
        total: processed + remaining,
        errors: allErrors.slice(-5),
      });

      if (stepProcessed === 0) break;
    } catch (err) {
      allErrors.push(String(err));
      break;
    }
  }

  updateStep(stepId, {
    status: isAborted() ? "pending" : allErrors.length > processed ? "error" : "done",
    processed,
    errors: allErrors.slice(-5),
  });
}

async function getProcessingCounts() {
  const { db, schema } = await import("@/lib/db");
  const { eq, and, isNull, or, sql } = await import("drizzle-orm");

  const [noDesc, fewImages, noImg, noCost, noCategory] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(schema.items).where(
      and(
        eq(schema.items.mercariStatus, "available"),
        or(
          isNull(schema.items.mercariDescription),
          eq(schema.items.mercariDescription, ""),
          sql`${schema.items.mercariImages} NOT LIKE '%_2%'`
        )
      )
    ),
    db.select({ count: sql<number>`count(*)` }).from(schema.items).where(
      and(eq(schema.items.mercariStatus, "available"), sql`${schema.items.mercariImages} NOT LIKE '%detail/orig/photos/%_2%'`)
    ),
    db.select({ count: sql<number>`count(*)` }).from(schema.items).where(
      and(eq(schema.items.mercariStatus, "available"), isNull(schema.items.processedImages))
    ),
    db.select({ count: sql<number>`count(*)` }).from(schema.items).where(
      and(eq(schema.items.mercariStatus, "available"), isNull(schema.items.shippingCostUsd))
    ),
    db.select({ count: sql<number>`count(*)` }).from(schema.items).where(
      and(eq(schema.items.mercariStatus, "available"), isNull(schema.items.kabutoCategory))
    ),
  ]);

  return {
    needsDetails: noDesc[0].count,
    needsInferImages: fewImages[0].count,
    needsImages: noImg[0].count,
    needsCosts: noCost[0].count,
    needsClassify: noCategory[0].count,
  };
}
