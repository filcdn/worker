import { describe, it, expect } from 'vitest'
import workerImpl from '../bin/indexer.js'
import { env } from 'cloudflare:test'
import { LIVE_PDP_FILE } from './test-data.js'
import { assertOkResponse } from 'assert-ok-response'

const randomId = () => String(Math.ceil(Math.random() * 1e10))

env.SECRET_HEADER_KEY = 'secret-header-key'
env.SECRET_HEADER_VALUE = 'secret-header-value'

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
      expect(proofSets[0].owner).toBe('0xOwnerAddress')
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
  })

  describe('POST /roots-added', () => {
    const CTX = {}

    /** @type {typeof import('../lib/pdp-verifier.js').createPdpVerifierClient} */
    const createDummyPdpVerifierClient = () => {
      return {
        getRootCid(setId, rootId) {
          return 'baga123'
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
        createPdpVerifierClient: createDummyPdpVerifierClient,
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
        createPdpVerifierClient: createDummyPdpVerifierClient,
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
          createPdpVerifierClient: createDummyPdpVerifierClient,
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
          body: JSON.stringify({ set_id: sid, root_ids: '0' }),
        })
        const res = await workerImpl.fetch(req, env, CTX, {
          createPdpVerifierClient: createDummyPdpVerifierClient,
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
  })

  describe('POST /proof-set-rail-created', () => {
    it('returns 400 if property is missing', async () => {
      const req = new Request('https://host/proof-set-rail-created', {
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
      const res = await workerImpl.fetch(req, env)
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('OK')

      const { results: proofSetRails } = await env.DB.prepare(
        'SELECT * FROM indexer_proof_set_rails WHERE proof_set_id = ?',
      )
        .bind(proofSetId)
        .all()
      expect(proofSetRails.length).toBe(1)
      expect(proofSetRails[0].proof_set_id).toBe(proofSetId)
      expect(proofSetRails[0].rail_id).toBe(railId)
      expect(proofSetRails[0].payer).toBe('0xPayerAddress')
      expect(proofSetRails[0].payee).toBe('0xPayeeAddress')
      expect(proofSetRails[0].with_cdn).toBe(1)
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
        const res = await workerImpl.fetch(req, env)
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
      const res = await workerImpl.fetch(req, env)
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
  })
})
