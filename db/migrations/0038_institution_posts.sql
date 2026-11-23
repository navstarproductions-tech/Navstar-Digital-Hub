-- Public institutional news and event records. Additive only.
CREATE TABLE IF NOT EXISTS institution_posts (
  id TEXT PRIMARY KEY,
  post_type TEXT NOT NULL CHECK (post_type IN ('news','event')),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT 'public' CHECK (audience IN ('public','student','staff')),
  venue TEXT NOT NULL DEFAULT '',
  starts_at TEXT,
  ends_at TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_by TEXT NOT NULL REFERENCES users(id),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_institution_posts_type_status ON institution_posts(post_type,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_institution_posts_schedule ON institution_posts(post_type,starts_at);
