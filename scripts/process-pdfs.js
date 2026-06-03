// scripts/process-pdfs.js
// Processes catalogue PDFs from catalogues/zambia/ folder
// Run automatically when new PDFs are pushed to GitHub
// Or manually: node scripts/process-pdfs.js

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, basename } from "path";
import fetch from "node-fetch";
import { neon } from "@neondatabase/serverless";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const TARGET_FILE = process.env.TARGET_FILE || "";

if (!ANTHROPIC_API_KEY || !DATABASE_URL) {
  console.error("Missing ANTHROPIC_API_KEY or DATABASE_URL");
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const PDF_DIR = join(process.cwd(), "catalogues", "zambia");

// ── Store name detection from filename ───────────────────────────────────────
// Filename format: StoreName_StartDate_EndDate.pdf
// Examples: Shoprite_01May_14May2026.pdf, Choppies_May2026.pdf
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
  // Default — use filename without extension
  return filename.replace(/\.pdf$/i, "").split("_")[0];
}

// ── Date detection from filename ──────────────────────────────────────────────
function detectDates(filename) {
  // Try pattern: StoreName_01May_14May2026.pdf or StoreName_May2026.pdf
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

// ── Extract prices from PDF using Claude ──────────────────────────────────────
async function extractFromPDF(pdfBuffer, storeName, filename) {
  console.log(`  Sending to Claude for extraction...`);
  const base64 = pdfBuffer.toString("base64");
  const sizeMB = (pdfBuffer.length / 1024 / 1024).toFixed(1);
  console.log(`  PDF size: ${sizeMB}MB`);

  // Process in chunks if PDF is large
  const MAX_SIZE_MB = 20;
  if (pdfBuffer.length > MAX_SIZE_MB * 1024 * 1024) {
    console.log(`  PDF is large — Claude will extract what it can from the first section`);
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 8000,
        system: "You are extracting Zambian grocery prices from a store catalogue PDF. Extract EVERY individual product and its Kwacha price. Skip bundle deals. Output ONLY valid JSON. Plain ASCII only.",
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: base64 },
            },
            {
              type: "text",
              text: `Extract ALL individual products and their Zambian Kwacha (K) prices from this ${storeName} Zambia catalogue.

Rules:
- Extract EVERY product with a clear price
- Prices are in Zambian Kwacha (K) — typically K10 to K5000
- Skip bundle deals (products with multiple items separated by commas or &)
- Include product name, size/weight if shown
- Mark isSpecial as true for all items (they are catalogue specials)

Output ONLY this JSON:
{"store":"${storeName}","validFrom":null,"validUntil":null,"products":[{"name":"IBC Nakonde Rice 5kg","price":162.99,"isSpecial":true},{"name":"Zamanita Cooking Oil 5L","price":208.99,"isSpecial":true},{"name":"Roller Meal 10kg","price":285.99,"isSpecial":true}]}

Extract as many products as possible.`,
            },
          ],
        }],
      }),
    });

    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");

    // Parse JSON — handle truncation
    const fb = text.indexOf("{");
    if (fb === -1) throw new Error("No JSON in response");

    let parsed = null;
    try {
      const lb = text.lastIndexOf("}");
      parsed = JSON.parse(text.slice(fb, lb + 1));
    } catch {
      // Fix truncated JSON
      try {
        const partial = text.slice(fb);
        const lastComma = partial.lastIndexOf("},");
        if (lastComma > 0) {
          parsed = JSON.parse(partial.slice(0, lastComma + 1) + "]}");
        }
      } catch {
        throw new Error("Could not parse JSON response");
      }
    }

    const products = (parsed.products || []).filter(p =>
      p.name && p.price > 0 && p.price < 100000 &&
      !p.name.includes(",") && p.name.length < 150
    );

    console.log(`  ✓ Extracted ${products.length} products`);
    return { products, validFrom: parsed.validFrom, validUntil: parsed.validUntil };

  } catch (err) {
    console.error(`  Extraction failed: ${err.message}`);
    return null;
  }
}

// ── Save to Neon ──────────────────────────────────────────────────────────────
async function saveToDatabase(storeName, products, validFrom, validUntil, filename) {
  try {
    const storeRows = await sql`SELECT id FROM stores WHERE name = ${storeName} LIMIT 1`;
    const storeId = storeRows[0]?.id || null;

    // Check if already processed
    if (validUntil) {
      const existing = await sql`
        SELECT id FROM catalogues WHERE store_name = ${storeName} AND valid_until = ${validUntil} LIMIT 1
      `;
      if (existing.length > 0) {
        console.log(`  Already have catalogue valid until ${validUntil} — skipping`);
        return { saved: false, reason: "already exists" };
      }
    }

    // Insert catalogue record
    const sourceUrl = `github://catalogues/zambia/${filename}`;
    const catRows = await sql`
      INSERT INTO catalogues (store_id, store_name, title, valid_from, valid_until, source_url, pdf_url, processed, page_count)
      VALUES (${storeId}, ${storeName}, ${`${storeName} Zambia Catalogue`}, ${validFrom}, ${validUntil}, ${sourceUrl}, ${sourceUrl}, false, 1)
      RETURNING id
    `;
    const catalogueId = catRows[0].id;

    // Insert products
    let saved = 0;
    for (const p of products) {
      if (!p.name || p.price <= 0) continue;
      try {
        await sql`
          INSERT INTO catalogue_prices (catalogue_id, store_id, store_name, product_name, price, is_special, valid_from, valid_until)
          VALUES (${catalogueId}, ${storeId}, ${storeName}, ${p.name.slice(0, 500)}, ${p.price}, true, ${validFrom}, ${validUntil})
        `;
        saved++;
      } catch { /* skip duplicates */ }
    }

    await sql`UPDATE catalogues SET processed = true, raw_text = ${`${saved} products`} WHERE id = ${catalogueId}`;
    console.log(`  ✓ Saved ${saved} products to database`);
    return { saved: true, count: saved };

  } catch (err) {
    console.error(`  Save failed: ${err.message}`);
    return { saved: false, reason: err.message };
  }
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

  // Get list of PDFs to process
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

      const extracted = await extractFromPDF(pdfBuffer, storeName, filename);
      if (!extracted || extracted.products.length === 0) {
        console.log(`  No products extracted`);
        results.push({ file: filename, store: storeName, status: "no-products" });
        continue;
      }

      // Use dates from PDF content if filename didn't have them
      const finalFrom = validFrom || extracted.validFrom;
      const finalUntil = validUntil || extracted.validUntil;

      const { saved, count, reason } = await saveToDatabase(
        storeName, extracted.products, finalFrom, finalUntil, filename
      );

      results.push({
        file: filename,
        store: storeName,
        status: saved ? "success" : "skipped",
        products: count,
        reason,
      });

    } catch (err) {
      console.error(`  Error: ${err.message}`);
      results.push({ file: filename, store: storeName, status: "error", error: err.message });
    }
  }

  // Summary
  console.log("\n============================================");
  console.log("SUMMARY");
  console.log("============================================");
  results.forEach(r => {
    const icon = r.status === "success" ? "✅" : r.status === "skipped" ? "⏭️" : "❌";
    console.log(`${icon} ${r.file} (${r.store}): ${r.status}${r.products ? ` — ${r.products} products` : ""}${r.reason ? ` — ${r.reason}` : ""}`);
  });

  const succeeded = results.filter(r => r.status === "success").length;
  console.log(`\nCompleted: ${succeeded}/${results.length} files processed`);
  console.log(`Finished: ${new Date().toISOString()}`);
}

main().catch(err => { console.error("Fatal error:", err); process.exit(1); });
