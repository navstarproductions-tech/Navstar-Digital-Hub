-- Dedicated operational records for Admin workspaces that do not yet have a specialised register.
-- Customer accounts, admissions, payments, biometrics and school analytics remain in their own protected stores.
CREATE TABLE IF NOT EXISTS admin_workspace_records (
  id TEXT PRIMARY KEY,
  workspace TEXT NOT NULL,
  subtab TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  details TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_workspace_records_lookup
  ON admin_workspace_records(workspace, subtab, updated_at DESC);
