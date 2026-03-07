-- Ensure income_records has income_source column (for categorization)
-- Safe to run multiple times: ADD COLUMN IF NOT EXISTS

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'income_records') THEN
    ALTER TABLE income_records ADD COLUMN IF NOT EXISTS income_source text;
    COMMENT ON COLUMN income_records.income_source IS 'One of: Salary, Bonus / 13th Month, Freelance / Online Work, Business Income, Remittance / Support, Passive Income, Gift / Refund, Other';
  END IF;
END $$;
