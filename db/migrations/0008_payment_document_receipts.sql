-- Give every successful Navstar payment its own printable receipt number,
-- separate from the Safaricom transaction receipt code.
ALTER TABLE payments ADD COLUMN internal_receipt_number TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_internal_receipt ON payments(internal_receipt_number);

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at,id) AS n
  FROM payments WHERE status = 'paid'
)
UPDATE payments
SET internal_receipt_number = 'PAY-' || printf('%06d',(SELECT n FROM ranked WHERE ranked.id = payments.id))
WHERE status = 'paid' AND internal_receipt_number IS NULL;

INSERT INTO reference_sequences(prefix,next_value)
SELECT 'PAY', COALESCE(MAX(CAST(substr(internal_receipt_number,5) AS INTEGER)),0)+1
FROM payments WHERE internal_receipt_number IS NOT NULL
ON CONFLICT(prefix) DO UPDATE SET next_value = MAX(reference_sequences.next_value, excluded.next_value);
