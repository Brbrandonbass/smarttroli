// scripts/process-pdfs.js
// Processes catalogue PDFs from catalogues/zambia/ folder
// Run automatically when new PDFs are pushed to GitHub
// Or manually: node scripts/process-pdfs.js

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { neon } from "@neondatabase/serverless";
import { extractWithLoop } from "./agent-pipeline.js";

const DATABASE_URL = process.env.DATABASE_URL;
const TARGET_FILE = process.env.TARGET_FILE || "";

if (!process.env.ANTHROPIC_API_KEY || !DATABASE_URL) {
  console.error("Missing ANTHROPIC_API_KEY or DATABASE_URL");
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const PDF_DIR = join(process.cwd(), "catalogues", "zambia");

// ── Store name detection from filename ───────────────────────────────────────
function detectStore(filename) {
  const lower = filename.toLowerCase();
  if (lower.includes("shoprite")) return "Shoprite";
  if (lower.includes("choppies")) return "Choppies";
  if (lower.includes("picknpay") || lower.includes("pick-n-pay") || lower.includes("pnp")) return "Pick n Pay";
  if (lower.includes("game")) return "Game";
  if (lower.includes("spar")) return "Spar";
  if (lower.includes("woolworths") || lower.includes("woolies")) return "Woolworths";
  if (lower.includes("checkers")) return "Checkers";
  if (lower.includes("foodlovers") || lower.includes("food-lovers")) return "Food Lovers Market";
  return filename.replace(/\.pdf$/i, "").split("_")[0];
}

// ── Date detection from filename ──────────────────────────────────────────────
function detectDates(filename) {
  const datePattern = /(\d{1,2})(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(\d{4})?/gi;
  const matches = [...filename.matchAll(datePattern)];

  if (matches.length >= 2) {
    const year = new Date().getFullYear();
    const months = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };
    const parseMatch = (m) => {
      const d = m[1].padStart(2, "0");
      const mo = months[m[2].toLowerCase()];
      const y = m[3] || year;
      return `${y}-${mo}-${d}`;
    };
    return { validFrom: parseMatch(matches[0]), validUntil: parseMatch(matches[1]) };
  }
  return { validFrom: null, validUntil: null };
}

// ── Ensure catalogue record exists (processed=false until extractWithLoop completes) ─
async function ensureCatalogue(storeName, validFrom, validUntil, filename) {
  const storeRows = await sql`SELECT id FROM stores WHERE name = ${storeName} LIMIT 1`;
  const storeId = storeRows[0]?.id || null;
  const sourceUrl = `github://catalogues/zambia/${filename}`;

  if (validUntil) {
    const existing = await sql`
      SELECT id, processed FROM catalogues
      WHERE store_name = ${storeName} AND valid_until = ${validUntil}
      LIMIT 1
    `;
    if (existing.length > 0) {
      if (existing[0].processed) {
        console.log(`  Already processed catalogue valid until ${validUntil}`);
        return { catalogueId: null, storeId, skip: true, reason: "already exists" };
      }
      return { catalogueId: existing[0].id, storeId, skip: false };
    }
  }

  const catRows = await sql`
    INSERT INTO catalogues (store_id, store_name, title, valid_from, valid_until, source_url, pdf_url, processed, page_count)
    VALUES (${storeId}, ${storeName}, ${`${storeName} Zambia Catalogue`}, ${validFrom}, ${validUntil}, ${sourceUrl}, ${sourceUrl}, false, 1)
    RETURNING id
  `;
  return { catalogueId: catRows[0].id, storeId, skip: false };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("SmartTroli — Zambia Catalogue PDF Processor");
  console.log("============================================");
  console.log(`Started: ${new Date().toISOString()}\n`);

  if (!existsSync(PDF_DIR)) {
    console.error(`PDF directory not found: ${PDF_DIR}`);
    console.log("Create folder: catalogues/zambia/ and add PDF files");
    process.exit(1);
  }

  let files = readdirSync(PDF_DIR).filter(f => f.toLowerCase().endsWith(".pdf"));

  if (TARGET_FILE) {
    files = files.filter(f => f === TARGET_FILE);
    if (files.length === 0) {
      console.error(`File not found: ${TARGET_FILE}`);
      process.exit(1);
    }
  }

  if (files.length === 0) {
    console.log("No PDF files found in catalogues/zambia/");
    console.log("Add PDFs named like: Shoprite_01May_14May2026.pdf");
    process.exit(0);
  }

  console.log(`Found ${files.length} PDF file(s):\n${files.map(f => `  - ${f}`).join("\n")}\n`);

  const results = [];

  for (const filename of files) {
    console.log(`\n📄 Processing: ${filename}`);
    console.log("─".repeat(40));

    const storeName = detectStore(filename);
    const { validFrom, validUntil } = detectDates(filename);
    console.log(`  Store: ${storeName}`);
    console.log(`  Valid: ${validFrom || "unknown"} → ${validUntil || "unknown"}`);

    try {
      const pdfPath = join(PDF_DIR, filename);
      const pdfBuffer = readFileSync(pdfPath);

      const { catalogueId, storeId, skip, reason } = await ensureCatalogue(
        storeName, validFrom, validUntil, filename
      );

      if (skip) {
        results.push({ file: filename, store: storeName, status: "skipped", reason });
        continue;
      }

      const extracted = await extractWithLoop(pdfBuffer, storeName, catalogueId, {
        storeId,
        validFrom,
        validUntil,
      });

      if (!extracted?.products?.length) {
        console.log(`  No products extracted`);
        results.push({ file: filename, store: storeName, status: "no-products" });
        continue;
      }

      results.push({
        file: filename,
        store: storeName,
        status: extracted.processed ? "success" : "partial",
        products: extracted.totalProducts,
        reason: extracted.processed ? undefined : "awaiting more chunks/products",
      });

    } catch (err) {
      console.error(`  Error: ${err.message}`);
      results.push({ file: filename, store: storeName, status: "error", error: err.message });
    }
  }

  console.log("\n============================================");
  console.log("SUMMARY");
  console.log("============================================");
  results.forEach(r => {
    const icon = r.status === "success" ? "✅" : r.status === "skipped" ? "⏭️" : r.status === "partial" ? "🔄" : "❌";
    console.log(`${icon} ${r.file} (${r.store}): ${r.status}${r.products ? ` — ${r.products} products` : ""}${r.reason ? ` — ${r.reason}` : ""}`);
  });

  const succeeded = results.filter(r => r.status === "success").length;
  console.log(`\nCompleted: ${succeeded}/${results.length} files processed`);
  console.log(`Finished: ${new Date().toISOString()}`);
}

main().catch(err => { console.error("Fatal error:", err); process.exit(1); });
