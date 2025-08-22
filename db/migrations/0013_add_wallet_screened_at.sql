ALTER TABLE wallet_details
ADD COLUMN screened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT 0;

CREATE INDEX idx_wallet_details_screened_at ON wallet_details(screened_at);
