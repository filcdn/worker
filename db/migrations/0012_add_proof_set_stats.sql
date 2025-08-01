CREATE TABLE IF NOT EXISTS proof_set_stats (
  set_id TEXT PRIMARY KEY,
  total_egress_bytes_used INTEGER NOT NULL DEFAULT 0
);
