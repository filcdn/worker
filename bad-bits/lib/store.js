/**
 * Updates the bad bits database with new hashes
 *
 * @param {Env} env - Environment containing database connection
 * @param {Set<string>} currentHashes - Set of current valid hashes from
 *   denylist
 * @param {string} etag - ETag for the current denylist
 */
export async function updateBadBitsDatabase(env, currentHashes, etag) {
  try {
    const now = new Date()
    const insertBadBitStmt = env.DB.prepare(
      `
      INSERT INTO bad_bits (hash, last_modified_at) VALUES (?, ?)
      ON CONFLICT(hash) DO UPDATE SET last_modified_at = excluded.last_modified_at
      `,
    )

    const statements = [
      ...Array.from(currentHashes).map((hash) =>
        insertBadBitStmt.bind(hash, now.toISOString()),
      ),

      env.DB.prepare('DELETE FROM bad_bits WHERE last_modified_at < ?').bind(
        now.toISOString(),
      ),
    ]

    if (etag) {
      statements.push(
        env.DB.prepare(
          'INSERT INTO bad_bits_history (timestamp, etag) VALUES (?, ?)',
        ).bind(now.toISOString(), etag),
      )
    }

    await env.DB.batch(statements)
  } catch (error) {
    console.error('Error updating bad_bits:', error)
    throw error
  }
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
