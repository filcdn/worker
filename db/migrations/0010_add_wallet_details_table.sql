CREATE TABLE IF NOT EXISTS wallet_details (
  address TEXT PRIMARY KEY,
  is_sanctioned BOOLEAN
);

-- Backfill existing wallet addresses
INSERT OR IGNORE INTO wallet_details (address)
SELECT DISTINCT address
FROM (
  SELECT payer AS address
  FROM indexer_proof_set_rails
  WHERE with_cdn = true

  UNION

  SELECT payee AS address
  FROM indexer_proof_set_rails
  WHERE with_cdn = true
);
