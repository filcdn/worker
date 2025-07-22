/**
 * Gets all bad bit hashes from the database
 *
 * @param {Env} env - Environment containing database connection
 * @returns {Promise<string[]>} - Array of hash strings
 */
export async function getAllBadBitHashes(env) {
  const { results } = await env.DB.prepare('SELECT hash FROM bad_bits').all()
  return results.map((entry) => entry.hash)
}

/**
 * @param {Env} env
 * @returns {Promise<{ timestamp: string; etag: string }[]>}
 */
export async function getBadBitsHistory(env) {
  const { results: history } = await env.DB.prepare(
    'SELECT * FROM bad_bits_history',
  ).all()
  return history
}
