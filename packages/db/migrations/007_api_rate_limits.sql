CREATE TABLE api_rate_limits (
 client_key text PRIMARY KEY CHECK (length(client_key)=64),
 minute bigint NOT NULL,
 hits bigint NOT NULL CHECK (hits>0)
);
CREATE INDEX api_rate_limits_expiry ON api_rate_limits(minute);
