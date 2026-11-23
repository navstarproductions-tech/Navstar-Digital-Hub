CREATE TABLE IF NOT EXISTS admin_broadcast_campaigns (
  id TEXT PRIMARY KEY,
  campaign_type TEXT NOT NULL CHECK (campaign_type IN ('broadcast','social')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  audience TEXT NOT NULL,
  channels TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('sent','draft')),
  recipient_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_broadcast_created ON admin_broadcast_campaigns(created_at DESC);
