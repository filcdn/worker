/**
 * Updates the bad bits database with new hashes
 *
 * @param {Object} env - Environment containing database connection
 * @param {Set<string>} currentHashes - Set of current valid hashes from
 *   denylist
 */
export async function updateBadBitsDatabase(env, currentHashes) {
  try {
    const now = new Date()
    const stmt = env.DB.prepare(
      `
      INSERT INTO bad_bits (hash, last_modified_at) VALUES (?, ?)
      ON CONFLICT(hash) DO UPDATE SET last_modified_at = excluded.last_modified_at
      `,
    )
    await env.DB.batch(
      [
        Array.from(currentHashes).map((hash) =>
          stmt.bind(hash, now.toISOString()),
        ),
        env.DB.prepare(
          `
          DELETE FROM bad_bits WHERE last_modified_at < ?
          `,
        ).bind(now.toISOString()),
      ].flat(),
    )
  } catch (error) {
    console.error('Error updating bad_bits:', error)
    throw error
  }
}
