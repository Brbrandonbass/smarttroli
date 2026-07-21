-- Community-submitted price reports. Also created lazily at runtime by
-- app/lib/db.js (ensureCommunityPricesTable) so a fresh deploy works without
-- this needing to be run by hand first — this file documents the schema.

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
);

CREATE INDEX IF NOT EXISTS idx_community_prices_store ON community_prices(store_name);
CREATE INDEX IF NOT EXISTS idx_community_prices_product ON community_prices(product_name);
CREATE INDEX IF NOT EXISTS idx_community_prices_valid ON community_prices(valid_until);
