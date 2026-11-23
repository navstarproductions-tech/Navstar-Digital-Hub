-- Student/customer support tickets with auditable administrator responses.
CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  ticket_number TEXT NOT NULL UNIQUE,
  requester_type TEXT NOT NULL CHECK (requester_type IN ('student','customer')),
  requester_user_id TEXT REFERENCES users(id),
  customer_id TEXT REFERENCES customer_accounts(id),
  requester_name TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  admin_response TEXT NOT NULL DEFAULT '',
  assigned_to TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status,priority,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_student ON support_tickets(requester_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_customer ON support_tickets(customer_id,created_at DESC);
