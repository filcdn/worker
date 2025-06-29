
CREATE TABLE IF NOT EXISTS provider_scores (
  address TEXT NOT NULL,
  proof_set_id TEXT NOT NULL,
  rsr INTEGER NOT NULL,
  calculated_at DATETIME NOT NULL,
  PRIMARY KEY (address, proof_set_id, calculated_at),
  CONSTRAINT check_positive_rsr CHECK (rsr >= 0)
);