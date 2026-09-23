-- Developer payments consume only the remainder of existing OPS/DEV allocations.
-- Payable approval is an append-only obligation, not a fabricated SOL asset balance.
CREATE TABLE operating_expenses (
 id text PRIMARY KEY,
 event_id text NOT NULL UNIQUE REFERENCES ledger_events(id),
 amount numeric(78,0) NOT NULL CHECK(amount>0),
 cost_allowance numeric(78,0) NOT NULL DEFAULT 0 CHECK(cost_allowance>=0),
 payee text NOT NULL,
 description text NOT NULL,
 evidence_hash text NOT NULL,
 actor text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE operating_expense_payments (
 id text PRIMARY KEY,
 event_id text NOT NULL UNIQUE REFERENCES ledger_events(id),
 expense_id text NOT NULL REFERENCES operating_expenses(id),
 amount numeric(78,0) NOT NULL CHECK(amount>0),
 fee numeric(78,0) NOT NULL CHECK(fee>=0),
 signature text NOT NULL,
 instruction text NOT NULL,
 slot bigint NOT NULL CHECK(slot>0),
 source text NOT NULL,
 destination text NOT NULL,
 evidence_hash text NOT NULL,
 actor text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(signature,instruction)
);
CREATE TABLE developer_payout_days (
 utc_day date PRIMARY KEY,
 intent_id text NOT NULL UNIQUE REFERENCES intents(id),
 policy_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER operating_expenses_immutable BEFORE UPDATE OR DELETE ON operating_expenses FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER operating_expense_payments_immutable BEFORE UPDATE OR DELETE ON operating_expense_payments FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER developer_payout_days_immutable BEFORE UPDATE OR DELETE ON developer_payout_days FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE INDEX operating_expense_payments_expense ON operating_expense_payments(expense_id);
CREATE INDEX developer_payout_intents ON intents(status) WHERE kind='operations' AND expected->>'purpose'='developer_payout';
