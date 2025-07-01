// Begin transaction to update database
/**
 * Updates the badbits database with new hashes
 *
 * @param {Object} env - Environment containing database connection
 * @param {Set<string>} currentHashes - Set of current valid hashes from
 *   denylist
 * @param {Function} getHashType - Function to determine hash type
 * @returns {Promise<{ added: number; removed: number }>} - Number of entries
 *   added and removed
 */
export async function updateBadBitsDatabase(env, currentHashes, getHashType) {
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
      const insertStmt = env.DB.prepare(
        'INSERT INTO badbits (hash, hash_type) VALUES (?, ?)',
      )
      hashesToAdd.forEach((hash) => {
        dbOperations.push(insertStmt.bind(hash, getHashType(hash)))
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

/**
 * Check if a hash exists in the badbits database
 *
 * @param {Object} env - Environment containing database connection
 * @param {string[]} hashes - Array of hashes to check
 * @returns {Promise<boolean>} - True if any hash is blocked
 */
export async function checkHashesAgainstBadBits(env, hashes) {
  if (!hashes || hashes.length === 0) {
    return false
  }

  const placeholders = hashes.map(() => '?').join(',')
  const query = `
    SELECT COUNT(*) as count 
    FROM badbits 
    WHERE hash IN (${placeholders})
  `

  const result = await env.DB.prepare(query)
    .bind(...hashes)
    .first()
  return result && result.count > 0
}

/**
 * Update the status of a root CID in the database
 *
 * @param {Object} env - Environment containing database connection
 * @param {string} cid - The CID to update
 * @param {string} status - The new status ('blocked' or 'allowed')
 * @returns {Promise<void>}
 */
export async function updateRootCidStatus(env, cid, status) {
  await env.DB.prepare('UPDATE indexer_roots SET status = ? WHERE root_cid = ?')
    .bind(status, cid)
    .run()
}

/**
 * Get the current status of a root CID from the database
 *
 * @param {Object} env - Environment containing database connection
 * @param {string} cid - The CID to check
 * @returns {Promise<string | null>} - The status or null if not found
 */
export async function getRootCidStatus(env, cid) {
  const result = await env.DB.prepare(
    'SELECT status FROM indexer_roots WHERE root_cid = ?',
  )
    .bind(cid)
    .first()

  return result ? result.status : null
}
