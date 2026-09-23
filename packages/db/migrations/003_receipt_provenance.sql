CREATE TABLE funding_receipt_uses (
 id text PRIMARY KEY,
 epoch_id text NOT NULL REFERENCES epochs(id),
 receipt_id text NOT NULL REFERENCES incoming_transfers(id),
 amount numeric(78,0) NOT NULL CHECK(amount<>0),
 kind text NOT NULL CHECK(kind IN ('commitment','cost_refund')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER receipt_uses_immutable BEFORE UPDATE OR DELETE ON funding_receipt_uses FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE FUNCTION funding_receipt_conserved() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (SELECT coalesce(sum(amount),0) FROM funding_receipt_uses WHERE receipt_id=NEW.receipt_id) > (SELECT amount FROM incoming_transfers WHERE id=NEW.receipt_id AND classification='creator_fee') OR (SELECT coalesce(sum(amount),0) FROM funding_receipt_uses WHERE receipt_id=NEW.receipt_id)<0 THEN RAISE EXCEPTION 'receipt funding overallocated'; END IF; RETURN NULL; END $$;
CREATE CONSTRAINT TRIGGER receipt_conservation AFTER INSERT ON funding_receipt_uses DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION funding_receipt_conserved();
-- Existing synthetic single-source demo records can be linked without inventing attribution.
INSERT INTO funding_receipt_uses(id,epoch_id,receipt_id,amount,kind)
 SELECT 'commit:'||e.id||':'||(e.funding->'receiptIds'->>0),e.id,e.funding->'receiptIds'->>0,(e.funding->>'total')::numeric,'commitment'
 FROM epochs e WHERE (SELECT mode FROM installation)='demo' AND jsonb_array_length(e.funding->'receiptIds')=1;
