import { getSql } from "../lib/db";
import NavBar from "../components/NavBar";
import { sectionStyle, headingStyle, bodyStyle } from "../components/GuideLayout";

export const metadata = {
  title: "Current Grocery Prices in Zambia 2026 — SmartTroli",
  description:
    "Live grocery prices from Zambian supermarkets — Shoprite, Choppies, Pick n Pay, Spar and Game — for common staples like mealie meal, cooking oil, rice and sugar, updated from real catalogue data.",
};

export const revalidate = 1800;

const TRACKED_ITEMS = [
  { label: "Mealie Meal", keyword: "mealie meal" },
  { label: "Rice", keyword: "rice" },
  { label: "Cooking Oil", keyword: "cooking oil" },
  { label: "Sugar", keyword: "sugar" },
  { label: "Bread", keyword: "bread" },
  { label: "Milk", keyword: "milk" },
  { label: "Eggs", keyword: "eggs" },
  { label: "Flour", keyword: "flour" },
  { label: "Salt", keyword: "salt" },
  { label: "Washing Powder", keyword: "washing powder" },
];

// Cheapest catalogued price per store for a keyword, restricted to Zambian
// catalogue sources the same way app/lib/prices.js and app/api/search do.
async function cheapestByStore(sql, keyword) {
  const pattern = `%${keyword}%`;
  const rows = await sql`
    SELECT DISTINCT ON (cp.store_name) cp.store_name, cp.product_name, cp.price
    FROM catalogue_prices cp
    JOIN catalogues c ON c.id = cp.catalogue_id
    WHERE cp.product_name ILIKE ${pattern}
      AND c.source_url LIKE 'github://catalogues/zambia/%'
    ORDER BY cp.store_name, cp.price ASC
  `;
  return rows
    .map((r) => ({ store: r.store_name, product: r.product_name, price: Number(r.price) }))
    .sort((a, b) => a.price - b.price);
}

async function getTrackedPrices() {
  if (!process.env.DATABASE_URL) return null;
  try {
    const sql = getSql();
    const results = await Promise.all(
      TRACKED_ITEMS.map(async (item) => ({
        ...item,
        offers: await cheapestByStore(sql, item.keyword),
      }))
    );
    return results.filter((r) => r.offers.length > 0);
  } catch (err) {
    console.error("zambia-grocery-prices DB lookup failed:", err.message);
    return null;
  }
}

export default async function ZambiaGroceryPricesPage() {
  const items = await getTrackedPrices();
  const updatedAt = new Date().toLocaleDateString("en-ZM", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0D1B0F",
        color: "#F5F0E8",
        fontFamily: "'Segoe UI', -apple-system, sans-serif",
      }}
    >
      <NavBar />

      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "32px 18px 60px" }}>
        <a
          href="/guides"
          style={{
            display: "inline-block",
            marginBottom: "18px",
            fontSize: "12.5px",
            fontWeight: 700,
            color: "rgba(245,240,232,0.5)",
            textDecoration: "none",
          }}
        >
          ← All Guides
        </a>

        <h1 style={{ fontSize: "clamp(26px, 6vw, 34px)", fontWeight: 900, letterSpacing: "-1px", marginBottom: "6px" }}>
          Current Grocery Prices in Zambia 2026
        </h1>
        <p style={{ fontSize: "14px", color: "rgba(245,240,232,0.55)", marginBottom: "10px", lineHeight: 1.5 }}>
          Real catalogue prices for common grocery staples across Shoprite, Choppies, Pick n Pay, Spar and Game,
          pulled directly from SmartTroli's price database.
        </p>
        <p style={{ fontSize: "12px", color: "rgba(245,240,232,0.4)", marginBottom: "28px" }}>
          Last checked: {updatedAt}
        </p>

        {items === null && (
          <div style={sectionStyle}>
            <p style={bodyStyle}>
              Live prices are temporarily unavailable. In the meantime, use the{" "}
              <a href="/" style={{ color: "#F97316", fontWeight: 700 }}>
                SmartTroli shopping list
              </a>{" "}
              to compare your own basket across stores.
            </p>
          </div>
        )}

        {items !== null && items.length === 0 && (
          <div style={sectionStyle}>
            <p style={bodyStyle}>
              We don't have enough catalogue data for these staples right now. Try the{" "}
              <a href="/" style={{ color: "#F97316", fontWeight: 700 }}>
                SmartTroli shopping list
              </a>{" "}
              to search live prices for any item.
            </p>
          </div>
        )}

        {items !== null &&
          items.map((item) => (
            <div key={item.keyword} style={sectionStyle}>
              <div style={headingStyle}>{item.label}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {item.offers.map((offer, i) => (
                  <div
                    key={`${offer.store}-${i}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: "10px",
                      padding: "6px 0",
                      borderBottom:
                        i < item.offers.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "13.5px", fontWeight: 700, color: i === 0 ? "#FFD700" : "#F5F0E8" }}>
                        {offer.store}
                        {i === 0 && (
                          <span style={{ marginLeft: "8px", fontSize: "10.5px", fontWeight: 800, color: "#F97316" }}>
                            CHEAPEST
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "12px", color: "rgba(245,240,232,0.5)" }}>{offer.product}</div>
                    </div>
                    <div style={{ fontSize: "16px", fontWeight: 800, whiteSpace: "nowrap" }}>
                      K{offer.price.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

        <div
          style={{
            ...sectionStyle,
            background: "rgba(249,115,22,0.08)",
            border: "1px solid rgba(249,115,22,0.25)",
          }}
        >
          <div style={headingStyle}>Want Your Own List Compared?</div>
          <p style={bodyStyle}>
            These are just the most common staples. Add your full shopping list on the{" "}
            <a href="/" style={{ color: "#FFD700", fontWeight: 700 }}>
              SmartTroli homepage
            </a>{" "}
            to see the cheapest store for every item you actually buy, plus which single store minimizes your total
            trip.
          </p>
        </div>

        <a
          href="/"
          style={{
            display: "inline-block",
            marginTop: "8px",
            fontSize: "13px",
            fontWeight: 700,
            color: "#F97316",
            textDecoration: "none",
          }}
        >
          ← Back to SmartTroli
        </a>
      </div>
    </div>
  );
}
