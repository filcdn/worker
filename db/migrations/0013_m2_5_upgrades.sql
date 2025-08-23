DROP TABLE provider_urls;
DROP TABLE indexer_proof_set_rails;
DROP TABLE indexer_proof_sets;
DROP TABLE indexer_roots;
DROP TABLE proof_set_stats;
DROP TABLE retrieval_logs;

CREATE TABLE providers (
  id TEXT NOT NULL,
  beneficiary TEXT NOT NULL,
  service_url TEXT,
  PRIMARY KEY (id)
);

CREATE TABLE data_sets (
  id TEXT NOT NULL,
  storage_provider TEXT,
  payer TEXT,
  payee TEXT,
  with_cdn BOOLEAN,
  total_egress_bytes_used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
);

CREATE TABLE pieces (
  id TEXT NOT NULL,
  data_set_id TEXT NOT NULL,
  cid TEXT NOT NULL,
  PRIMARY KEY (id, data_set_id)
);
CREATE INDEX IF NOT EXISTS pieces_cid ON pieces(cid);

CREATE TABLE retrieval_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME NOT NULL,
  data_set_id TEXT,
  storage_provider TEXT,
  client_address TEXT NOT NULL,
  response_status INTEGER,
  egress_bytes INTEGER,
  cache_miss BOOLEAN,
  fetch_ttfb INTEGER,
  worker_ttfb INTEGER,
  request_country_code TEXT,
  fetch_ttlb INTEGER
);
