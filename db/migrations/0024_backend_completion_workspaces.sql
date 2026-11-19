-- Additive backend completion for recruitment, exam delivery and business operations.
-- Existing student, payment, assessment and customer-cart records are preserved.
ALTER TABLE user_profiles ADD COLUMN subject_specialisations TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS staff_applications (
  id TEXT PRIMARY KEY,
  applicant_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  position_applied TEXT NOT NULL,
  subject_specialisations TEXT NOT NULL DEFAULT '',
  qualifications TEXT NOT NULL DEFAULT '',
  experience TEXT NOT NULL DEFAULT '',
  cover_letter TEXT NOT NULL DEFAULT '',
  document_key TEXT,
  document_name TEXT,
  document_mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','under_review','shortlisted','approved','rejected','withdrawn')),
  review_notes TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_staff_applications_status ON staff_applications(status,created_at);
CREATE INDEX IF NOT EXISTS idx_staff_applications_email ON staff_applications(email);

CREATE TABLE IF NOT EXISTS course_exam_questions (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES course_assessments(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK(question_type IN ('single_choice','multiple_choice','true_false','short_answer','essay')),
  options_json TEXT NOT NULL DEFAULT '[]',
  correct_answer_json TEXT,
  explanation TEXT NOT NULL DEFAULT '',
  points INTEGER NOT NULL DEFAULT 1 CHECK(points BETWEEN 1 AND 1000),
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_exam_questions_assessment ON course_exam_questions(assessment_id,status,sort_order);

CREATE TABLE IF NOT EXISTS exam_runtime_attempts (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES course_assessments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  submitted_at TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','submitted','graded','expired')),
  objective_score INTEGER,
  total_score INTEGER,
  flagged_count INTEGER NOT NULL DEFAULT 0,
  last_activity_at TEXT NOT NULL,
  UNIQUE(assessment_id,user_id,attempt_number)
);
CREATE INDEX IF NOT EXISTS idx_exam_runtime_user ON exam_runtime_attempts(user_id,assessment_id,status);

CREATE TABLE IF NOT EXISTS exam_runtime_answers (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES exam_runtime_attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES course_exam_questions(id) ON DELETE CASCADE,
  answer_json TEXT NOT NULL DEFAULT 'null',
  points_awarded INTEGER,
  is_correct INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(attempt_id,question_id)
);
CREATE INDEX IF NOT EXISTS idx_exam_runtime_answers_attempt ON exam_runtime_answers(attempt_id);

CREATE TABLE IF NOT EXISTS business_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  barcode TEXT UNIQUE,
  category TEXT NOT NULL DEFAULT '',
  unit_price INTEGER NOT NULL DEFAULT 0 CHECK(unit_price>=0),
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK(stock_quantity>=0),
  reorder_level INTEGER NOT NULL DEFAULT 0 CHECK(reorder_level>=0),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','archived')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_business_products_barcode ON business_products(barcode);

CREATE TABLE IF NOT EXISTS business_sales (
  id TEXT PRIMARY KEY,
  receipt_number TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  subtotal INTEGER NOT NULL DEFAULT 0 CHECK(subtotal>=0),
  discount_amount INTEGER NOT NULL DEFAULT 0 CHECK(discount_amount>=0),
  total_amount INTEGER NOT NULL DEFAULT 0 CHECK(total_amount>=0),
  payment_method TEXT NOT NULL DEFAULT 'pending' CHECK(payment_method IN ('pending','cash','mpesa','bank','card')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending','paid','cancelled','refunded')),
  payment_reference TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_business_sales_created ON business_sales(created_at,payment_status);

CREATE TABLE IF NOT EXISTS business_sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES business_sales(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES business_products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity>0),
  unit_price INTEGER NOT NULL CHECK(unit_price>=0),
  line_total INTEGER NOT NULL CHECK(line_total>=0)
);
CREATE INDEX IF NOT EXISTS idx_business_sale_items_sale ON business_sale_items(sale_id);
