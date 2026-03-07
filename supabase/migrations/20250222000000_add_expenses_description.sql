-- Run this in Supabase Dashboard → SQL Editor to add the optional description column.
-- After running, the Add expense form will persist description (optional free text).

ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN expenses.description IS 'Optional free-text description for the expense.';
