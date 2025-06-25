
CREATE TABLE IF NOT EXISTS owner_rewards (
  owner TEXT NOT NULL PRIMARY KEY,
  amount INTEGER NOT NULL,
  rewards_calculated_at DATETIME NOT NULL,
  CONSTRAINT check_positive_amount CHECK (amount >= 0)
);