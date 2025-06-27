import { storeProviderRSRScores } from './store.js'

/**
 * Calculates the RSR (Retrievability Success Rate) score for each provider RSR
 * = (Successful cache miss retrievals / Total cache miss attempts) * 100
 *
 * @param {Env} env - Environment object containing database connection
 * @returns {Promise<{ address: string; rsr: number; calculatedAt: string }[]>}
 *   - Array of provider RSR scores
 */
export async function calculateProviderRSRScores(env) {
  try {
    // First, get the most recent calculation timestamp from the provider_scores table
    const timestampQuery = `
        SELECT MAX(calculated_at) as last_calculated_at 
        FROM provider_scores
      `

    const timestampResult = await env.DB.prepare(timestampQuery).first()
    // Use the last calculated timestamp or default to epoch start if no records exist
    const startTimestamp =
      timestampResult?.last_calculated_at || '1970-01-01T00:00:00Z'

    // Query to calculate RSR scores for each provider based on retrieval logs
    const query = `
        WITH retrieval_attempts AS (
          SELECT 
            owner_address as address,
            COUNT(*) as total_attempts,
            SUM(CASE WHEN response_status = 200 THEN 1 ELSE 0 END) as successful_attempts
          FROM 
            retrieval_logs
          WHERE 
            cache_miss = true AND 
            timestamp > ?
          GROUP BY 
            owner_address
        )
        SELECT 
          address,
          CASE 
            WHEN total_attempts = 0 THEN 0
            ELSE CAST(successful_attempts * 100 / total_attempts AS INTEGER)
          END as rsr
        FROM 
          retrieval_attempts
      `

    const { results } = await env.DB.prepare(query).bind(startTimestamp).all()

    // Current timestamp for the calculation
    const calculatedAt = new Date().toISOString()

    // Format the results with the calculation timestamp
    const providerScores = results.map((row) => ({
      address: row.address,
      rsr: row.rsr,
      calculated_at: calculatedAt,
    }))

    return providerScores
  } catch (error) {
    console.error('Error calculating provider RSR scores:', error)
    throw new Error('Failed to calculate provider RSR scores. ', {
      cause: error.message,
    })
  }
}

/**
 * Calculates and stores the RSR scores for all providers in one operation
 *
 * @param {Env} env - Environment object containing database connection
 * @returns {Promise<void>}
 */
export async function updateProviderRSRScores(env) {
  const providerScores = await calculateProviderRSRScores(env)
  await storeProviderRSRScores(env, providerScores)
}
