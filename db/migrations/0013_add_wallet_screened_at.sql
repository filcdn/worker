ALTER TABLE wallet_details
ADD COLUMN last_screened_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX idx_wallet_details_last_screened_at ON wallet_details(last_screened_at);
