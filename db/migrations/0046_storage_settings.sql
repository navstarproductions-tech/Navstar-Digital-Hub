-- Administrator-configurable private storage limits and retention controls.
CREATE TABLE IF NOT EXISTS storage_settings (
  id INTEGER PRIMARY KEY CHECK (id=1),
  max_upload_mb INTEGER NOT NULL DEFAULT 25 CHECK (max_upload_mb BETWEEN 1 AND 100),
  max_media_mb INTEGER NOT NULL DEFAULT 100 CHECK (max_media_mb BETWEEN 1 AND 500),
  download_url_expiry_seconds INTEGER NOT NULL DEFAULT 180 CHECK (download_url_expiry_seconds BETWEEN 60 AND 900),
  storage_alert_gb INTEGER NOT NULL DEFAULT 10 CHECK (storage_alert_gb BETWEEN 1 AND 10000),
  retention_days INTEGER NOT NULL DEFAULT 365 CHECK (retention_days BETWEEN 0 AND 3650),
  allowed_extensions_json TEXT NOT NULL DEFAULT '["pdf","jpg","jpeg","png","webp","avif","txt","csv","doc","docx","xls","xlsx","ppt","pptx","mp3","wav","m4a","mp4","mov","webm","zip"]',
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO storage_settings(id) VALUES(1);
