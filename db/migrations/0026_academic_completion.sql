-- Academic completion: component marks, immutable report identifiers, private conversations and timetable rules.
-- All additions preserve existing Navstar student, payment and assessment records.
ALTER TABLE users ADD COLUMN google_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL;

CREATE TABLE IF NOT EXISTS assessment_component_marks (
 id TEXT PRIMARY KEY, assessment_id TEXT NOT NULL REFERENCES course_assessments(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 component_key TEXT NOT NULL, component_label TEXT NOT NULL,
 points_awarded REAL NOT NULL DEFAULT 0, max_points REAL NOT NULL,
 feedback TEXT NOT NULL DEFAULT '', marked_by TEXT REFERENCES users(id),
 marked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(assessment_id,user_id,component_key)
);
CREATE INDEX IF NOT EXISTS idx_component_marks_assessment ON assessment_component_marks(assessment_id,user_id);

CREATE TABLE IF NOT EXISTS academic_report_cards (
 id TEXT PRIMARY KEY, report_card_no TEXT NOT NULL UNIQUE, public_token TEXT NOT NULL UNIQUE,
 user_id TEXT NOT NULL REFERENCES users(id), course_id TEXT NOT NULL REFERENCES courses(id),
 period_label TEXT NOT NULL, intake_code TEXT NOT NULL, snapshot_json TEXT NOT NULL,
 issued_by TEXT REFERENCES users(id), issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(user_id,course_id,period_label)
);
CREATE INDEX IF NOT EXISTS idx_academic_report_cards_student ON academic_report_cards(user_id,course_id,issued_at DESC);

CREATE TABLE IF NOT EXISTS academic_conversations (
 id TEXT PRIMARY KEY, subject TEXT NOT NULL, course_id TEXT REFERENCES courses(id),
 student_user_id TEXT NOT NULL REFERENCES users(id), tutor_user_id TEXT REFERENCES users(id),
 status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS academic_messages (
 id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES academic_conversations(id) ON DELETE CASCADE,
 sender_user_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL,
 attachment_url TEXT, read_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_academic_messages_conversation ON academic_messages(conversation_id,created_at);
CREATE INDEX IF NOT EXISTS idx_academic_conversations_student ON academic_conversations(student_user_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_academic_conversations_tutor ON academic_conversations(tutor_user_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS timetable_generation_rules (
 id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
 rules_json TEXT NOT NULL, created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS exam_attempt_approvals (
 id TEXT PRIMARY KEY, assessment_id TEXT NOT NULL REFERENCES course_assessments(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'pending', reviewed_by TEXT REFERENCES users(id),
 reviewed_at TEXT, note TEXT NOT NULL DEFAULT '',
 UNIQUE(assessment_id,user_id)
);
