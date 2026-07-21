// scripts/quality-check.js
// Self-healing data quality loop — removes catalogue data that didn't come
// from a real PDF we processed, logs every deletion to quality_log, and
// reports what verified catalogue data remains.
//
// "Verified" is determined structurally, not by heuristics: only rows whose
// parent catalogue's source_url starts with github://catalogues/zambia/ (i.e.
// actually extracted from a PDF via process-pdfs.js) are kept. Everything
// else is removed:
//   - catalogues.source_url of ai-generated://... or web-search://...
//     (fetch-catalogues.js's AI/web-search fallback tiers)
//   - catalogue_prices rows with no catalogue_id at all (fetch-catalogues.js's
//     seedAIPrices(), which inserts without linking to a catalogue)
//
// Deliberately NOT used as deletion signals: round prices (K50/K100/K150 are
// completely normal real retail prices), "store not in an allowlist" (would
// permanently block any future store's real data the moment it's processed),
// and "<50 products" (a partial-but-real catalogue looks identical to this).
// Those are reported as warnings only, for a human to review.

import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const VERIFIED_SOURCE_PREFIX = "github://catalogues/zambia/";
const MAX_PASSES = 10;

async function ensureQualityLogTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS quality_log (
      id SERIAL PRIMARY KEY,
      store_name TEXT,
      reason TEXT,
      rows_deleted INTEGER,
      checked_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

async function findUnverifiedCatalogues() {
  return sql`
    SELECT id, store_name, source_url
    FROM catalogues
    WHERE source_url IS NULL OR source_url NOT LIKE ${VERIFIED_SOURCE_PREFIX + "%"}
  `;
}

async function findOrphanedPriceStores() {
  return sql`
    SELECT DISTINCT store_name
    FROM catalogue_prices
    WHERE catalogue_id IS NULL
  `;
}

// One pass: remove every currently-unverified catalogue and every orphaned
// (catalogue_id IS NULL) price row. Returns true if anything was deleted.
async function deleteUnverifiedRound() {
  let deletedAnything = false;

  const badCatalogues = await findUnverifiedCatalogues();
  for (const cat of badCatalogues) {
    const priceRows = await sql`DELETE FROM catalogue_prices WHERE catalogue_id = ${cat.id} RETURNING id`;
    await sql`DELETE FROM catalogues WHERE id = ${cat.id}`;
    await sql`
      INSERT INTO quality_log (store_name, reason, rows_deleted)
      VALUES (${cat.store_name}, ${`unverified source_url: ${cat.source_url ?? "(none)"}`}, ${priceRows.length})
    `;
    console.log(
      `  ✗ Removed ${cat.store_name} catalogue #${cat.id} (${priceRows.length} price rows) — source: ${cat.source_url ?? "(none)"}`
    );
    deletedAnything = true;
  }

  const orphanStores = await findOrphanedPriceStores();
  for (const { store_name } of orphanStores) {
    const rows = await sql`DELETE FROM catalogue_prices WHERE catalogue_id IS NULL AND store_name = ${store_name} RETURNING id`;
    await sql`
      INSERT INTO quality_log (store_name, reason, rows_deleted)
      VALUES (${store_name}, 'no catalogue_id — unlinked fallback row', ${rows.length})
    `;
    console.log(`  ✗ Removed ${rows.length} unlinked price row(s) for ${store_name} (no catalogue_id)`);
    deletedAnything = true;
  }

  return deletedAnything;
}

// Informational only — never triggers deletion. Round prices and thinner
// catalogues are common in real data, so they're surfaced for a human to
// look at rather than acted on automatically.
async function collectWarnings() {
  const warnings = [];

  const thin = await sql`
    SELECT store_name, COUNT(*)::int AS count
    FROM catalogue_prices
    GROUP BY store_name
    HAVING COUNT(*) < 50
  `;
  for (const row of thin) {
    warnings.push(`${row.store_name}: only ${row.count} products (thin catalogue)`);
  }

  const expired = await sql`
    SELECT DISTINCT store_name, valid_until
    FROM catalogues
    WHERE valid_until IS NOT NULL AND valid_until < CURRENT_DATE
    ORDER BY store_name
  `;
  for (const row of expired) {
    warnings.push(`${row.store_name}: valid_until ${row.valid_until} is in the past`);
  }

  return warnings;
}

async function finalReport() {
  return sql`
    SELECT c.store_name,
           COUNT(cp.id)::int AS product_count,
           MIN(c.valid_from) AS valid_from,
           MAX(c.valid_until) AS valid_until
    FROM catalogues c
    JOIN catalogue_prices cp ON cp.catalogue_id = c.id
    GROUP BY c.store_name
    ORDER BY c.store_name
  `;
}

async function main() {
  console.log("SmartTroli — Data Quality Check");
  console.log("================================");
  await ensureQualityLogTable();

  let pass = 0;
  while (pass < MAX_PASSES) {
    pass++;
    console.log(`\nPass ${pass}: scanning for unverified catalogue data...`);
    const deletedAnything = await deleteUnverifiedRound();
    if (!deletedAnything) {
      console.log("  Nothing left to remove.");
      break;
    }
  }
  if (pass >= MAX_PASSES) {
    console.warn(`\nStopped after ${MAX_PASSES} passes — check quality_log for a runaway insert source.`);
  }

  const warnings = await collectWarnings();
  if (warnings.length) {
    console.log("\n⚠️  Warnings (informational only — not deleted):");
    for (const w of warnings) console.log(`  - ${w}`);
  }

  console.log("\n================================");
  console.log("FINAL REPORT — verified catalogue data");
  console.log("================================");
  const report = await finalReport();
  if (report.length === 0) {
    console.log("(no verified catalogue data remains)");
  }
  for (const row of report) {
    console.log(
      `${row.store_name}: ${row.product_count} products, valid ${row.valid_from ?? "?"} → ${row.valid_until ?? "?"}`
    );
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
