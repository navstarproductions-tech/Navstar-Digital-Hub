-- Keep the recoverable QR token in a separate table accessible only through authenticated admin APIs.
-- The public delivery endpoint continues to look up parcels using the SHA-256 token hash.
CREATE TABLE IF NOT EXISTS parcel_delivery_tokens (
  parcel_id TEXT PRIMARY KEY REFERENCES parcels(id) ON DELETE CASCADE,
  delivery_token TEXT NOT NULL UNIQUE
);
