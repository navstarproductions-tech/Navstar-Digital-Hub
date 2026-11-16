PRAGMA foreign_keys = ON;

-- Multi-school foundation: every school owns its academic and finance records.
CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY,
  school_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  school_type TEXT NOT NULL CHECK (school_type IN ('primary','junior_secondary','senior_secondary','mixed','college','other')),
  curriculum TEXT NOT NULL DEFAULT 'CBC',
  registration_number TEXT,
  email TEXT,
  phone TEXT,
  county TEXT,
  address TEXT,
  logo_key TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS school_memberships (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('school_admin','principal','deputy_principal','bursar','admissions','teacher','librarian','storekeeper','learner','parent')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(school_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_school_memberships_user ON school_memberships(user_id,status);
CREATE INDEX IF NOT EXISTS idx_school_memberships_school ON school_memberships(school_id,role,status);

CREATE TABLE IF NOT EXISTS school_academic_years (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(school_id,name)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_school_current_year ON school_academic_years(school_id) WHERE is_current = 1;

CREATE TABLE IF NOT EXISTS school_terms (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id TEXT NOT NULL REFERENCES school_academic_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  UNIQUE(academic_year_id,name)
);

CREATE TABLE IF NOT EXISTS school_classes (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id TEXT NOT NULL REFERENCES school_academic_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  education_stage TEXT NOT NULL CHECK (education_stage IN ('primary','junior_secondary','senior_secondary','college','other')),
  grade_level TEXT NOT NULL,
  stream TEXT NOT NULL DEFAULT '',
  class_teacher_membership_id TEXT REFERENCES school_memberships(id),
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  UNIQUE(school_id,academic_year_id,name,stream)
);
CREATE INDEX IF NOT EXISTS idx_school_classes_year ON school_classes(school_id,academic_year_id,status);

CREATE TABLE IF NOT EXISTS school_learners (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  admission_number TEXT NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  date_of_birth TEXT,
  gender TEXT,
  national_id_or_birth_cert TEXT,
  class_id TEXT REFERENCES school_classes(id),
  admission_date TEXT NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','transferred','graduated','suspended','withdrawn')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(school_id,admission_number)
);
CREATE INDEX IF NOT EXISTS idx_school_learners_class ON school_learners(school_id,class_id,status);

CREATE TABLE IF NOT EXISTS school_guardians (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  learner_id TEXT NOT NULL REFERENCES school_learners(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_school_guardians_learner ON school_guardians(learner_id);

CREATE TABLE IF NOT EXISTS school_staff_profiles (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  membership_id TEXT NOT NULL REFERENCES school_memberships(id) ON DELETE CASCADE,
  staff_number TEXT NOT NULL,
  department TEXT,
  job_title TEXT,
  employment_type TEXT,
  joined_on TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_leave','inactive')),
  UNIQUE(school_id,staff_number),
  UNIQUE(membership_id)
);

CREATE TABLE IF NOT EXISTS school_subjects (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  education_stage TEXT NOT NULL,
  grade_level TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived'))
);
CREATE INDEX IF NOT EXISTS idx_school_subjects_school ON school_subjects(school_id,status);

CREATE TABLE IF NOT EXISTS school_class_subjects (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES school_subjects(id) ON DELETE CASCADE,
  teacher_membership_id TEXT REFERENCES school_memberships(id),
  UNIQUE(class_id,subject_id)
);

-- Fee structures are versioned by school, year, term, stage, grade, course or programme.
CREATE TABLE IF NOT EXISTS school_fee_structures (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id TEXT REFERENCES school_academic_years(id),
  term_id TEXT REFERENCES school_terms(id),
  education_stage TEXT,
  grade_level TEXT,
  class_id TEXT REFERENCES school_classes(id),
  programme_name TEXT,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KES',
  total_amount INTEGER NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  effective_from TEXT,
  effective_to TEXT,
  created_by_membership_id TEXT REFERENCES school_memberships(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_school_fee_structures_lookup ON school_fee_structures(school_id,status,academic_year_id,term_id);

CREATE TABLE IF NOT EXISTS school_fee_items (
  id TEXT PRIMARY KEY,
  fee_structure_id TEXT NOT NULL REFERENCES school_fee_structures(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  description TEXT,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  is_optional INTEGER NOT NULL DEFAULT 0 CHECK (is_optional IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS school_invoices (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  learner_id TEXT NOT NULL REFERENCES school_learners(id),
  fee_structure_id TEXT REFERENCES school_fee_structures(id),
  invoice_number TEXT NOT NULL,
  academic_year_id TEXT REFERENCES school_academic_years(id),
  term_id TEXT REFERENCES school_terms(id),
  issue_date TEXT NOT NULL DEFAULT CURRENT_DATE,
  due_date TEXT,
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
  discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','part_paid','paid','cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(school_id,invoice_number)
);
CREATE INDEX IF NOT EXISTS idx_school_invoices_learner ON school_invoices(school_id,learner_id,status);

CREATE TABLE IF NOT EXISTS school_invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES school_invoices(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0)
);

CREATE TABLE IF NOT EXISTS school_payments (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  learner_id TEXT NOT NULL REFERENCES school_learners(id),
  invoice_id TEXT REFERENCES school_invoices(id),
  payment_reference TEXT NOT NULL,
  receipt_number TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'KES',
  payment_method TEXT NOT NULL CHECK (payment_method IN ('mpesa','cash','bank','card','cheque','other')),
  provider_reference TEXT,
  payer_phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','failed','reversed')),
  confirmed_at TEXT,
  received_by_membership_id TEXT REFERENCES school_memberships(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(school_id,payment_reference),
  UNIQUE(school_id,receipt_number)
);
CREATE INDEX IF NOT EXISTS idx_school_payments_learner ON school_payments(school_id,learner_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_school_payments_provider_ref ON school_payments(provider_reference);

CREATE TABLE IF NOT EXISTS school_payment_allocations (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES school_payments(id) ON DELETE CASCADE,
  invoice_id TEXT NOT NULL REFERENCES school_invoices(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  UNIQUE(payment_id,invoice_id)
);

CREATE TABLE IF NOT EXISTS school_receipt_sequences (
  school_id TEXT PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  next_value INTEGER NOT NULL DEFAULT 1 CHECK (next_value > 0)
);

CREATE TABLE IF NOT EXISTS school_audit_logs (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  membership_id TEXT REFERENCES school_memberships(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_school_audit_recent ON school_audit_logs(school_id,created_at);
