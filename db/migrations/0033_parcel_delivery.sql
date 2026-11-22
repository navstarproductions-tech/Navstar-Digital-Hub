-- Parcel delivery records are separate from existing customer orders and payments.
-- Existing service_requests and payment history are preserved.
CREATE TABLE IF NOT EXISTS parcels (
  id TEXT PRIMARY KEY,
  service_request_id TEXT NOT NULL UNIQUE REFERENCES service_requests(id),
  parcel_ref TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL UNIQUE,\n  delivery_token TEXT NOT NULL,
  customer_type TEXT NOT NULL CHECK (customer_type IN ('individual','organisation','walk_in')),
  customer_name TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT,
  recipient_address TEXT,
  contents_json TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  amount INTEGER NOT NULL CHECK (amount > 0),
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('pay_now','pay_on_delivery')),
  delivery_status TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK (delivery_status IN ('awaiting_payment','ready','delivered','cancelled')),
  recipient_confirmed_at TEXT,
  recipient_confirmation_name TEXT,
  recipient_confirmation_phone TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS parcels_created_idx ON parcels(created_at);
CREATE INDEX IF NOT EXISTS parcels_delivery_status_idx ON parcels(delivery_status);
