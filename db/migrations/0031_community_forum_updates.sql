ALTER TABLE forum_posts ADD COLUMN category TEXT NOT NULL DEFAULT 'forum' CHECK (category IN ('campus','forum','news'));
ALTER TABLE forum_posts ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'approved' CHECK (moderation_status IN ('pending','approved','rejected'));
ALTER TABLE forum_posts ADD COLUMN featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0,1));
ALTER TABLE forum_comments ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'approved' CHECK (moderation_status IN ('pending','approved','rejected'));
CREATE INDEX IF NOT EXISTS idx_forum_posts_moderation ON forum_posts(moderation_status,category,created_at);
CREATE INDEX IF NOT EXISTS idx_forum_comments_moderation ON forum_comments(moderation_status,created_at);
CREATE TABLE IF NOT EXISTS forum_sticker_reactions (
 id TEXT PRIMARY KEY,
 post_id TEXT NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
 customer_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
 sticker TEXT NOT NULL CHECK (sticker IN ('❤️','😂','👏','🔥','🎉','💡','🙌','😮','💯','🤝')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(post_id,customer_id,sticker)
);
