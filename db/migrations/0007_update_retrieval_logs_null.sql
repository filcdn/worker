ALTER TABLE retrieval_logs RENAME TO retrieval_logs_old;
CREATE TABLE retrieval_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME NOT NULL,
  owner_address TEXT, -- DROP NOT NULL constraint
  client_address TEXT NOT NULL,
  response_status INTEGER, -- DROP NOT NULL constraint
  egress_bytes INTEGER,
  cache_miss BOOLEAN, -- DROP NOT NULL constraint
  fetch_ttfb INTEGER,
  worker_ttfb INTEGER,
  request_country_code TEXT,
  fetch_ttlb INTEGER
);
INSERT INTO retrieval_logs SELECT * from retrieval_logs_old;
DROP TABLE retrieval_logs_old;
