/**
 * Test data builders for RSR score storage tests
 */

/**
 * Creates a mock RSR score data object with default values
 * @param {Partial<import('../lib/rsr-score-storage.js').RSRScoreData>} overrides - Override default values
 * @returns {import('../lib/rsr-score-storage.js').RSRScoreData}
 */
export function createRSRScoreData(overrides = {}) {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  return {
    providerAddress: '0x1234567890123456789012345678901234567890',
    score: 0.85,
    calculatedAt: now.toISOString(),
    calculationPeriodStart: weekAgo.toISOString(),
    calculationPeriodEnd: now.toISOString(),
    totalRequests: 1000,
    successfulRequests: 850,
    avgResponseTimeMs: 250.5,
    avgTtfbMs: 150.2,
    avgTtlbMs: 300.8,
    reliabilityScore: 0.85,
    performanceScore: 0.75,
    ...overrides,
  }
}

/**
 * Creates multiple RSR score data objects for batch testing
 * @param {number} count - Number of score objects to create
 * @param {Partial<import('../lib/rsr-score-storage.js').RSRScoreData>} baseOverrides - Base overrides for all objects
 * @returns {import('../lib/rsr-score-storage.js').RSRScoreData[]}
 */
export function createMultipleRSRScoreData(count, baseOverrides = {}) {
  const scores = []
  const baseScore = createRSRScoreData(baseOverrides)

  for (let i = 0; i < count; i++) {
    scores.push(createRSRScoreData({
      ...baseScore,
      providerAddress: `0x${(i + 1).toString().padStart(40, '0')}`,
      score: 0.5 + (i * 0.1), // Varying scores from 0.5 to 0.9
      totalRequests: 1000 + (i * 100),
      successfulRequests: 850 + (i * 85),
      ...baseOverrides,
    }))
  }

  return scores
}

/**
 * Creates RSR score data for a high-performing provider
 * @param {Partial<import('../lib/rsr-score-storage.js').RSRScoreData>} overrides - Override default values
 * @returns {import('../lib/rsr-score-storage.js').RSRScoreData}
 */
export function createHighPerformingProviderScore(overrides = {}) {
  return createRSRScoreData({
    providerAddress: '0x1111111111111111111111111111111111111111',
    score: 0.95,
    totalRequests: 2000,
    successfulRequests: 1900,
    avgResponseTimeMs: 150.0,
    avgTtfbMs: 100.0,
    avgTtlbMs: 200.0,
    reliabilityScore: 0.95,
    performanceScore: 0.90,
    ...overrides,
  })
}

/**
 * Creates RSR score data for a low-performing provider
 * @param {Partial<import('../lib/rsr-score-storage.js').RSRScoreData>} overrides - Override default values
 * @returns {import('../lib/rsr-score-storage.js').RSRScoreData}
 */
export function createLowPerformingProviderScore(overrides = {}) {
  return createRSRScoreData({
    providerAddress: '0x2222222222222222222222222222222222222222',
    score: 0.45,
    totalRequests: 1000,
    successfulRequests: 450,
    avgResponseTimeMs: 500.0,
    avgTtfbMs: 300.0,
    avgTtlbMs: 600.0,
    reliabilityScore: 0.45,
    performanceScore: 0.40,
    ...overrides,
  })
}

/**
 * Creates RSR score data for a provider with missing optional metrics
 * @param {Partial<import('../lib/rsr-score-storage.js').RSRScoreData>} overrides - Override default values
 * @returns {import('../lib/rsr-score-storage.js').RSRScoreData}
 */
export function createMinimalProviderScore(overrides = {}) {
  return createRSRScoreData({
    providerAddress: '0x3333333333333333333333333333333333333333',
    score: 0.70,
    totalRequests: 500,
    successfulRequests: 350,
    avgResponseTimeMs: undefined,
    avgTtfbMs: undefined,
    avgTtlbMs: undefined,
    reliabilityScore: undefined,
    performanceScore: undefined,
    ...overrides,
  })
}

/**
 * Creates RSR score data with historical timestamps
 * @param {number} daysAgo - Number of days ago the score was calculated
 * @param {Partial<import('../lib/rsr-score-storage.js').RSRScoreData>} overrides - Override default values
 * @returns {import('../lib/rsr-score-storage.js').RSRScoreData}
 */
export function createHistoricalRSRScore(daysAgo, overrides = {}) {
  const calculatedAt = new Date()
  calculatedAt.setDate(calculatedAt.getDate() - daysAgo)

  const periodStart = new Date(calculatedAt.getTime() - 7 * 24 * 60 * 60 * 1000)
  const periodEnd = new Date(calculatedAt.getTime())

  return createRSRScoreData({
    calculatedAt: calculatedAt.toISOString(),
    calculationPeriodStart: periodStart.toISOString(),
    calculationPeriodEnd: periodEnd.toISOString(),
    ...overrides,
  })
}

