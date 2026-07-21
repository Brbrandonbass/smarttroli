// app/api/search/route.js
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

const ZAMBIAN_STORES = [
  "Shoprite", "Pick n Pay", "Spar", "Choppies", "Game", "Jumbo",
  "Melissa", "Cheers", "Freshmark", "Zambeef",
];

function sanitizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map(i => typeof i === "string" ? i.replace(/[^a-zA-Z0-9\s\-\.\,]/g, "").trim() : "")
    .filter(i => i.length > 0 && i.length <= 100)
    .slice(0, 20);
}

// Extract quantity from search term (e.g. "5l", "2kg", "30s", "5 litre")
function extractQuantity(itemName) {
  const text = itemName.toLowerCase().replace(/[^a-z0-9. ]/g, " ").replace(/\s+/g, " ").trim();

  const patterns = [
    { regex: /\b(\d+(?:\.\d+)?)\s*(litre|liter|litres|liters)\b/, unit: "l" },
    { regex: /\b(\d+(?:\.\d+)?)\s*(kg|kilogram|kilograms)\b/, unit: "kg" },
    { regex: /\b(\d+(?:\.\d+)?)\s*(g|gram|grams)\b/, unit: "g" },
    { regex: /\b(\d+(?:\.\d+)?)\s*(ml|millilitre|milliliter|millilitres|milliliters)\b/, unit: "ml" },
    { regex: /\b(\d+)\s*s\b/, unit: "s" },
    { regex: /\b(\d+(?:\.\d+)?)\s*l\b/, unit: "l" },
    { regex: /\b(\d+(?:\.\d+)?)(kg|g|ml)\b/, unit: null },
    { regex: /\b(\d+)s\b/, unit: "s" },
  ];

  for (const { regex, unit } of patterns) {
    const match = text.match(regex);
    if (match) {
      const value = match[1];
      const resolvedUnit = unit || match[2];
      return { value, unit: resolvedUnit, raw: match[0].trim() };
    }
  }
  return null;
}

function productMatchesQuantity(productName, quantity) {
  const name = productName.toLowerCase();
  const num = quantity.value.replace(/\.0+$/, "").replace(/^0+(\d)/, "$1");
  const escaped = num.replace(".", "\\.");

  if (quantity.unit === "l") {
    return [
      new RegExp(`\\b${escaped}\\s*l(?:itre|iter|itres|iters)?\\b`, "i"),
      new RegExp(`\\b${escaped}l\\b`, "i"),
    ].some(r => r.test(name));
  }
  if (quantity.unit === "kg") {
    return [
      new RegExp(`\\b${escaped}\\s*kg\\b`, "i"),
      new RegExp(`\\b${escaped}\\s*kilogram`, "i"),
      new RegExp(`\\b${escaped}kg\\b`, "i"),
    ].some(r => r.test(name));
  }
  if (quantity.unit === "g") {
    return [
      new RegExp(`\\b${escaped}\\s*g(?:ram|rams)?\\b`, "i"),
      new RegExp(`\\b${escaped}g\\b`, "i"),
    ].some(r => r.test(name));
  }
  if (quantity.unit === "ml") {
    return [
      new RegExp(`\\b${escaped}\\s*ml\\b`, "i"),
      new RegExp(`\\b${escaped}\\s*millilitre`, "i"),
      new RegExp(`\\b${escaped}ml\\b`, "i"),
    ].some(r => r.test(name));
  }
  if (quantity.unit === "s") {
    return [
      new RegExp(`\\b${escaped}\\s*s\\b`, "i"),
      new RegExp(`\\b${escaped}s\\b`, "i"),
    ].some(r => r.test(name));
  }
  return false;
}

// Look up prices from Neon database
async function lookupPrices(itemName) {
  try {
    if (!process.env.DATABASE_URL) return [];
    const sql = neon(process.env.DATABASE_URL);

    const stopWords = new Set(["the","and","or","in","at","of","a","an","for","with","to","is","it"]);
    const keywords = itemName.toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(" ")
      .filter(w => w.length > 2 && !stopWords.has(w));

    if (keywords.length === 0) return [];

    const allResults = [];
    for (const keyword of keywords.slice(0, 3)) {
      const pattern = `%${keyword}%`;
      const rows = await sql`
        SELECT cp.store_name, cp.product_name, cp.price, cp.is_special, cp.valid_until
        FROM catalogue_prices cp
        JOIN catalogues c ON c.id = cp.catalogue_id
        WHERE cp.product_name ILIKE ${pattern}
          AND c.source_url LIKE 'github://catalogues/zambia/%'
        ORDER BY cp.price ASC
        LIMIT 50
      `;
      allResults.push(...rows);
    }

    if (allResults.length === 0) return [];

    // Score by keyword matches
    const scored = allResults.map(row => {
      const productLower = row.product_name.toLowerCase();
      const score = keywords.filter(w => productLower.includes(w)).length;
      return { ...row, score };
    }).filter(r => r.score > 0);

    // Filter bundles
    const filtered = scored.filter(row => {
      const name = row.product_name;
      const isBundleLong = name.includes(" & ") && name.length > 60;
      const isTooLong = name.length > 100;
      return !isBundleLong && !isTooLong;
    });

    const toUse = filtered.length > 0 ? filtered : scored;

    // Quantity filter — e.g. "cooking oil 5l" should not return 2L variants
    const quantity = extractQuantity(itemName);
    let sizeMatched = toUse;
    if (quantity) {
      const exactSize = toUse.filter(row => productMatchesQuantity(row.product_name, quantity));
      if (exactSize.length > 0) {
        sizeMatched = exactSize;
      }
    }

    // Group by store, best match per store
    const byStore = {};
    for (const row of sizeMatched) {
      const existing = byStore[row.store_name];
      if (!existing || row.score > existing.score || (row.score === existing.score && row.price < existing.price)) {
        byStore[row.store_name] = row;
      }
    }

    return Object.values(byStore).map(r => ({
      store: r.store_name,
      price: `K${Number(r.price).toFixed(2)}`,
      note: r.product_name,
      onSpecial: r.is_special,
      source: "Weekly catalogue",
      fromDatabase: true,
    }));
  } catch (err) {
    console.error("DB lookup failed:", err.message);
    return [];
  }
}

export async function POST(req) {
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const { items, location, manualArea, suburb, city } = body;
  const sanitizedItems = sanitizeItems(items);
  if (sanitizedItems.length === 0) {
    return NextResponse.json({ error: "No valid items provided" }, { status: 400 });
  }

  const area = manualArea || suburb || city || "Lusaka, Zambia";
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });

  // 1. Check database for catalogue prices
  const liveData = {};
  let liveHits = 0;

  await Promise.all(sanitizedItems.map(async (item) => {
    const prices = await lookupPrices(item);
    if (prices.length > 0) {
      liveData[item] = prices;
      liveHits++;
    }
  }));

  console.log(`DB hits: ${liveHits}/${sanitizedItems.length}`);

  // 2. Fill gaps with Claude AI (Zambian prices)
  const itemsNeedingAI = sanitizedItems.filter(item => !liveData[item] || liveData[item].length < 3);
  const aiEstimates = {};

  if (itemsNeedingAI.length > 0) {
    try {
      const prompt = `You are a Zambian grocery price expert. Provide realistic current 2025 Zambian Kwacha (K) prices for these items at Zambian supermarkets.

Location: ${area}

Items:
${itemsNeedingAI.map((item, i) => `${i + 1}. ${item}`).join("\n")}

Stores to include: Shoprite, Pick n Pay, Spar, Choppies, Game

For each item, include the specific product name and realistic Kwacha price.
Note: Zambian prices are typically 8-15x South African Rand prices due to exchange rate.
Example: Bread ~K35-50, Mealie meal 5kg ~K150-200, Eggs 30s ~K180-250, Chicken pieces 2kg ~K250-350

CRITICAL: The "item" field must exactly match the item name from the list above.

Output ONLY valid JSON:
{"estimates":[{"item":"mealie meal 5kg","prices":[{"store":"Shoprite","price":165,"note":"Roller Meal 5kg","onSpecial":false,"source":"Est. price"},{"store":"Pick n Pay","price":175,"note":"Maize Meal 5kg","onSpecial":false,"source":"Est. price"},{"store":"Spar","price":180,"note":"Mealie Meal 5kg","onSpecial":false,"source":"Est. price"},{"store":"Choppies","price":155,"note":"Unga Meal 5kg","onSpecial":false,"source":"Est. price"}]}]}`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 4000,
          system: "You are a Zambian grocery price expert. Output ONLY valid JSON. Plain ASCII only.",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
        const fb = text.indexOf("{"); const lb = text.lastIndexOf("}");
        if (fb !== -1) {
          const parsed = JSON.parse(text.slice(fb, lb + 1));
          (parsed.estimates || []).forEach(e => {
            const prices = (e.prices || []).map(p => ({
              ...p,
              price: `K${Number(p.price).toFixed(2)}`,
            }));
            aiEstimates[e.item] = prices;
          });
        }
      }
    } catch (err) {
      console.error("AI fallback failed:", err);
    }
  }

  // 3. Merge results
  function fuzzyMatch(itemName) {
    if (aiEstimates[itemName]) return aiEstimates[itemName];
    const search = itemName.toLowerCase();
    for (const [key, val] of Object.entries(aiEstimates)) {
      const k = key.toLowerCase();
      if (k.includes(search) || search.includes(k) ||
        search.split(" ").some(w => w.length > 3 && k.includes(w))) {
        return val;
      }
    }
    return [];
  }

  const results = sanitizedItems.map(item => {
    const dbPrices = liveData[item] || [];
    const aiPrices = fuzzyMatch(item);
    const dbStores = new Set(dbPrices.map(p => p.store));
    const combined = [
      ...dbPrices,
      ...aiPrices.filter(p => !dbStores.has(p.store)),
    ].sort((a, b) => {
      const pa = parseFloat(String(a.price).replace("K", "")) || 9999;
      const pb = parseFloat(String(b.price).replace("K", "")) || 9999;
      return pa - pb;
    });

    const cheapest = combined[0] || null;
    return {
      name: item,
      offers: combined,
      bestStore: cheapest?.store || null,
      bestPrice: cheapest?.price || null,
      fromLiveCatalogue: dbPrices.length > 0,
    };
  });

  // 4. Build shopping plan with Claude
  let optimalPlan = null;
  let tip = null;
  let specialsFound = results.reduce((count, r) => count + (r.offers.some(o => o.onSpecial) ? 1 : 0), 0);

  try {
    const planRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 2000,
        system: "Output ONLY valid JSON. Plain ASCII only.",
        messages: [{
          role: "user",
          content: `Build optimal shopping plan for Zambian shopper in ${area}.

Items and prices:
${results.map(r => `- ${r.name}: cheapest at ${r.bestStore} for ${r.bestPrice}`).join("\n")}

Output ONLY valid JSON:
{"optimalPlan":[{"store":"Shoprite","branch":"Shoprite ${area.split(",")[0]}","items":["item1"],"subtotal":165,"reason":"cheapest on most items"}],"totalOptimal":165,"totalIfOneStore":200,"savings":35,"specialsFound":2,"tip":"helpful tip for Zambian shopper"}`,
        }],
      }),
    });

    if (planRes.ok) {
      const planData = await planRes.json();
      const planText = (planData.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      const fb = planText.indexOf("{"); const lb = planText.lastIndexOf("}");
      if (fb !== -1) {
        const plan = JSON.parse(planText.slice(fb, lb + 1));
        optimalPlan = plan.optimalPlan;
        tip = plan.tip;
      }
    }
  } catch (err) {
    console.error("Plan failed:", err);
  }

  const allPrices = results.flatMap(r => r.offers.map(o => parseFloat(String(o.price).replace("K", "")) || 0));
  const totalOptimal = results.reduce((s, r) => {
    const p = parseFloat(String(r.bestPrice || "0").replace("K", "")) || 0;
    return s + p;
  }, 0);

  return NextResponse.json({
    results,
    optimalPlan,
    totalOptimal,
    specialsFound,
    tip,
    meta: {
      liveHits,
      totalItems: sanitizedItems.length,
      dataSource: liveHits > 0 ? "catalogue" : "ai-estimates",
      currency: "ZMW",
      country: "Zambia",
    },
  });
}