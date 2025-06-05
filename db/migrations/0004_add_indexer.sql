-- NOTE:
-- PDPVerifier and Pandora Service contracts use uint256 as ID type
-- SQLite does not support big integer data types like uint256
-- We are storing the IDs as TEXT using the "natural" base10 encoding
-- E.g. the value 0x0...01 is stored as "1"

CREATE TABLE IF NOT EXISTS indexer_proof_sets (
  set_id TEXT PRIMARY KEY,
  owner TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS indexer_roots (
  root_id TEXT NOT NULL,
  set_id TEXT NOT NULL,
  PRIMARY KEY (root_id, set_id)
);

CREATE TABLE IF NOT EXISTS indexer_proof_set_rails (
  proof_set_id TEXT NOT NULL,
  rail_id TEXT NOT NULL,
  payer TEXT NOT NULL,
  payee TEXT NOT NULL,
  with_cdn BOOLEAN, -- Enforce once event contains this field
  PRIMARY KEY (proof_set_id, rail_id)
);