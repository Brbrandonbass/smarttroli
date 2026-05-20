// scripts/fetch-catalogues.js
// SmartTroli Zambia — Fetches real catalogue prices from Zambian stores
// Sources: Choppies ZM, Shoprite ZM, Pick n Pay ZM, Game ZM, Spar ZM

import fetch from "node-fetch";
import { neon } from "@neondatabase/serverless";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!ANTHROPIC_API_KEY || !DATABASE_URL) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

// ── Zambian store sources ─────────────────────────────────────────────────────
const STORES = [
  {
    name: "Choppies",
    sources: [
      "https://choppies.co.zm/promotions/",
      "https://choppies.co.zm/Cpromotions/promotions.pdf",
    ],
    currency: "K",
  },
  {
    name: "Shoprite",
    sources: [
      "https://www.shoprite.co.zm/specials.html",
      "https://www.shoprite.co.zm/promotions.html",
    ],
    currency: "K",
  },
  {
    name: "Pick n Pay",
    sources: [
      "https://www.picknpayzambia.com/specials",
      "https://www.picknpayzambia.com/promotions",
      "https://www.picknpayzambia.com/deals",
    ],
    currency: "K",
  },
  {
    name: "Game",
    sources: [
      "https://m.guzzle.co.za/retailer/560/lusaka/",
      "https://www.guzzle.co.za/game-zambia",
    ],
    currency: "K",
  },
  {
    name: "Spar",
    sources: [
      "https://www.spar.co.zm/specials",
      "https://www.spar.co.zm/promotions",
    ],
    currency: "K",
  },
  {
    name: "Food Lovers Market",
    sources: [
      "https://www.foodlovers.co.zm/specials",
      "https://www.foodlovers.co.za/specials",
    ],
    currency: "K",
  },
];

// ── Fetch HTML ────────────────────────────────────────────────────────────────
async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-ZM,en;q=0.9",
    },
    timeout: 20000,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("pdf")) {
    const buffer = await res.arrayBuffer();
    return { type: "pdf", base64: Buffer.from(buffer).toString("base64"), size: buffer.byteLength };
  }
  return { type: "html", content: await res.text() };
}

// ── Extract dates ─────────────────────────────────────────────────────────────
function extractDates(text) {
  const match = text.match(/(\d{2}[\/-]\d{2}[\/-]\d{4}|\d{1,2}\s+\w+\s+\d{4})/g);
  if (!match || match.length < 2) return { validFrom: null, validUntil: null };
  try {
    const parseDate = (str) => {
      const d = new Date(str.replace(/\//g, "-"));
      return isNaN(d) ? null : d.toISOString().split("T")[0];
    };
    return { validFrom: parseDate(match[0]), validUntil: parseDate(match[1]) };
  } catch { return { validFrom: null, validUntil: null }; }
}

// ── Use Claude to extract prices from HTML or PDF ─────────────────────────────
async function extractWithClaude(data, storeName) {
  console.log(`  Using Claude to extract prices for ${storeName}...`);
  try {
    let messages;

    if (data.type === "pdf") {
      const sizeMB = (data.size / 1024 / 1024).toFixed(1);
      console.log(`  PDF size: ${sizeMB}MB`);
      messages = [{
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: data.base64 },
          },
          {
            type: "text",
            text: `Extract ALL products and their Zambian Kwacha (K) prices from this ${storeName} Zambia catalogue PDF.

IMPORTANT:
- Prices are in Zambian Kwacha (K) — typical range K10-K5000
- Skip any bundle deals with multiple items (containing commas, "&" etc)
- Include product name, size/weight, and exact price

Output ONLY valid JSON:
{"store":"${storeName}","validFrom":null,"validUntil":null,"products":[{"name":"IBC Nakonde Rice 5kg","price":162.99,"isSpecial":true},{"name":"Zamanita Cooking Oil 5L","price":208.99,"isSpecial":true}]}`,
          },
        ],
      }];
    } else {
      const cleanText = data.content
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 12000);

      messages = [{
        role: "user",
        content: `Extract ALL products and Zambian Kwacha prices from this ${storeName} Zambia specials page.

IMPORTANT:
- Prices are in Zambian Kwacha (K) — typical range K10-K5000
- Skip bundle deals with multiple items
- Only individual products

Text:
${cleanText}

Output ONLY valid JSON:
{"store":"${storeName}","validFrom":null,"validUntil":null,"products":[{"name":"Roller Meal 5kg","price":165,"isSpecial":true}]}`,
      }];
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        system: "Extract Zambian grocery prices. Output ONLY valid JSON. Plain ASCII only. No markdown.",
        messages,
      }),
    });

    if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
    const response = await res.json();
    const text = (response.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const fb = text.indexOf("{"); const lb = text.lastIndexOf("}");
    if (fb === -1) return null;

    const parsed = JSON.parse(text.slice(fb, lb + 1));
    const products = (parsed.products || []).filter(p =>
      p.name && p.price > 0 && p.price < 100000 &&
      !p.name.includes(",") && p.name.length < 100
    );
    console.log(`  Extracted ${products.length} products`);
    return { ...parsed, products };
  } catch (err) {
    console.error(`  Claude extraction failed: ${err.message}`);
    return null;
  }
}

// ── Save to Neon ──────────────────────────────────────────────────────────────
async function saveToDatabase(storeName, products, validFrom, validUntil, sourceUrl) {
  try {
    const storeRows = await sql`SELECT id FROM stores WHERE name = ${storeName} LIMIT 1`;
    const storeId = storeRows[0]?.id || null;

    // Check if we already have this catalogue
    if (validUntil) {
      const existing = await sql`
        SELECT id FROM catalogues WHERE store_name = ${storeName} AND valid_until = ${validUntil} LIMIT 1
      `;
      if (existing.length > 0) {
        console.log(`  Already have catalogue valid until ${validUntil}`);
        return { saved: false, reason: "already exists" };
      }
    }

    // Insert catalogue
    const catRows = await sql`
      INSERT INTO catalogues (store_id, store_name, title, valid_from, valid_until, source_url, pdf_url, processed, page_count)
      VALUES (${storeId}, ${storeName}, ${`${storeName} Zambia Specials`}, ${validFrom}, ${validUntil}, ${sourceUrl}, ${sourceUrl}, false, 1)
      RETURNING id
    `;
    const catalogueId = catRows[0].id;

    let saved = 0;
    for (const p of products) {
      if (!p.name || p.price <= 0) continue;
      try {
        await sql`
          INSERT INTO catalogue_prices (catalogue_id, store_id, store_name, product_name, price, is_special, valid_from, valid_until)
          VALUES (${catalogueId}, ${storeId}, ${storeName}, ${p.name.slice(0, 500)}, ${p.price}, ${p.isSpecial || true}, ${validFrom}, ${validUntil})
        `;
        saved++;
      } catch { /* skip duplicates */ }
    }

    await sql`UPDATE catalogues SET processed = true, raw_text = ${`${saved} products`} WHERE id = ${catalogueId}`;
    console.log(`  ✓ Saved ${saved} products`);
    return { saved: true, count: saved };
  } catch (err) {
    console.error(`  Save failed: ${err.message}`);
    return { saved: false, reason: err.message };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("SmartTroli Zambia — Catalogue Fetcher");
  console.log("====================================================");
  console.log(`Started: ${new Date().toISOString()}\n`);

  const TARGET_STORE = process.env.TARGET_STORE || "";
  const storesToProcess = TARGET_STORE
    ? STORES.filter(s => s.name.toLowerCase() === TARGET_STORE.toLowerCase())
    : STORES;

  const results = [];

  for (const store of storesToProcess) {
    console.log(`\n📦 ${store.name} Zambia`);
    console.log("─".repeat(40));

    let success = false;

    for (const sourceUrl of store.sources) {
      console.log(`  Trying: ${sourceUrl}`);
      try {
        const data = await fetchHtml(sourceUrl);
        const extracted = await extractWithClaude(data, store.name);

        if (!extracted || extracted.products.length === 0) {
          console.log(`  No products extracted from ${sourceUrl}`);
          continue;
        }

        const { validFrom, validUntil } = extractDates(JSON.stringify(extracted));
        const { saved, count, reason } = await saveToDatabase(
          store.name, extracted.products, validFrom, validUntil, sourceUrl
        );

        results.push({
          store: store.name,
          status: saved ? "success" : "skipped",
          products: count,
          source: sourceUrl,
          reason,
        });
        success = true;
        break; // Got data from this source, move to next store

      } catch (err) {
        console.log(`  ✗ Failed (${sourceUrl}): ${err.message}`);
      }
    }

    if (!success) {
      results.push({ store: store.name, status: "no-data" });
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  // Summary
  console.log("\n====================================================");
  console.log("SUMMARY");
  console.log("====================================================");
  results.forEach(r => {
    const icon = r.status === "success" ? "✅" : r.status === "skipped" ? "⏭️" : "❌";
    console.log(`${icon} ${r.store}: ${r.status}${r.products ? ` (${r.products} products)` : ""}${r.reason ? ` — ${r.reason}` : ""}`);
  });

  const succeeded = results.filter(r => r.status === "success").length;
  console.log(`\nCompleted: ${succeeded}/${results.length} stores`);
  console.log(`Finished: ${new Date().toISOString()}`);
}

main().catch(err => { console.error("Fatal error:", err); process.exit(1); });