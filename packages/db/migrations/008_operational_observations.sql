-- Operational polling is replaceable. Funded policy/basket/snapshot documents remain immutable.
CREATE TABLE operational_observations (
 type text PRIMARY KEY CHECK(type IN ('observed_market','eligible_selection','worker_readiness')),
 id text NOT NULL,
 body jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE VIEW current_observation_records AS
 SELECT id,body,created_at,'observation'::text AS kind FROM operational_observations
 UNION ALL
 SELECT id,body,created_at,kind FROM documents d WHERE kind='observation'
 AND NOT EXISTS(SELECT 1 FROM operational_observations o WHERE o.type=d.body->>'type');
