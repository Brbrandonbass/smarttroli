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
      "https://choppies.co.zm/Cpromotions/promotions.pdf",
      "https://choppies.co.zm/promotions/",
      "https://supermarketsandgrocers.shop/zam/choppies/",
    ],
    currency: "K",
  },
  {
    name: "Shoprite",
    sources: [
      "https://www.shoprite.co.zm/specials.html",
      "https://supermarketsandgrocers.shop/zam/shoprite/",
      "https://www.shoprite.co.zm/",
    ],
    currency: "K",
  },
  {
    name: "Pick n Pay",
    sources: [
      "https://www.picknpayzambia.com/specials",
      "https://www.picknpayzambia.com/deals-and-promotions",
      "https://supermarketsandgrocers.shop/zam/pick-n-pay/",
      "https://www.picknpayzambia.com/",
    ],
    currency: "K",
  },
  {
    name: "Game",
    sources: [
      "https://supermarketsandgrocers.shop/zam/game/",
      "https://m.guzzle.co.za/retailer/560/lusaka/",
    ],
    currency: "K",
  },
  {
    name: "Spar",
    sources: [
      "https://www.sparzambia.com/specials",
      "https://supermarketsandgrocers.shop/zam/spar/",
    ],
    currency: "K",
  },
  {
    name: "Woolworths",
    sources: [
      "https://supermarketsandgrocers.shop/zam/woolworths/",
    ],
    currency: "K",
  },
];

// Official domains for web search (when HTML scraping fails)
const STORE_SEARCH_DOMAINS = {
  "Choppies": ["choppies.co.zm"],
  "Shoprite": ["shoprite.co.zm"],
  "Pick n Pay": ["picknpayzambia.com"],
  "Game": ["gamestores.co.za", "guzzle.co.za"],
  "Spar": ["sparzambia.com"],
  "Woolworths": ["woolworths.co.za"],
};

// ── Per-store anchor prices (Zambian Kwacha) ──────────────────────────────────
const STORE_ANCHORS = {
  "Shoprite": {
    rollerMeal5kg: 158, bread700g: 38, cookingOil2L: 135, sugar2kg: 98,
    eggs30: 185, chicken2kg: 255, rice2kg: 78, coke2L: 78,
  },
  "Pick n Pay": {
    rollerMeal5kg: 165, bread700g: 42, cookingOil2L: 142, sugar2kg: 105,
    eggs30: 195, chicken2kg: 270, rice2kg: 85, coke2L: 82,
  },
  "Spar": {
    rollerMeal5kg: 172, bread700g: 45, cookingOil2L: 148, sugar2kg: 110,
    eggs30: 205, chicken2kg: 285, rice2kg: 90, coke2L: 88,
  },
  "Game": {
    rollerMeal5kg: 155, bread700g: 40, cookingOil2L: 130, sugar2kg: 95,
    eggs30: 180, chicken2kg: 248, rice2kg: 75, coke2L: 75,
  },
};

const STORE_TIERS = {
  "Shoprite": "cheapest mainstream supermarket in Zambia",
  "Game": "bulk/value warehouse — lowest unit prices on staples",
  "Pick n Pay": "competitive mid-low pricing",
  "Spar": "mid-range neighbourhood supermarket",
  "Woolworths": "premium quality — higher than Spar",
  "Choppies": "budget-friendly discount chain",
};

const GROCERY_CATEGORIES = [
  "roller meal", "bread", "eggs", "chicken", "beef", "pork", "fish/kapenta",
  "cooking oil", "sugar", "rice", "pasta", "beans", "tomatoes", "onions", "potatoes",
  "milk", "butter", "cheese", "yoghurt", "juice", "Coca-Cola", "Fanta", "water",
  "soap", "washing powder", "dishwashing liquid", "toothpaste", "shampoo",
  "nappies", "baby food", "toilet paper", "candles", "matches",
  "maheu", "tea", "coffee", "flour", "samp", "margarine", "bleach", "spaghetti",
];

// ── Cookie jar for browser-like requests ──────────────────────────────────────
const cookieJar = new Map();

function storeCookies(url, headers) {
  const hostname = new URL(url).hostname;
  let setCookies = [];
  if (typeof headers.getSetCookie === "function") {
    setCookies = headers.getSetCookie();
  } else if (typeof headers.raw === "function") {
    setCookies = headers.raw()["set-cookie"] || [];
  } else {
    const single = headers.get("set-cookie");
    if (single) setCookies = [single];
  }
  if (!setCookies.length) return;
  const existing = cookieJar.get(hostname) || {};
  for (const raw of setCookies) {
    const pair = raw.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq > 0) existing[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  cookieJar.set(hostname, existing);
}

function getCookieHeader(url) {
  const cookies = cookieJar.get(new URL(url).hostname);
  if (!cookies || !Object.keys(cookies).length) return "";
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
}

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-ZM,en-US;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

// ── Fetch HTML ────────────────────────────────────────────────────────────────
async function fetchHtml(url) {
  const cookie = getCookieHeader(url);
  const res = await fetch(url, {
    headers: {
      ...BROWSER_HEADERS,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    timeout: 20000,
    redirect: "follow",
  });
  storeCookies(url, res.headers);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("pdf")) {
    const buffer = await res.arrayBuffer();
    return { type: "pdf", base64: Buffer.from(buffer).toString("base64"), size: buffer.byteLength };
  }
  return { type: "html", content: await res.text() };
}

// ── Parse Anthropic JSON product responses ────────────────────────────────────
function getAnthropicText(response) {
  return (response.content || []).filter(b => b.type === "text").map(b => b.text).join("");
}

function parseProductsFromText(text) {
  const fb = text.indexOf("{");
  if (fb === -1) return null;
  let parsed = null;
  try {
    const lb = text.lastIndexOf("}");
    parsed = JSON.parse(text.slice(fb, lb + 1));
  } catch {
    try {
      const partial = text.slice(fb);
      const lastComma = partial.lastIndexOf("},");
      if (lastComma > 0) parsed = JSON.parse(partial.slice(0, lastComma + 1) + "]}");
    } catch { /* ignore */ }
  }
  return parsed;
}

function filterValidProducts(products) {
  return (products || []).filter(p =>
    p.name && p.price > 0 && p.price < 100000 &&
    !p.name.includes(",") && p.name.length < 100
  );
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
        max_tokens: 8000,
        system: "Extract Zambian grocery prices. Output ONLY valid JSON. Plain ASCII only. No markdown.",
        messages,
      }),
    });

    if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
    const response = await res.json();
    const parsed = parseProductsFromText(getAnthropicText(response));
    if (!parsed) { console.log("  JSON parse failed"); return null; }
    const products = filterValidProducts(parsed.products);
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


// ── Seed database with accurate AI-generated Zambian prices ─────────────────
async function seedAIPrices() {
  console.log("\nSeeding AI-generated Zambian prices...");
  const prompt = `Generate current 2025-2026 Zambian Kwacha grocery prices for: Choppies, Shoprite, Pick n Pay, Game, Spar. Include 30+ items per store. Key prices: Roller Meal 5kg K155-175, Bread 700g K35-55, Cooking Oil 2L K130-160, Sugar 2kg K95-115, Eggs 30s K180-230, Chicken 2kg K250-350, Rice 2kg K75-100, Coke 2L K75-95. Output ONLY valid JSON: {"stores":[{"store":"Choppies","products":[{"name":"Roller Meal 5kg","price":155,"isSpecial":false}]}]}`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 8000, system: "Zambian grocery price expert. Output ONLY valid JSON. Plain ASCII.", messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const fb = text.indexOf("{"); const lb = text.lastIndexOf("}");
    if (fb === -1) return;
    const parsed = JSON.parse(text.slice(fb, lb + 1));
    let totalSaved = 0;
    for (const storeData of (parsed.stores || [])) {
      const storeRows = await sql`SELECT id FROM stores WHERE name = ${storeData.store} LIMIT 1`;
      const storeId = storeRows[0]?.id || null;
      for (const p of (storeData.products || [])) {
        if (!p.name || p.price <= 0) continue;
        try {
          const existing = await sql`SELECT id FROM catalogue_prices WHERE store_name = ${storeData.store} AND product_name = ${p.name} LIMIT 1`;
          if (existing.length > 0) continue;
          await sql`INSERT INTO catalogue_prices (store_id, store_name, product_name, price, is_special, valid_until) VALUES (${storeId}, ${storeData.store}, ${p.name}, ${p.price}, ${p.isSpecial || false}, NULL)`;
          totalSaved++;
        } catch { /* skip */ }
      }
    }
    console.log(`  ✓ Seeded ${totalSaved} AI price entries`);
  } catch (err) { console.error(`  AI seed failed: ${err.message}`); }
}

// ── Per-store web search fallback when HTML scraping returns 0 products ───────
async function fetchStorePricesViaWebSearch(storeName, storeConfig) {
  console.log(`  Searching web for live ${storeName} Zambia prices...`);

  const domains = STORE_SEARCH_DOMAINS[storeName];
  const storeSites = (storeConfig?.sources || []).slice(0, 3).join(", ");
  const tool = {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: 8,
    user_location: {
      type: "approximate",
      city: "Lusaka",
      region: "Lusaka Province",
      country: "ZM",
      timezone: "Africa/Lusaka",
    },
    ...(domains?.length ? { allowed_domains: domains } : {}),
  };

  const prompt = `Search for current ${storeName} Zambia grocery specials and prices this week.
${storeSites ? `Check official sources: ${storeSites}. ` : ""}Find real current Zambian Kwacha (K) prices for common groceries like mealie meal, roller meal, bread, eggs, chicken, beef, cooking oil, sugar, rice, pasta, milk, Coca-Cola, soap, washing powder, toilet paper, and at least 30 products total.
Prices must be in Kwacha (K). Use prices from search results — do not invent prices.
Output ONLY JSON: {"products":[{"name":"product name","price":155.00,"isSpecial":true}]}`;

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
        tools: [tool],
        system: "You are searching for current live grocery prices in Zambia in Kwacha. Output ONLY valid JSON.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`API ${res.status}: ${errBody.slice(0, 300)}`);
    }

    const data = await res.json();
    const parsed = parseProductsFromText(getAnthropicText(data));
    if (!parsed) {
      console.log("  Web search JSON parse failed");
      return null;
    }

    const products = filterValidProducts(parsed.products);
    console.log(`  Web search found ${products.length} products for ${storeName}`);
    return {
      store: storeName,
      products,
      validFrom: parsed.validFrom || null,
      validUntil: parsed.validUntil || null,
    };
  } catch (err) {
    console.error(`  Web search failed for ${storeName}: ${err.message}`);
    return null;
  }
}

// ── Per-store AI fallback (last resort if web search also fails) ──────────────
function buildAnchorPrompt(storeName) {
  const anchors = STORE_ANCHORS[storeName];
  if (!anchors) return "";
  return `
ANCHOR PRICES for ${storeName} (match these closely, vary other items around them):
- Roller Meal 5kg: K${anchors.rollerMeal5kg}
- Bread 700g: K${anchors.bread700g}
- Cooking Oil 2L: K${anchors.cookingOil2L}
- Sugar 2kg: K${anchors.sugar2kg}
- Eggs 30s: K${anchors.eggs30}
- Chicken pieces 2kg: K${anchors.chicken2kg}
- Rice 2kg: K${anchors.rice2kg}
- Coca-Cola 2L: K${anchors.coke2L}`;
}

async function generateStoreAIPrices(storeName) {
  const tier = STORE_TIERS[storeName] || "Zambian supermarket";
  const anchorBlock = buildAnchorPrompt(storeName);
  const categories = GROCERY_CATEGORIES.join(", ");

  console.log(`  Generating AI prices for ${storeName} (${tier})...`);
  const prompt = `Generate 40+ realistic current Zambian Kwacha (K) grocery prices for ${storeName} Zambia.
Store positioning: ${tier}.
${anchorBlock}

Pricing context: Shoprite is cheapest, Game is bulk/value, Pick n Pay is mid-low, Spar is mid-range.
Include products across these categories: ${categories}.
Use realistic Zambian brand names and pack sizes. Prices in K, range K10-K5000.

Output ONLY valid JSON:
{"store":"${storeName}","validFrom":null,"validUntil":null,"products":[{"name":"Roller Meal 5kg","price":158,"isSpecial":false}]}`;

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
        system: "Zambian grocery price expert. Output ONLY valid JSON. Plain ASCII. No markdown.",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    const parsed = parseProductsFromText(getAnthropicText(data));
    if (!parsed) return null;

    const products = filterValidProducts(parsed.products);
    console.log(`  AI generated ${products.length} products for ${storeName}`);
    return { store: storeName, products, validFrom: null, validUntil: null };
  } catch (err) {
    console.error(`  AI generation failed for ${storeName}: ${err.message}`);
    return null;
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
      console.log(`  Web scraping returned 0 products — using web search for ${store.name}`);
      let fallbackData = await fetchStorePricesViaWebSearch(store.name, store);
      let sourceUrl = `web-search://${store.name.toLowerCase().replace(/\s+/g, "-")}`;

      if (!fallbackData?.products?.length) {
        console.log(`  Web search returned 0 — using AI fallback for ${store.name}`);
        fallbackData = await generateStoreAIPrices(store.name);
        sourceUrl = `ai-generated://${store.name.toLowerCase().replace(/\s+/g, "-")}`;
      }

      if (fallbackData?.products?.length > 0) {
        const { saved, count, reason } = await saveToDatabase(
          store.name,
          fallbackData.products,
          fallbackData.validFrom,
          fallbackData.validUntil,
          sourceUrl
        );
        results.push({
          store: store.name,
          status: saved ? "success" : "skipped",
          products: count,
          source: sourceUrl,
          reason: reason || (saved ? sourceUrl.split("://")[0] : undefined),
        });
      } else {
        results.push({ store: store.name, status: "no-data" });
      }
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  // If no stores succeeded, seed with AI prices
  const succeeded = results.filter(r => r.status === "success").length;
  if (succeeded === 0) {
    await seedAIPrices();
  }

  // Summary
  console.log("\n====================================================");
  console.log("SUMMARY");
  console.log("====================================================");
  results.forEach(r => {
    const icon = r.status === "success" ? "✅" : r.status === "skipped" ? "⏭️" : "❌";
    console.log(`${icon} ${r.store}: ${r.status}${r.products ? ` (${r.products} products)` : ""}${r.reason ? ` — ${r.reason}` : ""}`);
  });

  const totalSucceeded = results.filter(r => r.status === "success").length;
  console.log(`\nCompleted: ${totalSucceeded}/${results.length} stores`);
  console.log(`Finished: ${new Date().toISOString()}`);
}

main().catch(err => { console.error("Fatal error:", err); process.exit(1); });