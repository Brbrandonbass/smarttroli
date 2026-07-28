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

CREATE TABLE IF NOT EXISTS price_alerts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  product_name TEXT NOT NULL,
  store_name TEXT,
  target_price DECIMAL(10,2) NOT NULL,
  triggered BOOLEAN DEFAULT false,
  last_checked TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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
