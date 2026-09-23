CREATE TABLE IF NOT EXISTS migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE installation (id boolean PRIMARY KEY DEFAULT true CHECK(id), mode text NOT NULL CHECK(mode IN ('prelaunch','demo','test','live')));
CREATE TABLE control (id boolean PRIMARY KEY DEFAULT true CHECK(id), paused boolean NOT NULL DEFAULT true, reason text NOT NULL DEFAULT 'Prelaunch configuration required');
INSERT INTO control DEFAULT VALUES;
CREATE TABLE assets (mint text PRIMARY KEY, symbol text NOT NULL, decimals smallint NOT NULL CHECK(decimals BETWEEN 0 AND 18), program text NOT NULL);
CREATE TABLE documents (id text PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('policy','basket','snapshot','observation','provenance','approval','reconciliation')), hash text NOT NULL, body jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(kind,hash));
CREATE TABLE incoming_transfers (id text PRIMARY KEY, signature text NOT NULL, instruction text NOT NULL, asset text NOT NULL, amount numeric(78,0) NOT NULL CHECK(amount>0), destination text NOT NULL, classification text NOT NULL, evidence jsonb NOT NULL, UNIQUE(signature,instruction,asset,destination));
CREATE TABLE cursors (name text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE epochs (id text PRIMARY KEY, policy_id text NOT NULL REFERENCES documents(id), basket_id text NOT NULL REFERENCES documents(id), snapshot_id text NOT NULL REFERENCES documents(id), status text NOT NULL, reason text, funding jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE intents (id text PRIMARY KEY, epoch_id text REFERENCES epochs(id), kind text NOT NULL CHECK(kind IN ('swap','payout','buyback','burn','operations')), asset text NOT NULL, amount numeric(78,0) NOT NULL CHECK(amount>=0), status text NOT NULL DEFAULT 'planned', expected jsonb NOT NULL, result jsonb, reason text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE attempts (id bigserial PRIMARY KEY, intent_id text NOT NULL REFERENCES intents(id), attempt_no integer NOT NULL, signature text NOT NULL UNIQUE, signed_payload bytea NOT NULL, blockhash text NOT NULL, last_valid_height bigint NOT NULL, approved_message_hash text NOT NULL, status text NOT NULL DEFAULT 'signed', evidence jsonb, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(intent_id,attempt_no));
CREATE UNIQUE INDEX one_live_attempt ON attempts(intent_id) WHERE status IN ('signed','submitted','unknown','confirmed','needs_review');
CREATE TABLE entitlements (id text PRIMARY KEY, epoch_id text NOT NULL REFERENCES epochs(id), asset text NOT NULL, owner text NOT NULL, amount numeric(78,0) NOT NULL CHECK(amount>0), paid numeric(78,0) NOT NULL DEFAULT 0 CHECK(paid>=0 AND paid<=amount), UNIQUE(epoch_id,asset,owner));
CREATE TABLE payout_batches (id text PRIMARY KEY REFERENCES intents(id), asset text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE batch_items (batch_id text NOT NULL REFERENCES payout_batches(id), entitlement_id text NOT NULL REFERENCES entitlements(id), amount numeric(78,0) NOT NULL CHECK(amount>0), instruction_index integer NOT NULL, active boolean NOT NULL DEFAULT true, PRIMARY KEY(batch_id,entitlement_id));
CREATE UNIQUE INDEX entitlement_in_one_active_batch ON batch_items(entitlement_id) WHERE active;
CREATE TABLE ledger_events (id text PRIMARY KEY, kind text NOT NULL, epoch_id text REFERENCES epochs(id), evidence jsonb NOT NULL, reversal_of text REFERENCES ledger_events(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE postings (event_id text NOT NULL REFERENCES ledger_events(id), line integer NOT NULL, asset text NOT NULL, account text NOT NULL, amount numeric(78,0) NOT NULL CHECK(amount<>0), PRIMARY KEY(event_id,line));
CREATE INDEX postings_account ON postings(asset,account);
CREATE TABLE leases (name text PRIMARY KEY, owner text NOT NULL, fence bigint NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE jobs (id text PRIMARY KEY, kind text NOT NULL, body jsonb NOT NULL, available_at timestamptz NOT NULL DEFAULT now(), state text NOT NULL DEFAULT 'ready', attempts integer NOT NULL DEFAULT 0, leased_by text, lease_until timestamptz);
CREATE TABLE incidents (id bigserial PRIMARY KEY, kind text NOT NULL, details jsonb NOT NULL, resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE operator_audit (id bigserial PRIMARY KEY, actor text NOT NULL, action text NOT NULL, body jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE chain_receipts (signature text PRIMARY KEY, slot bigint NOT NULL, intent_id text NOT NULL REFERENCES intents(id), evidence jsonb NOT NULL);
CREATE FUNCTION immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'append-only record'; END $$;
CREATE TRIGGER documents_immutable BEFORE UPDATE OR DELETE ON documents FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER ledger_immutable BEFORE UPDATE OR DELETE ON ledger_events FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER postings_immutable BEFORE UPDATE OR DELETE ON postings FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER incoming_immutable BEFORE UPDATE OR DELETE ON incoming_transfers FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER receipts_immutable BEFORE UPDATE OR DELETE ON chain_receipts FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON operator_audit FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE FUNCTION protect_epoch_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (NEW.policy_id,NEW.basket_id,NEW.snapshot_id,NEW.funding) IS DISTINCT FROM (OLD.policy_id,OLD.basket_id,OLD.snapshot_id,OLD.funding) THEN RAISE EXCEPTION 'immutable epoch identity'; END IF; RETURN NEW; END $$;
CREATE TRIGGER epoch_identity BEFORE UPDATE ON epochs FOR EACH ROW EXECUTE FUNCTION protect_epoch_identity();
CREATE FUNCTION balanced_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT asset FROM postings WHERE event_id=NEW.event_id GROUP BY asset HAVING sum(amount)<>0) THEN RAISE EXCEPTION 'unbalanced ledger event'; END IF; RETURN NULL; END $$;
CREATE CONSTRAINT TRIGGER balance_check AFTER INSERT ON postings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION balanced_event();
CREATE FUNCTION protect_entitlement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (NEW.id,NEW.epoch_id,NEW.asset,NEW.owner,NEW.amount) IS DISTINCT FROM (OLD.id,OLD.epoch_id,OLD.asset,OLD.owner,OLD.amount) THEN RAISE EXCEPTION 'immutable entitlement'; END IF; RETURN NEW; END $$;
CREATE TRIGGER entitlement_identity BEFORE UPDATE ON entitlements FOR EACH ROW EXECUTE FUNCTION protect_entitlement();
CREATE FUNCTION protect_attempt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (NEW.signature,NEW.signed_payload,NEW.blockhash,NEW.last_valid_height,NEW.approved_message_hash,NEW.intent_id) IS DISTINCT FROM (OLD.signature,OLD.signed_payload,OLD.blockhash,OLD.last_valid_height,OLD.approved_message_hash,OLD.intent_id) THEN RAISE EXCEPTION 'immutable signed attempt'; END IF; RETURN NEW; END $$;
CREATE TRIGGER attempt_identity BEFORE UPDATE ON attempts FOR EACH ROW EXECUTE FUNCTION protect_attempt();
