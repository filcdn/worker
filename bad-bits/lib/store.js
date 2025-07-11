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
    await env.DB.batch(
      [
        Array.from(currentHashes).map((hash) =>
          env.DB.prepare(
            `
          INSERT INTO bad_bits (hash, last_modified_at) VALUES (?, ?)
          ON CONFLICT(hash) DO UPDATE SET last_modified_at = ?
        `,
          ).bind(hash, now.toISOString(), now.toISOString()),
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
