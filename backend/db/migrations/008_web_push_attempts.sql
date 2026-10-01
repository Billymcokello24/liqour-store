-- 008: Push worker delivery semantics — retry until confirmed sent.
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS push_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS push_claimed_at timestamptz;
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS push_last_error text;
