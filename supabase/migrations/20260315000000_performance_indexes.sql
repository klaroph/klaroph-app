-- KlaroPH short-term performance: indexes for high-traffic filters (audit report).
-- Safe: IF NOT EXISTS prevents duplicate index creation.

-- Expenses: list/chart/budget queries filter by user_id and date range.
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date);

-- Income records: list/chart queries filter by user_id and date range.
CREATE INDEX IF NOT EXISTS idx_income_records_user_date ON income_records(user_id, date);

-- Subscriptions: active-subscription lookup by user_id, ordered by current_period_end DESC.
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_period ON subscriptions(user_id, current_period_end DESC);

COMMENT ON INDEX idx_expenses_user_date IS 'Supports date-range and list queries per user.';
COMMENT ON INDEX idx_income_records_user_date IS 'Supports date-range and list queries per user.';
COMMENT ON INDEX idx_subscriptions_user_period IS 'Supports resolveSubscriptionState / get_user_features active-period lookup.';
