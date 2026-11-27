-- Private student/staff portal conversations. Messages are visible only to their two participants.
CREATE TABLE IF NOT EXISTS portal_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_portal_messages_thread ON portal_messages(thread_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_portal_messages_recipient ON portal_messages(recipient_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_messages_sender ON portal_messages(sender_id, created_at DESC);
