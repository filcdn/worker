-- Migration number: 0001 	 2025-05-23T08:31:24.810Z
CREATE TABLE retrieval_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  hostname TEXT NOT NULL,
  piece_cid TEXT NOT NULL,
  proof_set_id INTEGER NOT NULL,
  response_status INTEGER NOT NULL,
  egress_bytes INTEGER,
  cache_miss BOOLEAN NOT NULL
);