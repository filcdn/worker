
CREATE TABLE IF NOT EXISTS sp_rewards (
  owner TEXT NOT NULL PRIMARY KEY,
  proof_set TEXT NOT NULL,
  amount INTEGER NOT NULL,
  rewards_calculated_at DATETIME NOT NULL,
  CONSTRAINT check_positive_amount CHECK (amount >= 0)
);