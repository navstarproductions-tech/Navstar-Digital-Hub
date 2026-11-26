-- Central private Cloudflare R2 file metadata and resumable upload intents.
-- Existing DOCS and MEDIA objects are deliberately preserved; migrate them only after verification.
CREATE TABLE IF NOT EXISTS stored_files (
  id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  extension TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  storage_provider TEXT NOT NULL DEFAULT 'cloudflare-r2',
  storage_bucket TEXT NOT NULL,
  module TEXT NOT NULL,
  record_id TEXT,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  uploaded_by TEXT REFERENCES users(id),
  uploader_kind TEXT NOT NULL DEFAULT 'user',
  uploader_ref TEXT,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted','quarantined')),
  description TEXT NOT NULL DEFAULT '',
  etag TEXT,
  checksum_sha256 TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  restored_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_stored_files_module_created ON stored_files(module,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stored_files_owner_created ON stored_files(owner_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stored_files_record ON stored_files(module,record_id);
CREATE INDEX IF NOT EXISTS idx_stored_files_status ON stored_files(status,created_at DESC);

CREATE TABLE IF NOT EXISTS storage_upload_intents (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  record_id TEXT,
  original_name TEXT NOT NULL,
  extension TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  description TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_storage_upload_intents_expiry ON storage_upload_intents(expires_at);
