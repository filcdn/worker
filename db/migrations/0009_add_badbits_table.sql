-- Add status column to indexer_roots table
ALTER TABLE indexer_roots ADD COLUMN status TEXT DEFAULT 'unchecked' CHECK (status IN ('unchecked', 'blocked', 'allowed'));

-- Create table for storing bad bits
CREATE TABLE IF NOT EXISTS badbits (
  hash TEXT PRIMARY KEY,
  hash_type TEXT NOT NULL,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP
);