/**
 * RSR (Retrieval Success Rate) Score Storage and Persistence Module
 * 
 * This module provides functionality to store calculated RSR scores in the database
 * and manage persistence over time with batch operations and conflict resolution.
 */

/**
 * @typedef {Object} RSRScoreData
 * @property {string} providerAddress - The storage provider's address
 * @property {number} score - The calculated RSR score (0-1)
 * @property {string} calculatedAt - ISO timestamp when the score was calculated
 * @property {string} calculationPeriodStart - Start of the calculation period
 * @property {string} calculationPeriodEnd - End of the calculation period
 * @property {number} totalRequests - Total number of requests in the period
 * @property {number} successfulRequests - Number of successful requests
 * @property {number} [avgResponseTimeMs] - Average response time in milliseconds
 * @property {number} [avgTtfbMs] - Average time to first byte in milliseconds
 * @property {number} [avgTtlbMs] - Average time to last byte in milliseconds
 * @property {number} [reliabilityScore] - Calculated reliability component
 * @property {number} [performanceScore] - Calculated performance component
 */

/**
 * Stores a single RSR score in the database with conflict resolution
 * 
 * @param {Pick<Env, 'DB'>} env - Worker environment with D1 DB binding
 * @param {RSRScoreData} scoreData - The RSR score data to store
 * @returns {Promise<void>}
 */
export async function storeRSRScore(env, scoreData) {
  const {
    providerAddress,
    score,
    calculatedAt,
    calculationPeriodStart,
    calculationPeriodEnd,
    totalRequests,
    successfulRequests,
    avgResponseTimeMs,
    avgTtfbMs,
    avgTtlbMs,
    reliabilityScore,
    performanceScore,
  } = scoreData

  try {
    await env.DB.prepare(
      `
      INSERT INTO provider_rsr_scores (
        provider_address,
        score,
        calculated_at,
        calculation_period_start,
        calculation_period_end,
        total_requests,
        successful_requests,
        avg_response_time_ms,
        avg_ttfb_ms,
        avg_ttlb_ms,
        reliability_score,
        performance_score
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_address, calculated_at) DO UPDATE SET
        score = excluded.score,
        calculation_period_start = excluded.calculation_period_start,
        calculation_period_end = excluded.calculation_period_end,
        total_requests = excluded.total_requests,
        successful_requests = excluded.successful_requests,
        avg_response_time_ms = excluded.avg_response_time_ms,
        avg_ttfb_ms = excluded.avg_ttfb_ms,
        avg_ttlb_ms = excluded.avg_ttlb_ms,
        reliability_score = excluded.reliability_score,
        performance_score = excluded.performance_score
      `
    )
      .bind(
        providerAddress.toLowerCase(),
        score,
        calculatedAt,
        calculationPeriodStart,
        calculationPeriodEnd,
        totalRequests,
        successfulRequests,
        avgResponseTimeMs ?? null,
        avgTtfbMs ?? null,
        avgTtlbMs ?? null,
        reliabilityScore ?? null,
        performanceScore ?? null,
      )
      .run()

    console.log(`Stored RSR score for provider ${providerAddress}: ${score}`)
  } catch (error) {
    console.error(`Error storing RSR score for provider ${providerAddress}:`, error)
    throw error
  }
}

/**
 * Stores multiple RSR scores in a batch operation for efficiency
 * 
 * @param {Pick<Env, 'DB'>} env - Worker environment with D1 DB binding
 * @param {RSRScoreData[]} scoresData - Array of RSR score data to store
 * @returns {Promise<void>}
 */
export async function storeRSRScoresBatch(env, scoresData) {
  if (!scoresData || scoresData.length === 0) {
    console.log('No RSR scores to store in batch')
    return
  }

  try {
    // Prepare batch insert statement
    const stmt = env.DB.prepare(
      `
      INSERT INTO provider_rsr_scores (
        provider_address,
        score,
        calculated_at,
        calculation_period_start,
        calculation_period_end,
        total_requests,
        successful_requests,
        avg_response_time_ms,
        avg_ttfb_ms,
        avg_ttlb_ms,
        reliability_score,
        performance_score
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_address, calculated_at) DO UPDATE SET
        score = excluded.score,
        calculation_period_start = excluded.calculation_period_start,
        calculation_period_end = excluded.calculation_period_end,
        total_requests = excluded.total_requests,
        successful_requests = excluded.successful_requests,
        avg_response_time_ms = excluded.avg_response_time_ms,
        avg_ttfb_ms = excluded.avg_ttfb_ms,
        avg_ttlb_ms = excluded.avg_ttlb_ms,
        reliability_score = excluded.reliability_score,
        performance_score = excluded.performance_score
      `
    )

    // Prepare batch data
    const batchData = scoresData.map(scoreData => [
      scoreData.providerAddress.toLowerCase(),
      scoreData.score,
      scoreData.calculatedAt,
      scoreData.calculationPeriodStart,
      scoreData.calculationPeriodEnd,
      scoreData.totalRequests,
      scoreData.successfulRequests,
      scoreData.avgResponseTimeMs ?? null,
      scoreData.avgTtfbMs ?? null,
      scoreData.avgTtlbMs ?? null,
      scoreData.reliabilityScore ?? null,
      scoreData.performanceScore ?? null,
    ])

    // Execute batch operation
    await env.DB.batch(
      batchData.map(data => stmt.bind(...data))
    )

    console.log(`Stored ${scoresData.length} RSR scores in batch operation`)
  } catch (error) {
    console.error('Error storing RSR scores in batch:', error)
    throw error
  }
}

/**
 * Retrieves the latest RSR score for a specific provider
 * 
 * @param {Pick<Env, 'DB'>} env - Worker environment with D1 DB binding
 * @param {string} providerAddress - The provider's address
 * @returns {Promise<RSRScoreData | null>}
 */
export async function getLatestRSRScore(env, providerAddress) {
  try {
    const result = /** @type {RSRScoreData | null} */ (
      await env.DB.prepare(
        `
        SELECT 
          provider_address as providerAddress,
          score,
          calculated_at as calculatedAt,
          calculation_period_start as calculationPeriodStart,
          calculation_period_end as calculationPeriodEnd,
          total_requests as totalRequests,
          successful_requests as successfulRequests,
          avg_response_time_ms as avgResponseTimeMs,
          avg_ttfb_ms as avgTtfbMs,
          avg_ttlb_ms as avgTtlbMs,
          reliability_score as reliabilityScore,
          performance_score as performanceScore
        FROM provider_rsr_scores
        WHERE provider_address = ?
        ORDER BY calculated_at DESC
        LIMIT 1
        `
      )
        .bind(providerAddress.toLowerCase())
        .first()
    )

    return result || null
  } catch (error) {
    console.error(`Error retrieving latest RSR score for provider ${providerAddress}:`, error)
    throw error
  }
}

/**
 * Retrieves RSR scores for multiple providers within a time range
 * 
 * @param {Pick<Env, 'DB'>} env - Worker environment with D1 DB binding
 * @param {string[]} providerAddresses - Array of provider addresses
 * @param {string | null} [startTime] - Start time for the range (ISO string)
 * @param {string | null} [endTime] - End time for the range (ISO string)
 * @returns {Promise<RSRScoreData[]>}
 */
export async function getRSRScoresForProviders(
  env,
  providerAddresses,
  startTime = null,
  endTime = null
) {
  try {
    let query = `
      SELECT 
        provider_address as providerAddress,
        score,
        calculated_at as calculatedAt,
        calculation_period_start as calculationPeriodStart,
        calculation_period_end as calculationPeriodEnd,
        total_requests as totalRequests,
        successful_requests as successfulRequests,
        avg_response_time_ms as avgResponseTimeMs,
        avg_ttfb_ms as avgTtfbMs,
        avg_ttlb_ms as avgTtlbMs,
        reliability_score as reliabilityScore,
        performance_score as performanceScore
      FROM provider_rsr_scores
      WHERE provider_address IN (${providerAddresses.map(() => '?').join(', ')})
    `
    
    const bindings = providerAddresses.map(addr => addr.toLowerCase())
    
    if (startTime) {
      query += ' AND calculated_at >= ?'
      bindings.push(startTime)
    }
    
    if (endTime) {
      query += ' AND calculated_at <= ?'
      bindings.push(endTime)
    }
    
    query += ' ORDER BY calculated_at DESC'

    const results = await env.DB.prepare(query).bind(...bindings).all()
    
    return /** @type {RSRScoreData[]} */ (results.results || [])
  } catch (error) {
    console.error('Error retrieving RSR scores for providers:', error)
    throw error
  }
}

/**
 * Retrieves all latest RSR scores for all providers
 * 
 * @param {Pick<Env, 'DB'>} env - Worker environment with D1 DB binding
 * @returns {Promise<RSRScoreData[]>}
 */
export async function getAllLatestRSRScores(env) {
  try {
    const results = await env.DB.prepare(
      `
      SELECT 
        provider_address as providerAddress,
        score,
        calculated_at as calculatedAt,
        calculation_period_start as calculationPeriodStart,
        calculation_period_end as calculationPeriodEnd,
        total_requests as totalRequests,
        successful_requests as successfulRequests,
        avg_response_time_ms as avgResponseTimeMs,
        avg_ttfb_ms as avgTtfbMs,
        avg_ttlb_ms as avgTtlbMs,
        reliability_score as reliabilityScore,
        performance_score as performanceScore
      FROM provider_rsr_scores
      WHERE (provider_address, calculated_at) IN (
        SELECT provider_address, MAX(calculated_at)
        FROM provider_rsr_scores
        GROUP BY provider_address
      )
      ORDER BY score DESC
      `
    ).all()

    return /** @type {RSRScoreData[]} */ (results.results || [])
  } catch (error) {
    console.error('Error retrieving all latest RSR scores:', error)
    throw error
  }
}

/**
 * Deletes old RSR scores beyond a specified retention period
 * 
 * @param {Pick<Env, 'DB'>} env - Worker environment with D1 DB binding
 * @param {number} retentionDays - Number of days to retain scores
 * @returns {Promise<number>} Number of deleted records
 */
export async function cleanupOldRSRScores(env, retentionDays = 90) {
  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)
    const cutoffISO = cutoffDate.toISOString()

    const result = await env.DB.prepare(
      'DELETE FROM provider_rsr_scores WHERE calculated_at < ?'
    )
      .bind(cutoffISO)
      .run()

    const deletedCount = result.meta.changes || 0
    console.log(`Cleaned up ${deletedCount} old RSR scores older than ${retentionDays} days`)
    
    return deletedCount
  } catch (error) {
    console.error('Error cleaning up old RSR scores:', error)
    throw error
  }
}
