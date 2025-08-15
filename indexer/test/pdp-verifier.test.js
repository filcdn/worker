import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import { createPdpVerifierClient } from '../lib/pdp-verifier'
import { DELETED_PDP_FILE, LIVE_PDP_FILE } from './test-data'

describe('PDPVerifier client', () => {
  it('can fetch real Root CID', async () => {
    const pdpVerifier = createPdpVerifierClient({
      rpcUrl: env.RPC_URL,
      glifToken: env.GLIF_TOKEN,
      // Hard-coded to PDPVerifier deployed on calibration testnet
      pdpVerifierAddress: '0x5A23b7df87f59A291C26A2A1d684AD03Ce9B68DC',
    })

    const cid = await pdpVerifier.getRootCid(
      LIVE_PDP_FILE.setId,
      LIVE_PDP_FILE.rootId,
    )
    expect(cid).toBe(LIVE_PDP_FILE.cid)
  })

  it('handles removed root', async () => {
    const pdpVerifier = createPdpVerifierClient({
      rpcUrl: env.RPC_URL,
      glifToken: env.GLIF_TOKEN,
      // Hard-coded to PDPVerifier deployed on calibration testnet
      pdpVerifierAddress: '0x5A23b7df87f59A291C26A2A1d684AD03Ce9B68DC',
    })

    const cid = await pdpVerifier.getRootCid(
      DELETED_PDP_FILE.setId,
      DELETED_PDP_FILE.rootId,
    )
    expect(cid).toBe(null)
  })

  describe('encodes block number properly', async () => {
    const tests = [
      { blockNumber: 10, expected: '0xa' },
      { blockNumber: 'latest', expected: 'latest' },
      { blockNumber: 'earliest', expected: 'earliest' },
      { blockNumber: 'pending', expected: 'pending' },
    ]

    const calls = []
    const mockFetch = async (url, { body }) => {
      calls.push({ url, body })

      return {
        ok: true,
        status: 200,
        json: async () => {
          return {
            jsonrpc: '2.0',
            id: 1,
            result:
              '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000270181e2039220203632fbac3e12edd0d8aeab58fd6cbb357c453de8890350532635bd4f46dcfd3e00000000000000000000000000000000000000000000000000',
          }
        },
      }
    }

    const pdpVerifier = createPdpVerifierClient({
      rpcUrl: env.RPC_URL,
      glifToken: env.GLIF_TOKEN,
      pdpVerifierAddress: '0x5A23b7df87f59A291C26A2A1d684AD03Ce9B68DC',
      fetch: mockFetch,
    })

    for (let i = 0; i < tests.length; i++) {
      it(`encode block number ${tests[i].blockNumber}`, async () => {
        await pdpVerifier.getRootCid(
          DELETED_PDP_FILE.setId,
          DELETED_PDP_FILE.rootId,
          tests[i].blockNumber,
        )

        const { params } = JSON.parse(calls[i].body)
        // Check that the block number is encoded as hex in the params
        expect(params[1]).toBe(tests[i].expected)
      })
    }
  })
})
