CREATE TABLE IF NOT EXISTS indexer_proof_sets (
  set_id TEXT PRIMARY KEY,
  owner TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS indexer_roots (
  root_id TEXT PRIMARY KEY,
  set_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS indexer_proof_set_rails (
  proof_set_id TEXT NOT NULL,
  rail_id TEXT NOT NULL,
  payer TEXT NOT NULL,
  payee TEXT NOT NULL,
  with_cdn BOOLEAN, -- Enforce once event contains this field
  PRIMARY KEY (proof_set_id, rail_id)
);
