// app/lib/prices.js
// Shared "current best price for a product" lookup, used by price alerts and
// saved shopping lists. Tries progressively fuzzier matches and stops at the
// first stage that finds anything, since an alert's product_name (typed or
// picked by the user) and a catalogue/community row's product_name are
// often not identical strings even when they refer to the same item:
//   1. exact match (case-insensitive)
//   2. catalogue/community product_name contains the alert's product_name
//   3. the alert's product_name contains the catalogue/community product_name
//      (needed when the alert name is the more specific/longer string)

import { ensureCommunityPricesTable } from "./db";

async function queryStage(sql, mode, productName, storeName) {
  const pattern = `%${productName}%`;

  let catalogueRows;
  if (mode === "exact") {
    catalogueRows = storeName
      ? await sql`
          SELECT cp.store_name, cp.price
          FROM catalogue_prices cp
          JOIN catalogues c ON c.id = cp.catalogue_id
          WHERE LOWER(cp.product_name) = LOWER(${productName})
            AND cp.store_name = ${storeName}
            AND c.source_url LIKE 'github://catalogues/zambia/%'
          ORDER BY cp.price ASC
          LIMIT 5
        `
      : await sql`
          SELECT cp.store_name, cp.price
          FROM catalogue_prices cp
          JOIN catalogues c ON c.id = cp.catalogue_id
          WHERE LOWER(cp.product_name) = LOWER(${productName})
            AND c.source_url LIKE 'github://catalogues/zambia/%'
          ORDER BY cp.price ASC
          LIMIT 5
        `;
  } else if (mode === "contains") {
    catalogueRows = storeName
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
  } else {
    catalogueRows = storeName
      ? await sql`
          SELECT cp.store_name, cp.price
          FROM catalogue_prices cp
          JOIN catalogues c ON c.id = cp.catalogue_id
          WHERE LOWER(${productName}) LIKE '%' || LOWER(cp.product_name) || '%'
            AND cp.store_name = ${storeName}
            AND c.source_url LIKE 'github://catalogues/zambia/%'
          ORDER BY cp.price ASC
          LIMIT 5
        `
      : await sql`
          SELECT cp.store_name, cp.price
          FROM catalogue_prices cp
          JOIN catalogues c ON c.id = cp.catalogue_id
          WHERE LOWER(${productName}) LIKE '%' || LOWER(cp.product_name) || '%'
            AND c.source_url LIKE 'github://catalogues/zambia/%'
          ORDER BY cp.price ASC
          LIMIT 5
        `;
  }

  let communityRows;
  if (mode === "exact") {
    communityRows = storeName
      ? await sql`
          SELECT store_name, price FROM community_prices
          WHERE LOWER(product_name) = LOWER(${productName}) AND valid_until > NOW() AND store_name = ${storeName}
          ORDER BY price ASC LIMIT 5
        `
      : await sql`
          SELECT store_name, price FROM community_prices
          WHERE LOWER(product_name) = LOWER(${productName}) AND valid_until > NOW()
          ORDER BY price ASC LIMIT 5
        `;
  } else if (mode === "contains") {
    communityRows = storeName
      ? await sql`
          SELECT store_name, price FROM community_prices
          WHERE product_name ILIKE ${pattern} AND valid_until > NOW() AND store_name = ${storeName}
          ORDER BY price ASC LIMIT 5
        `
      : await sql`
          SELECT store_name, price FROM community_prices
          WHERE product_name ILIKE ${pattern} AND valid_until > NOW()
          ORDER BY price ASC LIMIT 5
        `;
  } else {
    communityRows = storeName
      ? await sql`
          SELECT store_name, price FROM community_prices
          WHERE LOWER(${productName}) LIKE '%' || LOWER(product_name) || '%' AND valid_until > NOW() AND store_name = ${storeName}
          ORDER BY price ASC LIMIT 5
        `
      : await sql`
          SELECT store_name, price FROM community_prices
          WHERE LOWER(${productName}) LIKE '%' || LOWER(product_name) || '%' AND valid_until > NOW()
          ORDER BY price ASC LIMIT 5
        `;
  }

  return [...catalogueRows, ...communityRows]
    .map((r) => ({ store: r.store_name, price: Number(r.price) }))
    .sort((a, b) => a.price - b.price);
}

export async function getBestPrice(sql, productName, storeName) {
  await ensureCommunityPricesTable(sql);

  for (const mode of ["exact", "contains", "reverseContains"]) {
    const matches = await queryStage(sql, mode, productName, storeName);
    if (matches.length > 0) return matches[0];
  }

  return null;
}
