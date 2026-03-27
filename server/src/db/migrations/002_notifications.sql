-- Notification log: tracks sent notifications to prevent duplicates
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,          -- 'budget_alert', 'bill_reminder', 'weekly_digest'
  reference_id INTEGER,                -- budget_id, recurring_pattern_id, etc.
  reference_key VARCHAR(50),           -- dedup key e.g. '2026-03' for monthly budget
  subject VARCHAR(255) NOT NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, type, reference_id, reference_key)
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_sent ON notifications(sent_at);
