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

let usersEnsured = false;
let alertsEnsured = false;
let listsEnsured = false;
let historyEnsured = false;

export async function ensureUsersTable(sql) {
  if (usersEnsured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      plan TEXT DEFAULT 'free',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  usersEnsured = true;
}

export async function ensurePriceAlertsTable(sql) {
  if (alertsEnsured) return;
  await ensureUsersTable(sql);
  await sql`
    CREATE TABLE IF NOT EXISTS price_alerts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      product_name TEXT NOT NULL,
      store_name TEXT,
      target_price DECIMAL(10,2) NOT NULL,
      triggered BOOLEAN DEFAULT false,
      last_checked TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_alerts_user ON price_alerts(user_id)`;
  alertsEnsured = true;
}

export async function ensureShoppingListsTable(sql) {
  if (listsEnsured) return;
  await ensureUsersTable(sql);
  await sql`
    CREATE TABLE IF NOT EXISTS shopping_lists (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      name TEXT DEFAULT 'My List',
      items JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  listsEnsured = true;
}

export async function ensurePriceHistoryTable(sql) {
  if (historyEnsured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS price_history (
      id SERIAL PRIMARY KEY,
      product_name TEXT NOT NULL,
      store_name TEXT NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      source TEXT,
      recorded_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_name, store_name)`;
  historyEnsured = true;
}

// Shared by alerts/create and lists/save — both key a user by email alone.
export async function upsertUserByEmail(sql, email) {
  const rows = await sql`
    INSERT INTO users (email)
    VALUES (${email})
    ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
    RETURNING id
  `;
  return rows[0].id;
}

export function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
