/**
 * Updates the bad bits database with new hashes
 *
 * @param {Env} env - Environment containing database connection
 * @param {Set<string>} currentHashes - Set of current valid hashes from
 *   denylist
 * @param {string} etag - ETag for the current denylist
 */
export async function updateBadBitsDatabase(env, currentHashes, etag) {
  const startedAt = Date.now()
  const now = new Date().toISOString()
  const insertBadBitStmt = env.DB.prepare(
    `
      INSERT INTO bad_bits (hash, last_modified_at) VALUES (?, ?)
      ON CONFLICT(hash) DO UPDATE SET last_modified_at = excluded.last_modified_at
      `,
  )

  let updated = 0
  const remainingHashes = Array.from(currentHashes)
  while (remainingHashes.length > 0) {
    // pop first 1000 hashes from remainingHashes
    const batchHashes = remainingHashes.splice(0, 1000)
    updated += batchHashes.length
    await env.DB.batch(
      batchHashes.map((hash) => insertBadBitStmt.bind(hash, now)),
    )
    console.log(
      `Inserted/updated ${updated} bad bits in ${Date.now() - startedAt}ms`,
    )
  }

  const statements = [
    env.DB.prepare('DELETE FROM bad_bits WHERE last_modified_at < ?').bind(now),
  ]

  if (etag) {
    statements.push(
      env.DB.prepare(
        'INSERT INTO bad_bits_history (timestamp, etag) VALUES (?, ?)',
      ).bind(now, etag),
    )
  }

  await env.DB.batch(statements)
}

/**
 * @param {Env} env
 * @returns
 */
export async function getLastEtag(env) {
  const result = await env.DB.prepare(
    'SELECT etag FROM bad_bits_history ORDER BY timestamp DESC LIMIT 1',
  ).first()
  return result ? result.etag : null
}
