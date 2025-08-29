import { describe, it, expect, vi, beforeEach } from 'vitest'
import { assertCloseToNow } from './test-helpers.js'
import workerImpl from '../bin/indexer.js'
import { env } from 'cloudflare:test'
import {
  LIVE_PDP_FILE,
  DELETED_PDP_FILE,
  PDP_FILES_BY_SET_ID,
} from './test-data.js'
import { assertOkResponse } from 'assert-ok-response'

const randomId = () => String(Math.ceil(Math.random() * 1e10))

env.SECRET_HEADER_KEY = 'secret-header-key'
env.SECRET_HEADER_VALUE = 'secret-header-value'
env.CHAINALYSIS_API_KEY = 'mock-chainalysis-api-key'

describe('retriever.indexer', () => {
  it('requires authentication', async () => {
    const req = new Request('https://host/', { method: 'POST' })
    const res = await workerImpl.fetch(req, env)
    expect(res.status).toBe(401)
    expect(await res.text()).toBe('Unauthorized')
  })
  it('returns 405 for non-POST requests', async () => {
    const req = new Request('https://host/', {
      method: 'GET',
      headers: {
        [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
      },
    })
    const res = await workerImpl.fetch(req, env)
    expect(res.status).toBe(405)
    expect(await res.text()).toBe('Method Not Allowed')
  })
  describe('POST /proof-set-created', () => {
    it('returns 400 if set_id or owner is missing', async () => {
      const req = new Request('https://host/proof-set-created', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({}),
      })
      const res = await workerImpl.fetch(req, env)
      expect(res.status).toBe(400)
      expect(await res.text()).toBe('Bad Request')
    })
    it('inserts a proof set', async () => {
      const setId = randomId()
      const req = new Request('https://host/proof-set-created', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({ set_id: setId, owner: '0xOwnerAddress' }),
      })
      const res = await workerImpl.fetch(req, env)
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('OK')

      const { results: proofSets } = await env.DB.prepare(
        'SELECT * FROM indexer_proof_sets WHERE set_id = ?',
      )
        .bind(setId)
        .all()
      expect(proofSets.length).toBe(1)
      expect(proofSets[0].set_id).toBe(setId)
      expect(proofSets[0].owner).toBe('0xOwnerAddress'.toLowerCase())
    })
    it('does not insert duplicate proof sets', async () => {
      const setId = randomId()
      for (let i = 0; i < 2; i++) {
        const req = new Request('https://host/proof-set-created', {
          method: 'POST',
          headers: {
            [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
          },
          body: JSON.stringify({ set_id: setId, owner: '0xOwnerAddress' }),
        })
        const res = await workerImpl.fetch(req, env)
        expect(res.status).toBe(200)
        expect(await res.text()).toBe('OK')
      }

      const { results: proofSets } = await env.DB.prepare(
        'SELECT * FROM indexer_proof_sets WHERE set_id = ?',
      )
        .bind(setId)
        .all()
      expect(proofSets.length).toBe(1)
    })
    it('handles set_id as a number', async () => {
      const setId = randomId()
      const req = new Request('https://host/proof-set-created', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({
          set_id: Number(setId),
          owner: '0xOwnerAddress',
        }),
      })
      const res = await workerImpl.fetch(req, env)
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('OK')

      const { results: proofSets } = await env.DB.prepare(
        'SELECT * FROM indexer_proof_sets WHERE set_id = ?',
      )
        .bind(setId)
        .all()
      expect(proofSets.length).toBe(1)
      expect(proofSets[0].set_id).toBe(setId)
      expect(proofSets[0].owner).toBe('0xOwnerAddress'.toLowerCase())
    })
  })

  describe('POST /roots-added', () => {
    const CTX = {}

    /** @type {typeof import('../lib/pdp-verifier.js').createPdpVerifierClient} */
    const createMockPdpVerifierClient = () => {
      return {
        getRootCid(setId, rootId) {
          return PDP_FILES_BY_SET_ID[setId]?.cid || null
        },
      }
    }
    it('returns 400 if set_id or root_ids is missing', async () => {
      const req = new Request('https://host/roots-added', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({}),
      })
      const res = await workerImpl.fetch(req, env, {
        createPdpVerifierClient: createMockPdpVerifierClient,
      })
      expect(res.status).toBe(400)
      expect(await res.text()).toBe('Bad Request')
    })

    it('inserts roots for a proof set', async () => {
      const setId = randomId()
      const rootIds = [randomId(), randomId()]
      const rootCids = [randomId(), randomId()]
      const req = new Request('https://host/roots-added', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({
          set_id: setId,
          root_ids: rootIds.join(','),
          root_cids: rootCids.join(','),
        }),
      })
      const res = await workerImpl.fetch(req, env, CTX, {
        createPdpVerifierClient: createMockPdpVerifierClient,
      })
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('OK')

      const { results: roots } = await env.DB.prepare(
        'SELECT * FROM indexer_roots WHERE set_id = ?',
      )
        .bind(setId)
        .all()
      expect(roots.length).toBe(2)
      expect(roots[0].root_id).toBe(rootIds[0])
      expect(roots[0].set_id).toBe(setId)
      expect(roots[0].root_cid).toBe(rootCids[0])
      expect(roots[1].root_id).toBe(rootIds[1])
      expect(roots[1].set_id).toBe(setId)
      expect(roots[1].root_cid).toBe(rootCids[1])
    })

    it('does not insert duplicate roots for the same proof set', async () => {
      const setId = randomId()
      const rootIds = [randomId(), randomId()]
      const rootCids = [randomId(), randomId()]
      for (let i = 0; i < 2; i++) {
        const req = new Request('https://host/roots-added', {
          method: 'POST',
          headers: {
            [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
          },
          body: JSON.stringify({
            set_id: setId,
            root_ids: rootIds.join(','),
            root_cids: rootCids.join(','),
          }),
        })
        const res = await workerImpl.fetch(req, env, CTX, {
          createPdpVerifierClient: createMockPdpVerifierClient,
        })
        expect(res.status).toBe(200)
        expect(await res.text()).toBe('OK')
      }

      const { results: roots } = await env.DB.prepare(
        'SELECT * FROM indexer_roots WHERE set_id = ?',
      )
        .bind(setId)
        .all()
      expect(roots.length).toBe(2)
    })

    it('allows multiple sets to have the same root id', async () => {
      const setIds = [randomId(), randomId()]
      setIds.sort()

      for (const sid of setIds) {
        const req = new Request('https://host/roots-added', {
          method: 'POST',
          headers: {
            [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
          },
          body: JSON.stringify({
            set_id: sid,
            root_ids: '0',
            root_cids: randomId(),
          }),
        })
        const res = await workerImpl.fetch(req, env, CTX, {
          createPdpVerifierClient: createMockPdpVerifierClient,
        })
        const body = await res.text()
        expect(`${res.status} ${body}`).toBe('200 OK')
      }

      const { results: roots } = await env.DB.prepare(
        'SELECT set_id, root_id FROM indexer_roots WHERE set_id = ? OR set_id = ? ORDER BY set_id',
      )
        .bind(setIds[0], setIds[1])
        .all()

      expect(roots).toEqual([
        {
          set_id: setIds[0],
          root_id: '0',
        },
        {
          set_id: setIds[1],
          root_id: '0',
        },
      ])
    })

    it('adds a real live root and fetches the root CID from on-chain state', async () => {
      const req = new Request('https://host/roots-added', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({
          set_id: LIVE_PDP_FILE.setId.toString(),
          root_ids: LIVE_PDP_FILE.rootId.toString(),
          root_cids: undefined,
        }),
      })
      const res = await workerImpl.fetch(req, env)
      await assertOkResponse(res)

      const { results: roots } = await env.DB.prepare(
        'SELECT root_id, root_cid FROM indexer_roots WHERE set_id = ?',
      )
        .bind(LIVE_PDP_FILE.setId.toString())
        .all()

      expect(roots).toEqual([
        {
          root_id: LIVE_PDP_FILE.rootId.toString(),
          root_cid: LIVE_PDP_FILE.cid,
        },
      ])
    })

    it('ignores root when on-chain state does not have a live root', async () => {
      const req = new Request('https://host/roots-added', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({
          set_id: DELETED_PDP_FILE.setId.toString(),
          root_ids: DELETED_PDP_FILE.rootId.toString(),
          root_cids: undefined,
        }),
      })
      const res = await workerImpl.fetch(req, env, {
        createPdpVerifierClient: createMockPdpVerifierClient,
      })
      await assertOkResponse(res)

      const { results: roots } = await env.DB.prepare(
        'SELECT root_id, root_cid FROM indexer_roots WHERE set_id = ?',
      )
        .bind(DELETED_PDP_FILE.setId.toString())
        .all()

      expect(roots).toEqual([
        {
          root_id: DELETED_PDP_FILE.rootId.toString(),
          root_cid: DELETED_PDP_FILE.cid,
        },
      ])
    })
  })

  describe('POST /roots-removed', () => {
    const CTX = {}
    it('returns 400 if set_id or root_ids is missing', async () => {
      const req = new Request('https://host/roots-removed', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({}),
      })
      const res = await workerImpl.fetch(req, env, {})
      expect(res.status).toBe(400)
      expect(await res.text()).toBe('Bad Request')
    })

    it('deletes roots for a proof set', async () => {
      const setId = randomId()
      const rootIds = [randomId(), randomId()]
      const rootCids = [randomId(), randomId()]
      const req = new Request('https://host/roots-removed', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({
          set_id: setId,
          root_ids: rootIds.join(','),
        }),
      })

      await withRoots(env, setId, rootIds, rootCids)
      const res = await workerImpl.fetch(req, env, CTX, {})
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('OK')

      const { results: roots } = await env.DB.prepare(
        'SELECT * FROM indexer_roots WHERE set_id = ?',
      )
        .bind(setId)
        .all()
      expect(roots.length).toBe(0)
    })
  })

  describe('POST /proof-set-rail-created', () => {
    const ctx = {}
    env.RETRY_QUEUE = {
      send: vi.fn(),
      retry: vi.fn(),
    }
    const mockCheckIfAddressIsSanctioned = vi.fn()

    beforeEach(() => {
      // Reset mocks before each test
      vi.resetAllMocks()
    })

    it('returns 400 if property is missing', async () => {
      const req = new Request('https://host/proof-set-rail-created', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({}),
      })
      const res = await workerImpl.fetch(req, env, ctx, {
        checkIfAddressIsSanctioned: mockCheckIfAddressIsSanctioned,
      })
      expect(res.status).toBe(400)
      expect(await res.text()).toBe('Bad Request')
    })
    it('inserts a proof set rail', async () => {
      const proofSetId = randomId()
      const railId = randomId()
      const req = new Request('https://host/proof-set-rail-created', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({
          proof_set_id: proofSetId,
          rail_id: railId,
          payer: '0xPayerAddress',
          payee: '0xPayeeAddress',
          with_cdn: true,
        }),
      })

      mockCheckIfAddressIsSanctioned.mockResolvedValueOnce(false)
      const res = await workerImpl.fetch(req, env, ctx, {
        checkIfAddressIsSanctioned: mockCheckIfAddressIsSanctioned,
      })
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('OK')

      const { results: proofSetRails } = await env.DB.prepare(
        'SELECT * FROM indexer_proof_set_rails WHERE proof_set_id = ?',
      )
        .bind(proofSetId)
        .all()

      const { results: walletDetails } = await env.DB.prepare(
        'SELECT * FROM wallet_details WHERE address = ?',
      )
        .bind('0xPayerAddress')
        .all()

      expect(proofSetRails.length).toBe(1)
      expect(proofSetRails[0].proof_set_id).toBe(proofSetId)
      expect(proofSetRails[0].rail_id).toBe(railId)
      expect(proofSetRails[0].payer).toBe('0xPayerAddress')
      expect(proofSetRails[0].payee).toBe('0xPayeeAddress')
      expect(proofSetRails[0].with_cdn).toBe(1)

      expect(walletDetails.length).toBe(1)
      expect(walletDetails[0].is_sanctioned).toBe(0)
      assertCloseToNow(walletDetails[0].last_screened_at)
    })
    it('does not insert duplicate proof set rails', async () => {
      const proofSetId = randomId()
      const railId = randomId()
      for (let i = 0; i < 2; i++) {
        const req = new Request('https://host/proof-set-rail-created', {
          method: 'POST',
          headers: {
            [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
          },
          body: JSON.stringify({
            proof_set_id: proofSetId,
            rail_id: railId,
            payer: '0xPayerAddress',
            payee: '0xPayeeAddress',
            with_cdn: true,
          }),
        })
        mockCheckIfAddressIsSanctioned.mockResolvedValueOnce(false)
        const res = await workerImpl.fetch(req, env, ctx, {
          checkIfAddressIsSanctioned: mockCheckIfAddressIsSanctioned,
        })
        expect(res.status).toBe(200)
        expect(await res.text()).toBe('OK')
      }

      const { results: proofSetRails } = await env.DB.prepare(
        'SELECT * FROM indexer_proof_set_rails WHERE proof_set_id = ? AND rail_id = ?',
      )
        .bind(proofSetId, railId)
        .all()
      expect(proofSetRails.length).toBe(1)
    })
    it('defaults to with_cdn = null if not provided', async () => {
      const proofSetId = randomId()
      const railId = randomId()
      const req = new Request('https://host/proof-set-rail-created', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({
          proof_set_id: proofSetId,
          rail_id: railId,
          payer: '0xPayerAddress',
          payee: '0xPayeeAddress',
        }),
      })
      const res = await workerImpl.fetch(req, env, ctx, {
        checkIfAddressIsSanctioned: mockCheckIfAddressIsSanctioned,
      })
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('OK')

      const { results: proofSetRails } = await env.DB.prepare(
        'SELECT * FROM indexer_proof_set_rails WHERE proof_set_id = ? AND rail_id = ?',
      )
        .bind(proofSetId, railId)
        .all()
      expect(proofSetRails.length).toBe(1)
      expect(proofSetRails[0].with_cdn).toBeNull()
    })

    it('stores numeric ID values as integers', async () => {
      const proofSetId = Number(randomId())
      const railId = Number(randomId())
      const req = new Request('https://host/proof-set-rail-created', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({
          proof_set_id: proofSetId,
          rail_id: railId,
          payer: '0xPayerAddress',
          payee: '0xPayeeAddress',
          with_cdn: true,
        }),
      })
      mockCheckIfAddressIsSanctioned.mockResolvedValueOnce(false)
      const res = await workerImpl.fetch(req, env, ctx, {
        checkIfAddressIsSanctioned: mockCheckIfAddressIsSanctioned,
      })
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('OK')

      const { results: proofSetRails } = await env.DB.prepare(
        'SELECT * FROM indexer_proof_set_rails WHERE proof_set_id = ? AND rail_id = ?',
      )
        .bind(String(proofSetId), String(railId))
        .all()
      expect(proofSetRails.length).toBe(1)
      expect(proofSetRails[0]?.proof_set_id).toMatch(/^\d+$/)
      expect(proofSetRails[0]?.rail_id).toMatch(/^\d+$/)
    })

    it('checks if payer address is sanctioned when with_cdn = true', async () => {
      const proofSetId = randomId()
      const railId = randomId()

      // send first request with with_cdn = true
      let req = new Request('https://host/proof-set-rail-created', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({
          proof_set_id: proofSetId,
          rail_id: railId,
          payer: '0xPayerAddress',
          payee: '0xPayeeAddress',
          with_cdn: true,
        }),
      })

      mockCheckIfAddressIsSanctioned.mockResolvedValue(true)
      let res = await workerImpl.fetch(req, env, ctx, {
        checkIfAddressIsSanctioned: mockCheckIfAddressIsSanctioned,
      })
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('OK')

      // send second request with with_cdn = false
      req = new Request('https://host/proof-set-rail-created', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({
          proof_set_id: randomId(),
          rail_id: randomId(),
          payer: '0xPayerAddress',
          payee: '0xPayeeAddress',
          with_cdn: false,
        }),
      })
      res = await workerImpl.fetch(req, env, ctx, {
        checkIfAddressIsSanctioned: mockCheckIfAddressIsSanctioned,
      })
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('OK')

      // Verify that the sanction check was called only once
      expect(mockCheckIfAddressIsSanctioned).toHaveBeenCalledTimes(1)
      expect(mockCheckIfAddressIsSanctioned).toHaveBeenCalledWith(
        '0xPayerAddress',
        {
          CHAINALYSIS_API_KEY: env.CHAINALYSIS_API_KEY,
        },
      )

      const { results: proofSetRails } = await env.DB.prepare(
        'SELECT * FROM indexer_proof_set_rails WHERE proof_set_id = ?',
      )
        .bind(proofSetId)
        .all()

      const { results: walletDetails } = await env.DB.prepare(
        'SELECT * FROM wallet_details WHERE address = ?',
      )
        .bind('0xPayerAddress')
        .all()

      expect(proofSetRails.length).toBe(1)
      expect(proofSetRails[0].payer).toBe('0xPayerAddress')

      expect(walletDetails.length).toBe(1)
      expect(walletDetails[0].address).toBe('0xPayerAddress')
      expect(walletDetails[0].is_sanctioned).toBe(1)
    })

    it('updates is_sanctioned status of existing wallet', async () => {
      // When the wallet creates the first ProofSet, it's not sanctioned yet
      let req = new Request('https://host/proof-set-rail-created', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({
          proof_set_id: randomId(),
          rail_id: randomId(),
          payer: '0xPayerAddress',
          payee: '0xPayeeAddress',
          with_cdn: true,
        }),
      })

      mockCheckIfAddressIsSanctioned.mockResolvedValue(false)
      let res = await workerImpl.fetch(req, env, ctx, {
        checkIfAddressIsSanctioned: mockCheckIfAddressIsSanctioned,
      })
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('OK')

      const { results: initialWalletDetails } = await env.DB.prepare(
        'SELECT * FROM wallet_details WHERE address = ?',
      )
        .bind('0xPayerAddress')
        .all()
      expect(initialWalletDetails.length).toBe(1)
      expect(initialWalletDetails[0].address).toBe('0xPayerAddress')
      expect(initialWalletDetails[0].is_sanctioned).toBe(0)
      assertCloseToNow(initialWalletDetails[0].last_screened_at)

      // When the wallet creates the second ProofSet some time later,
      // it's flagged as sanctioned

      await env.DB.exec(
        'UPDATE wallet_details SET last_screened_at = datetime("now", "-1 day")',
      )
      mockCheckIfAddressIsSanctioned.mockResolvedValue(true)
      req = new Request('https://host/proof-set-rail-created', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({
          proof_set_id: randomId(),
          rail_id: randomId(),
          payer: '0xPayerAddress',
          payee: '0xPayeeAddress',
          with_cdn: true,
        }),
      })
      res = await workerImpl.fetch(req, env, ctx, {
        checkIfAddressIsSanctioned: mockCheckIfAddressIsSanctioned,
      })
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('OK')

      const { results: walletDetails } = await env.DB.prepare(
        'SELECT * FROM wallet_details WHERE address = ?',
      )
        .bind('0xPayerAddress')
        .all()

      expect(walletDetails.length).toBe(1)
      expect(walletDetails[0].address).toBe('0xPayerAddress')
      expect(walletDetails[0].is_sanctioned).toBe(1)
      assertCloseToNow(walletDetails[0].last_screened_at)
    })

    it('sends message to queue if sanction check fails', async () => {
      const proofSetId = randomId()
      const railId = randomId()
      const payload = {
        proof_set_id: proofSetId,
        rail_id: railId,
        payer: '0xPayerAddress',
        payee: '0xPayeeAddress',
        with_cdn: true,
      }
      const req = new Request('https://host/proof-set-rail-created', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify(payload),
      })
      const res = await workerImpl.fetch(req, env, ctx, {
        checkIfAddressIsSanctioneded: async (apiKey, address) => {
          throw Error('fail')
        },
      })
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('OK')

      expect(env.RETRY_QUEUE.send).toHaveBeenCalledTimes(1)
      expect(env.RETRY_QUEUE.send).toHaveBeenCalledWith({
        type: 'proof-set-rail-created',
        payload,
      })

      const { results: proofSetRails } = await env.DB.prepare(
        'SELECT * FROM indexer_proof_set_rails WHERE proof_set_id = ?',
      )
        .bind(proofSetId)
        .all()
      expect(proofSetRails.length).toBe(0)
    })
  })
  describe('POST /provider-registered', () => {
    it('returns 400 if provider_url and owner are missing', async () => {
      const req = new Request('https://host/provider-registered', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({}),
      })
      const res = await workerImpl.fetch(req, env)
      expect(res.status).toBe(400)
      expect(await res.text()).toBe('Bad Request')
    })
    it('inserts a provider URL', async () => {
      const pieceRetrievalUrl = 'https://provider.example.com'
      const provider = '0x5A23b7df87f59A291C26A2A1d684AD03Ce9B68DC'
      const req = new Request('https://host/provider-registered', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({
          provider,
          piece_retrieval_url: pieceRetrievalUrl,
        }),
      })
      const res = await workerImpl.fetch(req, env)
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('OK')

      const { results: providerUrls } = await env.DB.prepare(
        'SELECT * FROM provider_urls WHERE address = ?',
      )
        .bind(provider.toLowerCase())
        .all()
      expect(providerUrls.length).toBe(1)
      expect(providerUrls[0].address).toBe(provider.toLowerCase())
      expect(providerUrls[0].piece_retrieval_url).toBe(pieceRetrievalUrl)
    })
  })
  it('updates pdp URLs for an existing provider', async () => {
    const pieceRetrievalUrl = 'https://provider.example.com'
    const provider = '0x5A23b7df87f59A291C26A2A1d684AD03Ce9B68DC'
    const newpieceRetrievalUrl = 'https://new-provider.example.com'

    // First insert the initial provider URL
    let req = new Request('https://host/provider-registered', {
      method: 'POST',
      headers: {
        [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
      },
      body: JSON.stringify({
        provider,
        piece_retrieval_url: pieceRetrievalUrl,
      }),
    })
    let res = await workerImpl.fetch(req, env)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('OK')

    // Now update the provider URL
    req = new Request('https://host/provider-registered', {
      method: 'POST',
      headers: {
        [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
      },
      body: JSON.stringify({
        provider,
        piece_retrieval_url: newpieceRetrievalUrl,
      }),
    })
    res = await workerImpl.fetch(req, env)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('OK')

    const { results: providerUrls } = await env.DB.prepare(
      'SELECT * FROM provider_urls WHERE address = ?',
    )
      .bind(provider.toLowerCase())
      .all()
    expect(providerUrls.length).toBe(1)
    expect(providerUrls[0].address).toBe(provider.toLowerCase())
    expect(providerUrls[0].piece_retrieval_url).toBe(newpieceRetrievalUrl)
  })
  it('stores provider with lower case', async () => {
    const provider = '0x5A23b7df87f59A291C26A2A1d684AD03Ce9B68DC'
    const pieceRetrievalUrl = 'https://provider.example.com'

    const req = new Request('https://host/provider-registered', {
      method: 'POST',
      headers: {
        [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
      },
      body: JSON.stringify({
        provider,
        piece_retrieval_url: pieceRetrievalUrl,
      }),
    })
    const res = await workerImpl.fetch(req, env)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('OK')

    const { results: providerUrls } = await env.DB.prepare(
      'SELECT * FROM provider_urls WHERE address = ?',
    )
      .bind(provider.toLowerCase())
      .all()
    expect(providerUrls.length).toBe(1)
    expect(providerUrls[0].address).toBe(provider.toLowerCase())
    expect(providerUrls[0].piece_retrieval_url).toBe(pieceRetrievalUrl)
  })
  it('returns 400 on invalid URL', async () => {
    const provider = '0x5A23b7df87f59A291C26A2A1d684AD03Ce9B68DC'
    const pieceRetrievalUrl = 'INVALID_URL'

    const req = new Request('https://host/provider-registered', {
      method: 'POST',
      headers: {
        [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
      },
      body: JSON.stringify({
        provider: provider.toUpperCase(),
        piece_retrieval_url: pieceRetrievalUrl,
      }),
    })
    const res = await workerImpl.fetch(req, env)
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('Bad Request')
  })
  it('returns 400 when piece_retrieval_url is not a string', async () => {
    const provider = '0x5A23b7df87f59A291C26A2A1d684AD03Ce9B68DC'

    // Test with various non-string URL values
    const invalidUrls = [
      123, // Number
      true, // Boolean
      null, // Null
      undefined, // Undefined
      { url: 'https://provider.example.com' }, // Object
      ['https://provider.example.com'], // Array
    ]

    for (const invalidUrl of invalidUrls) {
      const req = new Request('https://host/provider-registered', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({
          provider,
          piece_retrieval_url: invalidUrl,
        }),
      })
      const res = await workerImpl.fetch(req, env)
      expect(res.status).toBe(
        400,
        `Expected 400 for invalid URL type: ${typeof invalidUrl}`,
      )
      expect(await res.text()).toBe('Bad Request')
    }
  })
  it('returns 400 when provider is an invalid Ethereum address', async () => {
    testInvalidValidEthereumAddress('provider-registered')
  })
  describe('POST /provider-removed', () => {
    it('returns 400 if provider is missing', async () => {
      const req = new Request('https://host/provider-removed', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({}),
      })
      const res = await workerImpl.fetch(req, env)
      expect(res.status).toBe(400)
      expect(await res.text()).toBe('Bad Request')
    })

    it('removes a provider from the provider_urls table', async () => {
      const provider = '0x5A23b7df87f59A291C26A2A1d684AD03Ce9B68DC'

      // First, insert a provider
      const insertReq = new Request('https://host/provider-registered', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({
          provider,
          piece_retrieval_url: 'https://provider.example.com',
        }),
      })
      const insertRes = await workerImpl.fetch(insertReq, env)
      expect(insertRes.status).toBe(200)
      expect(await insertRes.text()).toBe('OK')

      // Now, remove the provider
      const removeReq = new Request('https://host/provider-removed', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({
          provider,
        }),
      })
      const removeRes = await workerImpl.fetch(removeReq, env)
      expect(removeRes.status).toBe(200)
      expect(await removeRes.text()).toBe('OK')

      // Verify that the provider is removed from the database
      const { results: ownerUrls } = await env.DB.prepare(
        'SELECT * FROM provider_urls WHERE address =?',
      )
        .bind(provider)
        .all()
      expect(ownerUrls.length).toBe(0) // The provider should be removed
    })

    it('returns 404 if the provider does not exist', async () => {
      const nonExistentProvider = '0x5A23b7df87f59A291C26A2A1d684AD03Ce9B68DC'
      const req = new Request('https://host/provider-removed', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({
          provider: nonExistentProvider,
        }),
      })
      const res = await workerImpl.fetch(req, env)
      expect(res.status).toBe(404)
      expect(await res.text()).toBe('Provider Not Found')
    })
    it('returns 400 when provider is an invalid Ethereum address', async () => {
      await testInvalidValidEthereumAddress('provider-removed')
    })
  })
})

async function testInvalidValidEthereumAddress(route, providerUrl) {
  const invalidAddresses = [
    'not-an-address', // Not hex
    '0x123', // Too short
    '0xinvalid', // Invalid hex
    '0x5A23b7df87f59A291C26A2A1d684AD03Ce9B68', // Too short (40 chars needed after 0x)
    '0x5A23b7df87f59A291C26A2A1d684AD03Ce9B68DCZZ', // Too long
    '12345678901234567890123456789012345678901', // No 0x prefix
  ]

  for (const invalidAddress of invalidAddresses) {
    const requestBody = {
      provider: invalidAddress,
    }
    if (providerUrl) requestBody.piece_retrieval_url = providerUrl
    const req = new Request(`https://host/${route}`, {
      method: 'POST',
      headers: {
        [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
      },
      body: JSON.stringify(requestBody),
    })
    const res = await workerImpl.fetch(req, env)
    expect(res.status).toBe(
      400,
      `Expected 400 for invalid address: ${invalidAddress}`,
    )
    expect(await res.text()).toBe('Bad Request')
  }
}

async function withRoots(env, setId, rootIds, rootCids) {
  await env.DB.prepare(
    `
    INSERT INTO indexer_roots (
      root_id,
      set_id,
      root_cid
    )
    VALUES ${new Array(rootIds.length)
      .fill(null)
      .map(() => '(?, ?, ?)')
      .join(', ')}
    ON CONFLICT DO NOTHING
  `,
  )
    .bind(
      ...rootIds.flatMap((rootId, i) => [
        String(rootId),
        String(setId),
        rootCids[i],
      ]),
    )
    .run()
}
