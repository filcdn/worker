// Begin transaction to update database
/**
 * Updates the badbits database with new hashes
 *
 * @param {Object} env - Environment containing database connection
 * @param {Set<string>} currentHashes - Set of current valid hashes from
 *   denylist
 * @returns {Promise<{ added: number; removed: number }>} - Number of entries
 *   added and removed
 */
export async function updateBadBitsDatabase(env, currentHashes) {
  try {
    // Get existing hashes
    const existingHashes = new Set(await getAllBadBitHashes(env))

    // Determine hashes to add and remove
    const hashesToAdd = [...currentHashes].filter(
      (hash) => !existingHashes.has(hash),
    )
    const hashesToRemove = [...existingHashes].filter(
      (hash) => !currentHashes.has(hash),
    )

    // Prepare database operations
    const dbOperations = []
    // Add new hashes
    if (hashesToAdd.length > 0) {
      const insertStmt = env.DB.prepare('INSERT INTO badbits (hash) VALUES (?)')
      hashesToAdd.forEach((hash) => {
        dbOperations.push(insertStmt.bind(hash))
      })
    }

    // Remove old hashes
    if (hashesToRemove.length > 0) {
      const deleteStmt = env.DB.prepare('DELETE FROM badbits WHERE hash = ?')
      hashesToRemove.forEach((hash) => {
        dbOperations.push(deleteStmt.bind(hash))
      })
    }
    // Execute all operations in a single atomic batch if there are any operations
    if (dbOperations.length > 0) {
      await env.DB.batch(dbOperations)
    }
    return {
      added: hashesToAdd.length,
      removed: hashesToRemove.length,
    }
  } catch (error) {
    console.error('Error updating badbits database:', error)
    throw error
  }
}

/**
 * Gets all bad bit hashes from the database
 *
 * @param {Object} env - Environment containing database connection
 * @returns {Promise<string[]>} - Array of hash strings
 */
export async function getAllBadBitHashes(env) {
  const { results } = await env.DB.prepare('SELECT hash FROM badbits').all()
  return results.map((entry) => entry.hash)
}
