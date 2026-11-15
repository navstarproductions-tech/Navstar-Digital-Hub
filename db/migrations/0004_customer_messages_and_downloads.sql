-- Customer notifications and administrator-managed downloadable documents.
ALTER TABLE service_requests ADD COLUMN email TEXT;

CREATE TABLE IF NOT EXISTS downloadable_documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  original_name TEXT NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 1 CHECK (is_public IN (0, 1)),
  uploaded_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS downloadable_documents_created_idx ON downloadable_documents(created_at);
