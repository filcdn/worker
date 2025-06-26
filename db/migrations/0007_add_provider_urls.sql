CREATE TABLE IF NOT EXISTS provider_urls (
  address TEXT NOT NULL,
  piece_retrieval_url TEXT NOT NULL,
  PRIMARY KEY (address)
);