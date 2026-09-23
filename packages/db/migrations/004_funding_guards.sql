ALTER TABLE funding_receipt_uses ADD CONSTRAINT funding_use_sign
 CHECK ((kind='commitment' AND amount>0) OR (kind='cost_refund' AND amount<0));
CREATE OR REPLACE FUNCTION funding_receipt_conserved() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_amount numeric; source_class text; source_asset text; used numeric; epoch_used numeric;
BEGIN
 SELECT amount,classification,asset INTO source_amount,source_class,source_asset
 FROM incoming_transfers WHERE id=NEW.receipt_id FOR UPDATE;
 IF source_class IS DISTINCT FROM 'creator_fee' OR source_asset IS DISTINCT FROM 'SOL'
 THEN RAISE EXCEPTION 'only recognized creator receipts can fund epochs'; END IF;
 SELECT coalesce(sum(amount),0) INTO used FROM funding_receipt_uses WHERE receipt_id=NEW.receipt_id;
 SELECT coalesce(sum(amount),0) INTO epoch_used FROM funding_receipt_uses WHERE receipt_id=NEW.receipt_id AND epoch_id=NEW.epoch_id;
 IF used>source_amount OR used<0 OR epoch_used<0 THEN RAISE EXCEPTION 'receipt funding overallocated'; END IF;
 RETURN NULL;
END $$;
