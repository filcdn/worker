CREATE TABLE IF NOT EXISTS address_sanction_check (
  address TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('sanctioned', 'approved', 'pending'))
);