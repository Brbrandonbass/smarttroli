-- Run on Neon PostgreSQL for agent pipeline chunk tracking and monitor logging

CREATE TABLE IF NOT EXISTS extraction_chunks (
  id SERIAL PRIMARY KEY,
  catalogue_id INTEGER NOT NULL REFERENCES catalogues(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  start_page INTEGER NOT NULL,
  end_page INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  product_count INTEGER DEFAULT 0,
  retries INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(catalogue_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_extraction_chunks_catalogue
  ON extraction_chunks(catalogue_id);

CREATE INDEX IF NOT EXISTS idx_extraction_chunks_status
  ON extraction_chunks(status);

CREATE TABLE IF NOT EXISTS monitor_log (
  id SERIAL PRIMARY KEY,
  store_name VARCHAR(100) NOT NULL,
  url_checked TEXT NOT NULL,
  result VARCHAR(50) NOT NULL,
  detail TEXT,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monitor_log_store_checked
  ON monitor_log(store_name, checked_at DESC);
