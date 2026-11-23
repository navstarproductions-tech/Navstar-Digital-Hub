CREATE TABLE IF NOT EXISTS admin_sms_delivery_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_phone TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent','failed')),
  provider_message_id TEXT,
  provider_response TEXT NOT NULL DEFAULT '',
  sent_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_sms_delivery_created ON admin_sms_delivery_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_sms_delivery_user ON admin_sms_delivery_logs(user_id,created_at DESC);
