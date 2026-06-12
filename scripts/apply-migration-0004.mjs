import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import fs from "node:fs";

const sql = postgres(process.env.DATABASE_URL, { prepare: false });
try {
  const raw = fs.readFileSync("drizzle/0004_null_unknown_dimensions.sql", "utf-8");
  const cleaned = raw.split("\n").filter(l => !l.trim().startsWith("--")).join("\n");
  const statements = cleaned.split(";").map(s => s.trim()).filter(Boolean);

  const before = await sql`
    SELECT
      COUNT(*) FILTER (WHERE weight_g IS NOT NULL) AS weight,
      COUNT(*) FILTER (WHERE length_cm IS NOT NULL) AS length,
      COUNT(*) FILTER (WHERE width_cm IS NOT NULL) AS width,
      COUNT(*) FILTER (WHERE height_cm IS NOT NULL) AS height,
      COUNT(*) FILTER (WHERE ebay_aspects IS NOT NULL) AS aspects,
      COUNT(*) AS total
    FROM items
  `;
  console.log("Before:", before[0]);

  for (const stmt of statements) {
    console.log("→", stmt);
    const r = await sql.unsafe(stmt);
    console.log("  affected rows:", r.count);
  }

  const after = await sql`
    SELECT
      COUNT(*) FILTER (WHERE weight_g IS NOT NULL) AS weight,
      COUNT(*) FILTER (WHERE length_cm IS NOT NULL) AS length,
      COUNT(*) FILTER (WHERE width_cm IS NOT NULL) AS width,
      COUNT(*) FILTER (WHERE height_cm IS NOT NULL) AS height,
      COUNT(*) FILTER (WHERE ebay_aspects IS NOT NULL) AS aspects,
      COUNT(*) AS total
    FROM items
  `;
  console.log("After:", after[0]);
  console.log("OK: migration applied");
} catch (e) {
  console.error("FAIL:", e.message);
  process.exit(1);
} finally {
  await sql.end();
}
