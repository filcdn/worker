import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  storeRSRScore,
  storeRSRScoresBatch,
  getLatestRSRScore,
  getRSRScoresForProviders,
  getAllLatestRSRScores,
  cleanupOldRSRScores,
} from '../lib/rsr-score-storage.js'
import {
  createRSRScoreData,
  createMultipleRSRScoreData,
  createHighPerformingProviderScore,
  createLowPerformingProviderScore,
  createMinimalProviderScore,
  createHistoricalRSRScore,
} from './rsr-score-test-data.js'

describe('RSR Score Storage', () => {
  let mockEnv
  let mockDB
  let mockStmt
  let mockBatch

  beforeEach(() => {
    mockStmt = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
      first: vi.fn().mockResolvedValue(null),
      all: vi.fn().mockResolvedValue({ results: [] }),
    }

    mockBatch = vi.fn().mockResolvedValue({})

    mockDB = {
      prepare: vi.fn().mockReturnValue(mockStmt),
      batch: mockBatch,
    }

    mockEnv = {
      DB: mockDB,
    }
  })

  describe('storeRSRScore', () => {
    it('should store a single RSR score successfully', async () => {
      const scoreData = createRSRScoreData()

      await storeRSRScore(mockEnv, scoreData)

      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO provider_rsr_scores')
      )
      expect(mockStmt.bind).toHaveBeenCalledWith(
        '0x1234567890123456789012345678901234567890',
        0.85,
        '2025-01-27T10:00:00.000Z',
        '2025-01-20T00:00:00.000Z',
        '2025-01-27T00:00:00.000Z',
        1000,
        850,
        250.5,
        150.2,
        300.8,
        0.85,
        0.75,
      )
      expect(mockStmt.run).toHaveBeenCalled()
    })

    it('should handle null optional values', async () => {
      const scoreData = createMinimalProviderScore()

      await storeRSRScore(mockEnv, scoreData)

      expect(mockStmt.bind).toHaveBeenCalledWith(
        '0x1234567890123456789012345678901234567890',
        0.75,
        '2025-01-27T10:00:00.000Z',
        '2025-01-20T00:00:00.000Z',
        '2025-01-27T00:00:00.000Z',
        500,
        375,
        null,
        null,
        null,
        null,
        null,
      )
    })

    it('should handle database errors', async () => {
      const scoreData = createRSRScoreData()

      const dbError = new Error('Database connection failed')
      mockStmt.run.mockRejectedValue(dbError)

      await expect(storeRSRScore(mockEnv, scoreData)).rejects.toThrow('Database connection failed')
    })
  })

  describe('storeRSRScoresBatch', () => {
    it('should store multiple RSR scores in batch', async () => {
      const scoresData = createMultipleRSRScoreData(2)

      await storeRSRScoresBatch(mockEnv, scoresData)

      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO provider_rsr_scores')
      )
      expect(mockBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ bind: expect.any(Function) }),
          expect.objectContaining({ bind: expect.any(Function) }),
        ])
      )
    })

    it('should handle empty batch gracefully', async () => {
      await storeRSRScoresBatch(mockEnv, [])

      expect(mockDB.prepare).not.toHaveBeenCalled()
      expect(mockBatch).not.toHaveBeenCalled()
    })

    it('should handle null batch gracefully', async () => {
      await storeRSRScoresBatch(mockEnv, null)

      expect(mockDB.prepare).not.toHaveBeenCalled()
      expect(mockBatch).not.toHaveBeenCalled()
    })

    it('should handle batch with high and low performing providers', async () => {
      const scoresData = [
        createHighPerformingProviderScore(),
        createLowPerformingProviderScore(),
        createMinimalProviderScore(),
      ]

      await storeRSRScoresBatch(mockEnv, scoresData)

      expect(mockBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ bind: expect.any(Function) }),
          expect.objectContaining({ bind: expect.any(Function) }),
          expect.objectContaining({ bind: expect.any(Function) }),
        ])
      )
    })
  })

  describe('getLatestRSRScore', () => {
    it('should retrieve the latest RSR score for a provider', async () => {
      const mockScore = {
        providerAddress: '0x1234567890123456789012345678901234567890',
        score: 0.85,
        calculatedAt: '2025-01-27T10:00:00.000Z',
        calculationPeriodStart: '2025-01-20T00:00:00.000Z',
        calculationPeriodEnd: '2025-01-27T00:00:00.000Z',
        totalRequests: 1000,
        successfulRequests: 850,
        avgResponseTimeMs: 250.5,
        avgTtfbMs: 150.2,
        avgTtlbMs: 300.8,
        reliabilityScore: 0.85,
        performanceScore: 0.75,
      }

      mockStmt.first.mockResolvedValue(mockScore)

      const result = await getLatestRSRScore(mockEnv, '0x1234567890123456789012345678901234567890')

      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('SELECT')
      )
      expect(mockStmt.bind).toHaveBeenCalledWith('0x1234567890123456789012345678901234567890')
      expect(result).toEqual(mockScore)
    })

    it('should return null when no score is found', async () => {
      mockStmt.first.mockResolvedValue(null)

      const result = await getLatestRSRScore(mockEnv, '0x1234567890123456789012345678901234567890')

      expect(result).toBeNull()
    })
  })

  describe('getRSRScoresForProviders', () => {
    it('should retrieve scores for multiple providers', async () => {
      const mockScores = [
        {
          providerAddress: '0x1111111111111111111111111111111111111111',
          score: 0.90,
          calculatedAt: '2025-01-27T10:00:00.000Z',
        },
        {
          providerAddress: '0x2222222222222222222222222222222222222222',
          score: 0.75,
          calculatedAt: '2025-01-27T10:00:00.000Z',
        },
      ]

      mockStmt.all.mockResolvedValue({ results: mockScores })

      const providerAddresses = [
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
      ]

      const result = await getRSRScoresForProviders(mockEnv, providerAddresses)

      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE provider_address IN (?, ?)')
      )
      expect(mockStmt.bind).toHaveBeenCalledWith(
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222'
      )
      expect(result).toEqual(mockScores)
    })

    it('should handle time range filters', async () => {
      mockStmt.all.mockResolvedValue({ results: [] })

      const providerAddresses = ['0x1111111111111111111111111111111111111111']
      const startTime = '2025-01-20T00:00:00.000Z'
      const endTime = '2025-01-27T00:00:00.000Z'

      await getRSRScoresForProviders(mockEnv, providerAddresses, startTime, endTime)

      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('AND calculated_at >= ?')
      )
      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('AND calculated_at <= ?')
      )
      expect(mockStmt.bind).toHaveBeenCalledWith(
        '0x1111111111111111111111111111111111111111',
        startTime,
        endTime
      )
    })
  })

  describe('getAllLatestRSRScores', () => {
    it('should retrieve all latest RSR scores', async () => {
      const mockScores = [
        {
          providerAddress: '0x1111111111111111111111111111111111111111',
          score: 0.90,
          calculatedAt: '2025-01-27T10:00:00.000Z',
        },
        {
          providerAddress: '0x2222222222222222222222222222222222222222',
          score: 0.75,
          calculatedAt: '2025-01-27T10:00:00.000Z',
        },
      ]

      mockStmt.all.mockResolvedValue({ results: mockScores })

      const result = await getAllLatestRSRScores(mockEnv)

      expect(mockDB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE (provider_address, calculated_at) IN')
      )
      expect(result).toEqual(mockScores)
    })
  })

  describe('cleanupOldRSRScores', () => {
    it('should delete old RSR scores beyond retention period', async () => {
      mockStmt.run.mockResolvedValue({ meta: { changes: 5 } })

      const deletedCount = await cleanupOldRSRScores(mockEnv, 90)

      expect(mockDB.prepare).toHaveBeenCalledWith(
        'DELETE FROM provider_rsr_scores WHERE calculated_at < ?'
      )
      expect(mockStmt.bind).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/))
      expect(deletedCount).toBe(5)
    })

    it('should use default retention period when not specified', async () => {
      mockStmt.run.mockResolvedValue({ meta: { changes: 3 } })

      const deletedCount = await cleanupOldRSRScores(mockEnv)

      expect(deletedCount).toBe(3)
    })

    it('should handle cleanup with custom retention period', async () => {
      mockStmt.run.mockResolvedValue({ meta: { changes: 10 } })

      const deletedCount = await cleanupOldRSRScores(mockEnv, 30)

      expect(mockDB.prepare).toHaveBeenCalledWith(
        'DELETE FROM provider_rsr_scores WHERE calculated_at < ?'
      )
      expect(deletedCount).toBe(10)
    })
  })

  describe('Integration scenarios', () => {
    it('should handle complete workflow: store, retrieve, and cleanup', async () => {
      // Store a score
      const scoreData = createRSRScoreData()
      await storeRSRScore(mockEnv, scoreData)

      // Retrieve the score
      const mockRetrievedScore = { ...scoreData }
      mockStmt.first.mockResolvedValue(mockRetrievedScore)
      const retrieved = await getLatestRSRScore(mockEnv, scoreData.providerAddress)

      expect(retrieved).toEqual(mockRetrievedScore)

      // Cleanup old scores
      mockStmt.run.mockResolvedValue({ meta: { changes: 1 } })
      const deletedCount = await cleanupOldRSRScores(mockEnv, 1)

      expect(deletedCount).toBe(1)
    })

    it('should handle batch operations with mixed data quality', async () => {
      const scoresData = [
        createHighPerformingProviderScore(),
        createLowPerformingProviderScore(),
        createMinimalProviderScore(),
        createHistoricalRSRScore(30), // 30 days old
        createHistoricalRSRScore(1),  // 1 day old
      ]

      await storeRSRScoresBatch(mockEnv, scoresData)

      expect(mockBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ bind: expect.any(Function) }),
          expect.objectContaining({ bind: expect.any(Function) }),
          expect.objectContaining({ bind: expect.any(Function) }),
          expect.objectContaining({ bind: expect.any(Function) }),
          expect.objectContaining({ bind: expect.any(Function) }),
        ])
      )
    })
  })
})
