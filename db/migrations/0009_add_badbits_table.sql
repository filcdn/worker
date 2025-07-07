-- Create table for storing bad bits
CREATE TABLE IF NOT EXISTS badbits (
  hash TEXT PRIMARY KEY,
  last_modified_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_badbits_last_modified_at ON badbits(last_modified_at);