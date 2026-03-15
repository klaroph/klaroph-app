-- Financial Health: single table for assets and liabilities (dashboard-native module).
-- Subtypes: assets — cash_on_hand, bank_account, mp2_savings, investment, real_estate, custom;
--           liabilities — credit_card, personal_loan, mortgage, other.

CREATE TABLE IF NOT EXISTS financial_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('asset', 'liability')),
  subtype text NOT NULL,
  institution_name text,
  custom_name text,
  amount numeric NOT NULL CHECK (amount >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for listing by user and type
CREATE INDEX IF NOT EXISTS idx_financial_accounts_user_type ON financial_accounts(user_id, type);

-- RLS
ALTER TABLE financial_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_accounts_select_own ON financial_accounts;
CREATE POLICY financial_accounts_select_own ON financial_accounts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS financial_accounts_insert_own ON financial_accounts;
CREATE POLICY financial_accounts_insert_own ON financial_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS financial_accounts_update_own ON financial_accounts;
CREATE POLICY financial_accounts_update_own ON financial_accounts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS financial_accounts_delete_own ON financial_accounts;
CREATE POLICY financial_accounts_delete_own ON financial_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- Migrate existing data from assets / liabilities if tables exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'assets') THEN
    INSERT INTO financial_accounts (user_id, type, subtype, custom_name, amount, created_at, updated_at)
    SELECT user_id, 'asset', 'custom', COALESCE(name, ''), COALESCE(amount, 0), NOW(), NOW()
    FROM assets;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'liabilities') THEN
    INSERT INTO financial_accounts (user_id, type, subtype, custom_name, amount, created_at, updated_at)
    SELECT user_id, 'liability', 'other', COALESCE(name, ''), COALESCE(amount, 0), NOW(), NOW()
    FROM liabilities;
  END IF;
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;
