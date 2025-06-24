CREATE TABLE IF NOT EXISTS owner_urls (
  owner TEXT NOT NULL,
  url TEXT NOT NULL,
  PRIMARY KEY (owner),
  CONSTRAINT unique_owner_url UNIQUE (owner, url)
);