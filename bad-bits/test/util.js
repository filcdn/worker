/**
 * Gets all bad bit hashes from the database
 *
 * @param {Object} env - Environment containing database connection
 * @returns {Promise<string[]>} - Array of hash strings
 */
export async function getAllBadBitHashes(env) {
  const { results } = await env.DB.prepare('SELECT hash FROM bad_bits').all()
  return results.map((entry) => entry.hash)
}
