-- Migration number: 0001 	 2025-05-23T08:31:24.810Z
CREATE TABLE retrieval_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  hostname TEXT NOT NULL,
  piece_cid TEXT NOT NULL,
  response_status,
  error_reason TEXT,
  egress_bytes INTEGER NOT NULL
);