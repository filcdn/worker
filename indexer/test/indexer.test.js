import { describe, it, expect, vi, beforeEach } from 'vitest'
import workerImpl from '../bin/indexer.js'
import { env } from 'cloudflare:test'
import {
  LIVE_PDP_FILE,
  DELETED_PDP_FILE,
  PDP_FILES_BY_DATA_SET_ID,
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
  describe('POST /pdp-verifier/data-set-created', () => {
    it('returns 400 if set_id or owner is missing', async () => {
      const req = new Request('https://host/pdp-verifier/data-set-created', {
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
    it('inserts a data set', async () => {
      const dataSetId = randomId()
      const req = new Request('https://host/pdp-verifier/data-set-created', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({
          set_id: dataSetId,
          storage_provider: '0xAddress',
        }),
      })
      const res = await workerImpl.fetch(req, env)
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('OK')

      const { results: dataSets } = await env.DB.prepare(
        'SELECT * FROM data_sets WHERE id = ?',
      )
        .bind(dataSetId)
        .all()
      expect(dataSets.length).toBe(1)
      expect(dataSets[0].id).toBe(dataSetId)
      expect(dataSets[0].storage_provider).toBe('0xAddress'.toLowerCase())
    })
    it('does not insert duplicate data sets', async () => {
      const dataSetId = randomId()
      for (let i = 0; i < 2; i++) {
        const req = new Request('https://host/pdp-verifier/data-set-created', {
          method: 'POST',
          headers: {
            [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
          },
          body: JSON.stringify({
            set_id: dataSetId,
            storage_provider: '0xAddress',
          }),
        })
        const res = await workerImpl.fetch(req, env)
        expect(res.status).toBe(200)
        expect(await res.text()).toBe('OK')
      }

      const { results: dataSets } = await env.DB.prepare(
        'SELECT * FROM data_sets WHERE id = ?',
      )
        .bind(dataSetId)
        .all()
      expect(dataSets.length).toBe(1)
    })
    it('handles data set id as a number', async () => {
      const dataSetId = randomId()
      const req = new Request('https://host/pdp-verifier/data-set-created', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({
          set_id: Number(dataSetId),
          storage_provider: '0xAddress',
        }),
      })
      const res = await workerImpl.fetch(req, env)
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('OK')

      const { results: dataSets } = await env.DB.prepare(
        'SELECT * FROM data_sets WHERE id = ?',
      )
        .bind(dataSetId)
        .all()
      expect(dataSets.length).toBe(1)
      expect(dataSets[0].id).toBe(dataSetId)
      expect(dataSets[0].storage_provider).toBe('0xAddress'.toLowerCase())
    })
  })

  describe('POST /pdp-verifier/pieces-added', () => {
    const CTX = {}

    /** @type {typeof import('../lib/pdp-verifier.js').createPdpVerifierClient} */
    const createMockPdpVerifierClient = () => {
      return {
        getPieceCid(dataSetId, pieceId) {
          return PDP_FILES_BY_DATA_SET_ID[dataSetId]?.cid || null
        },
      }
    }
    it('returns 400 if set_id or piece_ids is missing', async () => {
      const req = new Request('https://host/pdp-verifier/pieces-added', {
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

    it('inserts pieces for a data set', async () => {
      const dataSetId = randomId()
      const pieceIds = [randomId(), randomId()]
      const pieceCids = [randomId(), randomId()]
      const req = new Request('https://host/pdp-verifier/pieces-added', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({
          set_id: dataSetId,
          piece_ids: pieceIds.join(','),
          piece_cids: pieceCids.join(','),
        }),
      })
      const res = await workerImpl.fetch(req, env, CTX, {
        createPdpVerifierClient: createMockPdpVerifierClient,
      })
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('OK')

      const { results: pieces } = await env.DB.prepare(
        'SELECT * FROM pieces WHERE data_set_id = ?',
      )
        .bind(dataSetId)
        .all()
      expect(pieces.length).toBe(2)
      expect(pieces[0].piece_id).toBe(pieceIds[0])
      expect(pieces[0].data_set_id).toBe(dataSetId)
      expect(pieces[0].piece_cid).toBe(pieceCids[0])
      expect(pieces[1].piece_id).toBe(pieceIds[1])
      expect(pieces[1].data_set_id).toBe(dataSetId)
      expect(pieces[1].piece_cid).toBe(pieceCids[1])
    })

    it('does not insert duplicate pieces for the same data set', async () => {
      const dataSetId = randomId()
      const pieceIds = [randomId(), randomId()]
      const pieceCids = [randomId(), randomId()]
      for (let i = 0; i < 2; i++) {
        const req = new Request('https://host/pdp-verifier/pieces-added', {
          method: 'POST',
          headers: {
            [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
          },
          body: JSON.stringify({
            set_id: dataSetId,
            piece_ids: pieceIds.join(','),
            piece_cids: pieceCids.join(','),
          }),
        })
        const res = await workerImpl.fetch(req, env, CTX, {
          createPdpVerifierClient: createMockPdpVerifierClient,
        })
        expect(res.status).toBe(200)
        expect(await res.text()).toBe('OK')
      }

      const { results: pieces } = await env.DB.prepare(
        'SELECT * FROM pieces WHERE data_set_id = ?',
      )
        .bind(dataSetId)
        .all()
      expect(pieces.length).toBe(2)
    })

    it('allows multiple data sets to have the same piece id', async () => {
      const dataSetIds = [randomId(), randomId()]
      dataSetIds.sort()

      for (const dataSetId of dataSetIds) {
        const req = new Request('https://host/pdp-verifier/pieces-added', {
          method: 'POST',
          headers: {
            [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
          },
          body: JSON.stringify({
            set_id: dataSetId,
            piece_ids: '0',
            piece_cids: randomId(),
          }),
        })
        const res = await workerImpl.fetch(req, env, CTX, {
          createPdpVerifierClient: createMockPdpVerifierClient,
        })
        const body = await res.text()
        expect(`${res.status} ${body}`).toBe('200 OK')
      }

      const { results: pieces } = await env.DB.prepare(
        'SELECT data_set_id, id FROM pieces WHERE data_set_id = ? OR data_set_id = ? ORDER BY data_set_id',
      )
        .bind(dataSetIds[0], dataSetIds[1])
        .all()

      expect(pieces).toEqual([
        {
          data_set_id: dataSetIds[0],
          id: '0',
        },
        {
          data_set_id: dataSetIds[1],
          id: '0',
        },
      ])
    })

    it('adds a real live piece and fetches the piece CID from on-chain state', async () => {
      const req = new Request('https://host/pdp-verifier/pieces-added', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({
          set_id: LIVE_PDP_FILE.dataSetId.toString(),
          piece_ids: LIVE_PDP_FILE.pieceId.toString(),
          piece_cids: undefined,
        }),
      })
      const res = await workerImpl.fetch(req, env)
      await assertOkResponse(res)

      const { results: pieces } = await env.DB.prepare(
        'SELECT id, cid FROM pieces WHERE data_set_id = ?',
      )
        .bind(LIVE_PDP_FILE.dataSetId.toString())
        .all()

      expect(pieces).toEqual([
        {
          id: LIVE_PDP_FILE.pieceId.toString(),
          cid: LIVE_PDP_FILE.cid,
        },
      ])
    })

    it('ignores piece when on-chain state does not have a live piece', async () => {
      const req = new Request('https://host/pdp-verifier/pieces-added', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({
          set_id: DELETED_PDP_FILE.dataSetId.toString(),
          piece_ids: DELETED_PDP_FILE.pieceId.toString(),
          piece_cids: undefined,
        }),
      })
      const res = await workerImpl.fetch(req, env, {
        createPdpVerifierClient: createMockPdpVerifierClient,
      })
      await assertOkResponse(res)

      const { results: pieces } = await env.DB.prepare(
        'SELECT id, cid FROM pieces WHERE data_set_id = ?',
      )
        .bind(DELETED_PDP_FILE.dataSetId.toString())
        .all()

      expect(pieces).toEqual([
        {
          id: DELETED_PDP_FILE.pieceId.toString(),
          cid: DELETED_PDP_FILE.cid,
        },
      ])
    })
  })

  describe('POST /pdp-verifier/pieces-removed', () => {
    const CTX = {}
    it('returns 400 if set_id or piece_ids is missing', async () => {
      const req = new Request('https://host/pdp-verifier/pieces-removed', {
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

    it('deletes pieces for a data set', async () => {
      const dataSetId = randomId()
      const pieceIds = [randomId(), randomId()]
      const pieceCids = [randomId(), randomId()]
      const req = new Request('https://host/pdp-verifier/pieces-removed', {
        method: 'POST',
        headers: {
          [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
        },
        body: JSON.stringify({
          set_id: dataSetId,
          piece_ids: pieceIds.join(','),
        }),
      })

      await withPieces(env, dataSetId, pieceIds, pieceCids)
      const res = await workerImpl.fetch(req, env, CTX, {})
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('OK')

      const { results: pieces } = await env.DB.prepare(
        'SELECT * FROM pieces WHERE data_set_id = ?',
      )
        .bind(dataSetId)
        .all()
      expect(pieces.length).toBe(0)
    })
  })

  describe('POST /filecoin-warm-storage-service/data-set-created', () => {
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
      const req = new Request(
        'https://host/filecoin-warm-storage-service/data-set-created',
        {
          method: 'POST',
          headers: {
            [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
          },
          body: JSON.stringify({}),
        },
      )
      const res = await workerImpl.fetch(req, env, ctx, {
        checkIfAddressIsSanctioned: mockCheckIfAddressIsSanctioned,
      })
      expect(res.status).toBe(400)
      expect(await res.text()).toBe('Bad Request')
    })
    it('inserts a data set', async () => {
      const dataSetId = randomId()
      const req = new Request(
        'https://host/filecoin-warm-storage-service/data-set-created',
        {
          method: 'POST',
          headers: {
            [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
          },
          body: JSON.stringify({
            data_set_id: dataSetId,
            payer: '0xPayerAddress',
            payee: '0xPayeeAddress',
            with_cdn: true,
          }),
        },
      )

      mockCheckIfAddressIsSanctioned.mockResolvedValueOnce(false)
      const res = await workerImpl.fetch(req, env, ctx, {
        checkIfAddressIsSanctioned: mockCheckIfAddressIsSanctioned,
      })
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('OK')

      const { results: dataSets } = await env.DB.prepare(
        'SELECT * FROM data_sets WHERE id = ?',
      )
        .bind(dataSetId)
        .all()

      const { results: walletDetails } = await env.DB.prepare(
        'SELECT * FROM wallet_details WHERE address = ?',
      )
        .bind('0xPayerAddress')
        .all()

      expect(dataSets.length).toBe(1)
      expect(dataSets[0].data_set_id).toBe(dataSetId)
      expect(dataSets[0].payer).toBe('0xPayerAddress')
      expect(dataSets[0].payee).toBe('0xPayeeAddress')
      expect(dataSets[0].with_cdn).toBe(1)

      expect(walletDetails.length).toBe(1)
      expect(walletDetails[0].is_sanctioned).toBe(0)
    })
    it('does not insert duplicate data sets', async () => {
      const dataSetId = randomId()
      for (let i = 0; i < 2; i++) {
        const req = new Request(
          'https://host/filecoin-warm-storage-service/data-set-created',
          {
            method: 'POST',
            headers: {
              [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
            },
            body: JSON.stringify({
              data_set_id: dataSetId,
              payer: '0xPayerAddress',
              payee: '0xPayeeAddress',
              with_cdn: true,
            }),
          },
        )
        mockCheckIfAddressIsSanctioned.mockResolvedValueOnce(false)
        const res = await workerImpl.fetch(req, env, ctx, {
          checkIfAddressIsSanctioned: mockCheckIfAddressIsSanctioned,
        })
        expect(res.status).toBe(200)
        expect(await res.text()).toBe('OK')
      }

      const { results: dataSets } = await env.DB.prepare(
        'SELECT * FROM data_sets WHERE id = ?',
      )
        .bind(dataSetId)
        .all()
      expect(dataSets.length).toBe(1)
    })

    it('stores numeric ID values as integers', async () => {
      const dataSetId = Number(randomId())
      const req = new Request(
        'https://host/filecoin-warm-storage-service/data-set-created',
        {
          method: 'POST',
          headers: {
            [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
          },
          body: JSON.stringify({
            data_set_id: dataSetId,
            payer: '0xPayerAddress',
            payee: '0xPayeeAddress',
            with_cdn: true,
          }),
        },
      )
      mockCheckIfAddressIsSanctioned.mockResolvedValueOnce(false)
      const res = await workerImpl.fetch(req, env, ctx, {
        checkIfAddressIsSanctioned: mockCheckIfAddressIsSanctioned,
      })
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('OK')

      const { results: dataSets } = await env.DB.prepare(
        'SELECT * FROM data_sets WHERE id = ?',
      )
        .bind(String(dataSetId))
        .all()
      expect(dataSets.length).toBe(1)
      expect(dataSets[0]?.id).toMatch(/^\d+$/)
    })

    it('checks if payer address is sanctioned when with_cdn = true', async () => {
      const dataSetId = randomId()

      // send first request with with_cdn = true
      let req = new Request(
        'https://host/filecoin-warm-storage-service/data-set-created',
        {
          method: 'POST',
          headers: {
            [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
          },
          body: JSON.stringify({
            data_set_id: dataSetId,
            payer: '0xPayerAddress',
            payee: '0xPayeeAddress',
            with_cdn: true,
          }),
        },
      )

      mockCheckIfAddressIsSanctioned.mockResolvedValue(true)
      let res = await workerImpl.fetch(req, env, ctx, {
        checkIfAddressIsSanctioned: mockCheckIfAddressIsSanctioned,
      })
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('OK')

      // send second request with with_cdn = false
      req = new Request(
        'https://host/filecoin-warm-storage-service/data-set-created',
        {
          method: 'POST',
          headers: {
            [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
          },
          body: JSON.stringify({
            data_set_id: randomId(),
            payer: '0xPayerAddress',
            payee: '0xPayeeAddress',
            with_cdn: false,
          }),
        },
      )
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

      const { results: dataSets } = await env.DB.prepare(
        'SELECT * FROM data_sets WHERE id = ?',
      )
        .bind(dataSetId)
        .all()

      const { results: walletDetails } = await env.DB.prepare(
        'SELECT * FROM wallet_details WHERE address = ?',
      )
        .bind('0xPayerAddress')
        .all()

      expect(dataSets.length).toBe(1)
      expect(dataSets[0].payer).toBe('0xPayerAddress')

      expect(walletDetails.length).toBe(1)
      expect(walletDetails[0].address).toBe('0xPayerAddress')
      expect(walletDetails[0].is_sanctioned).toBe(1)
    })

    it('sends message to queue if sanction check fails', async () => {
      const dataSetId = randomId()
      const payload = {
        data_set_id: dataSetId,
        payer: '0xPayerAddress',
        payee: '0xPayeeAddress',
        with_cdn: true,
      }
      const req = new Request(
        'https://host/filecoin-warm-storage-service/data-set-created',
        {
          method: 'POST',
          headers: {
            [env.SECRET_HEADER_KEY]: env.SECRET_HEADER_VALUE,
          },
          body: JSON.stringify(payload),
        },
      )
      const res = await workerImpl.fetch(req, env, ctx, {
        checkIfAddressIsSanctioneded: async (apiKey, address) => {
          throw Error('fail')
        },
      })
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('OK')

      expect(env.RETRY_QUEUE.send).toHaveBeenCalledTimes(1)
      expect(env.RETRY_QUEUE.send).toHaveBeenCalledWith({
        type: 'filecoin-warm-storage-service-data-set-created',
        payload,
      })

      const { results: dataSets } = await env.DB.prepare(
        'SELECT * FROM data_sets WHERE id = ?',
      )
        .bind(dataSetId)
        .all()
      expect(dataSets.length).toBe(0)
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

async function withPieces(env, dataSetId, pieceIds, pieceCids) {
  await env.DB.prepare(
    `
    INSERT INTO pieces (
      id,
      data_set_id,
      cid
    )
    VALUES ${new Array(pieceIds.length)
      .fill(null)
      .map(() => '(?, ?, ?)')
      .join(', ')}
    ON CONFLICT DO NOTHING
  `,
  )
    .bind(
      ...pieceIds.flatMap((pieceId, i) => [
        String(pieceId),
        String(dataSetId),
        pieceCids[i],
      ]),
    )
    .run()
}
