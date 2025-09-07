-- Migration number: 0014 	 2025-01-27T00:00:00.000Z
CREATE TABLE IF NOT EXISTS provider_rsr_scores (
  provider_address TEXT NOT NULL,
  score REAL NOT NULL,
  calculated_at DATETIME NOT NULL,
  calculation_period_start DATETIME NOT NULL,
  calculation_period_end DATETIME NOT NULL,
  total_requests INTEGER NOT NULL DEFAULT 0,
  successful_requests INTEGER NOT NULL DEFAULT 0,
  avg_response_time_ms REAL,
  avg_ttfb_ms REAL,
  avg_ttlb_ms REAL,
  reliability_score REAL,
  performance_score REAL,
  PRIMARY KEY (provider_address, calculated_at)
);

-- Index for efficient querying by provider and time range
CREATE INDEX IF NOT EXISTS idx_provider_rsr_scores_provider_time 
ON provider_rsr_scores (provider_address, calculated_at DESC);

-- Index for querying latest scores for all providers
CREATE INDEX IF NOT EXISTS idx_provider_rsr_scores_latest 
ON provider_rsr_scores (calculated_at DESC, provider_address);

