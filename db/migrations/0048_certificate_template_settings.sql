-- Configurable certificate artwork and content. Existing issued certificate snapshots remain unchanged.
CREATE TABLE IF NOT EXISTS certificate_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO certificate_settings(id, settings_json) VALUES (1, '{}');
