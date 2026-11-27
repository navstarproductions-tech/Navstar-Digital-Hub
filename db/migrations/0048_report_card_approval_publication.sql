-- Add a controlled report-card approval and publication workflow.
-- Existing issued records remain published and retain their existing verification access.
ALTER TABLE academic_report_cards ADD COLUMN status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','approved','published'));
ALTER TABLE academic_report_cards ADD COLUMN approved_by TEXT REFERENCES users(id);
ALTER TABLE academic_report_cards ADD COLUMN approved_at TEXT;
ALTER TABLE academic_report_cards ADD COLUMN published_by TEXT REFERENCES users(id);
ALTER TABLE academic_report_cards ADD COLUMN published_at TEXT;
UPDATE academic_report_cards SET published_at=issued_at WHERE status='published' AND published_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_academic_report_cards_status ON academic_report_cards(status,issued_at DESC);
