ALTER TABLE forum_posts ADD COLUMN image_url TEXT;
CREATE TABLE IF NOT EXISTS forum_media_assets (
 id TEXT PRIMARY KEY,
 customer_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
 object_key TEXT NOT NULL UNIQUE,
 mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp','image/avif')),
 size_bytes INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_forum_media_customer ON forum_media_assets(customer_id,created_at);
