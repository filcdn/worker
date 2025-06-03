CREATE TABLE IF NOT EXISTS indexer_proof_sets (
  set_id TEXT PRIMARY KEY,
  owner TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS indexer_roots (
  root_id TEXT PRIMARY KEY,
  set_id TEXT NOT NULL
);