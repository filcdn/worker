/**
 * Updates the badbits database with new hashes
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
        currentHashes.map((hash) =>
          env.DB.prepare(
            `
          INSERT INTO badbits (hash) VALUES (?)
          ON CONFLICT(hash) DO UPDATE SET last_modified_at = ?
        `,
          ).bind(hash, now.toISOString()),
        ),
        env.DB.prepare(
          `
        DELETE FROM badbits WHERE last_modified_at < ?
      `,
        ).bind(now.toISOString()),
      ].flatMap(),
    )
  } catch (error) {
    console.error('Error updating badbits database:', error)
    throw error
  }
}
