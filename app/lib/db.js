// app/lib/db.js
// Shared Neon client + lazy schema setup for community price reports, so a
// fresh deploy works without a manual migration step (see
// scripts/sql/community_prices.sql for the documented schema this mirrors).

import { neon } from "@neondatabase/serverless";

let ensured = false;

export function getSql() {
  if (!process.env.DATABASE_URL) throw new Error("Missing DATABASE_URL");
  return neon(process.env.DATABASE_URL);
}

export async function ensureCommunityPricesTable(sql) {
  if (ensured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS community_prices (
      id SERIAL PRIMARY KEY,
      store_name TEXT NOT NULL,
      product_name TEXT NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      unit TEXT,
      location TEXT,
      submitted_by TEXT DEFAULT 'anonymous',
      verified BOOLEAN DEFAULT false,
      upvotes INTEGER DEFAULT 0,
      downvotes INTEGER DEFAULT 0,
      source TEXT DEFAULT 'community',
      valid_from TIMESTAMPTZ DEFAULT NOW(),
      valid_until TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_community_prices_store ON community_prices(store_name)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_community_prices_product ON community_prices(product_name)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_community_prices_valid ON community_prices(valid_until)`;
  ensured = true;
}

export const ZAMBIA_STORES = ["Shoprite", "Choppies", "Pick n Pay", "Game", "Spar", "Woolworths"];
