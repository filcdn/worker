import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import { createPdpVerifierClient } from '../lib/pdp-verifier'
import { LIVE_PDP_FILE } from './test-data'

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

  it('can fetch real ProofSet Owner', async () => {
    const pdpVerifier = createPdpVerifierClient({
      rpcUrl: env.RPC_URL,
      glifToken: env.GLIF_TOKEN,
      // Hard-coded to PDPVerifier deployed on calibration testnet
      pdpVerifierAddress: '0x5A23b7df87f59A291C26A2A1d684AD03Ce9B68DC',
    })

    const owner = await pdpVerifier.getProofSetOwner(LIVE_PDP_FILE.setId)
    expect(owner).toBe(LIVE_PDP_FILE.owner)
  })
})
