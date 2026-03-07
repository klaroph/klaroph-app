-- Idempotent: add income_source if missing. Safe to run multiple times.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'income_records') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'income_records' AND column_name = 'income_source'
    ) THEN
      ALTER TABLE income_records ADD COLUMN income_source text;
      COMMENT ON COLUMN income_records.income_source IS 'One of: Salary, Bonus / 13th Month, Freelance / Online Work, Business Income, Remittance / Support, Passive Income, Gift / Refund, Other';
    END IF;
  END IF;
END $$;

-- Reload PostgREST schema cache so the API sees income_source (fixes "Could not find the 'income_source' column in the schema cache")
NOTIFY pgrst, 'reload schema';
