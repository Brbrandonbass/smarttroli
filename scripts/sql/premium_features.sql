-- Price alerts, saved shopping lists, and price history. Also created lazily
-- at runtime by app/lib/db.js (ensureUsersTable, ensurePriceAlertsTable,
-- ensureShoppingListsTable, ensurePriceHistoryTable) so a fresh deploy works
-- without this needing to be run by hand first — this file documents the schema.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  plan TEXT DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alerts are recurring: price_alerts/check resets triggered back to false
-- and stamps last_triggered instead of leaving triggered permanently true, so
-- the same alert fires again on its own once 24h have passed and the price
-- is still at or below target.
CREATE TABLE IF NOT EXISTS price_alerts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  product_name TEXT NOT NULL,
  store_name TEXT,
  target_price DECIMAL(10,2) NOT NULL,
  triggered BOOLEAN DEFAULT false,
  last_checked TIMESTAMPTZ,
  last_triggered TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Was added to price_alerts after it already existed in production —
-- ADD COLUMN IF NOT EXISTS so this line is safe to run again.
ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS last_triggered TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS shopping_lists (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  name TEXT DEFAULT 'My List',
  items JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_history (
  id SERIAL PRIMARY KEY,
  product_name TEXT NOT NULL,
  store_name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  source TEXT,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_name, store_name);
CREATE INDEX IF NOT EXISTS idx_alerts_user ON price_alerts(user_id);
