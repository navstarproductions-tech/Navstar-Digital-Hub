export async function nextReference(db, prefix) {
  const allowed = new Set(['DON', 'ENR', 'SRV', 'COT']);
  if (!allowed.has(prefix)) throw new Error('Unsupported reference type.');
  const row = await db.prepare(`
    INSERT INTO reference_sequences (prefix, next_value)
    VALUES (?, 1)
    ON CONFLICT(prefix) DO UPDATE SET next_value = next_value + 1
    RETURNING next_value
  `).bind(prefix).first();
  if (!row?.next_value) throw new Error('Could not allocate a reference number.');
  return `${prefix}-${String(row.next_value).padStart(3, '0')}`;
}
