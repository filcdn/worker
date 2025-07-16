-- Create table for storing bad bits
CREATE TABLE IF NOT EXISTS bad_bits (
  hash TEXT PRIMARY KEY,
  last_modified_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bad_bits_last_modified_at ON bad_bits(last_modified_at);

CREATE TABLE IF NOT EXISTS bad_bits_history (
  timestamp TIMESTAMP NOT NULL PRIMARY KEY,
  etag STRING NOT NULL
);
