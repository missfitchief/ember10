ALTER TABLE intents ADD COLUMN retry_count integer NOT NULL DEFAULT 0 CHECK(retry_count >= 0);
ALTER TABLE intents ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE intents ADD COLUMN last_attempt_at timestamptz;
CREATE INDEX intent_retry_due ON intents(next_attempt_at, last_attempt_at, created_at) WHERE status IN ('planned','waiting_for_route');
CREATE TABLE execution_recoveries (
 request_id text PRIMARY KEY,
 intent_id text NOT NULL REFERENCES intents(id),
 signature text NOT NULL REFERENCES attempts(signature),
 actor text NOT NULL,
 reason text NOT NULL,
 evidence_reference text NOT NULL,
 before_status text NOT NULL,
 after_status text NOT NULL,
 observation jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER execution_recoveries_immutable BEFORE UPDATE OR DELETE ON execution_recoveries FOR EACH ROW EXECUTE FUNCTION immutable_record();
