/**
 * Stores the calculated RSR scores in the provider_scores table using batch
 * operations
 *
 * @param {Env} env - Environment object containing database connection
 * @param {{ address: string; rsr: number; calculated_at: string }[]} providerScores
 *   - Array of provider RSR scores
 *
 * @returns {Promise<void>}
 */
export async function storeProviderRSRScores(env, providerScores) {
  if (!providerScores || providerScores.length === 0) {
    console.log('No provider scores to store')
    return
  }

  try {
    // Prepare the statement for inserting/updating scores
    const stmt = env.DB.prepare(`
        INSERT INTO provider_scores (address, rsr, calculated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(address, calculated_at) DO UPDATE SET 
          rsr = excluded.rsr
      `)

    // Create batch operations
    const batchOperations = providerScores.map((score) =>
      stmt.bind(score.address, score.rsr, score.calculated_at),
    )

    // Execute batch
    await env.DB.batch(batchOperations)
  } catch (error) {
    console.error('Error storing provider RSR scores:', error)
    throw new Error('Failed to store provider RSR scores.', {
      cause: error.message,
    })
  }
}
