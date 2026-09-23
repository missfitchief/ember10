ALTER TABLE ledger_events ADD COLUMN transaction_id bigint NOT NULL DEFAULT txid_current();
CREATE FUNCTION protect_posting_append() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (SELECT transaction_id FROM ledger_events WHERE id=NEW.event_id)<>txid_current() THEN RAISE EXCEPTION 'cannot add postings to a historical event'; END IF; RETURN NEW; END $$;
CREATE TRIGGER posting_same_transaction BEFORE INSERT ON postings FOR EACH ROW EXECUTE FUNCTION protect_posting_append();
CREATE TRIGGER mode_immutable BEFORE UPDATE OR DELETE ON installation FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER entitlement_no_delete BEFORE DELETE ON entitlements FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER attempt_no_delete BEFORE DELETE ON attempts FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE FUNCTION protect_intent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (NEW.id,NEW.kind,NEW.epoch_id,NEW.asset,NEW.amount) IS DISTINCT FROM (OLD.id,OLD.kind,OLD.epoch_id,OLD.asset,OLD.amount) THEN RAISE EXCEPTION 'immutable intent identity'; END IF;
 IF NEW.expected IS DISTINCT FROM OLD.expected AND EXISTS(SELECT 1 FROM attempts WHERE intent_id=OLD.id AND status NOT IN ('failed','expired_verified')) THEN RAISE EXCEPTION 'immutable signed intent plan'; END IF; RETURN NEW; END $$;
CREATE TRIGGER intent_identity BEFORE UPDATE ON intents FOR EACH ROW EXECUTE FUNCTION protect_intent();
CREATE TABLE provider_health (provider text PRIMARY KEY, last_success timestamptz, last_failure timestamptz, status text NOT NULL);
