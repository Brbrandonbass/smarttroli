// app/lib/prices.js
// Shared "current best price for a product" lookup, used by price alerts and
// saved shopping lists. Mirrors the catalogue/community merge in
// app/api/search/route.js's lookupPrices, but scoped to a single known
// product name (no fuzzy keyword scoring needed since the caller already
// knows the exact product string).

import { ensureCommunityPricesTable } from "./db";

export async function getBestPrice(sql, productName, storeName) {
  await ensureCommunityPricesTable(sql);
  const pattern = `%${productName}%`;

  const catalogueRows = storeName
    ? await sql`
        SELECT cp.store_name, cp.price
        FROM catalogue_prices cp
        JOIN catalogues c ON c.id = cp.catalogue_id
        WHERE cp.product_name ILIKE ${pattern}
          AND cp.store_name = ${storeName}
          AND c.source_url LIKE 'github://catalogues/zambia/%'
        ORDER BY cp.price ASC
        LIMIT 5
      `
    : await sql`
        SELECT cp.store_name, cp.price
        FROM catalogue_prices cp
        JOIN catalogues c ON c.id = cp.catalogue_id
        WHERE cp.product_name ILIKE ${pattern}
          AND c.source_url LIKE 'github://catalogues/zambia/%'
        ORDER BY cp.price ASC
        LIMIT 5
      `;

  const communityRows = storeName
    ? await sql`
        SELECT store_name, price
        FROM community_prices
        WHERE product_name ILIKE ${pattern} AND valid_until > NOW() AND store_name = ${storeName}
        ORDER BY price ASC
        LIMIT 5
      `
    : await sql`
        SELECT store_name, price
        FROM community_prices
        WHERE product_name ILIKE ${pattern} AND valid_until > NOW()
        ORDER BY price ASC
        LIMIT 5
      `;

  const combined = [...catalogueRows, ...communityRows]
    .map((r) => ({ store: r.store_name, price: Number(r.price) }))
    .sort((a, b) => a.price - b.price);

  return combined[0] || null;
}
