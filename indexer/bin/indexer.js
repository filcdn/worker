import {
  handleProviderRegistered,
  handleProviderRemoved,
} from '../lib/provider-events-handler.js'
import { createPdpVerifierClient as defaultCreatePdpVerifierClient } from '../lib/pdp-verifier.js'
import { checkIfAddressIsSanctioned as defaultCheckIfAddressIsSanctioned } from '../lib/chainalysis.js'
import { handleFilecoinWarmStorageServiceDataSetCreated } from '../lib/filecoin-warm-storage-service-handlers.js'
import { removeDataSetPieces, insertDataSetPieces } from '../lib/pdp-verifier-handlers.js'

export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @param {ExecutionContext} ctx
   * @param {object} options
   * @param {typeof defaultCreatePdpVerifierClient} [options.createPdpVerifierClient]
   * @param {typeof defaultCheckIfAddressIsSanctioned} [options.checkIfAddressIsSanctioned]
   * @returns {Promise<Response>}
   */
  async fetch(
    request,
    env,
    ctx,
    {
      createPdpVerifierClient = defaultCreatePdpVerifierClient,
      checkIfAddressIsSanctioned = defaultCheckIfAddressIsSanctioned,
    } = {},
  ) {
    // TypeScript setup is broken in our monorepo
    // There are multiple global Env interfaces defined (one per worker),
    // TypeScript merges them in a way that breaks our code.
    // We should eventually fix that.
    const {
      // @ts-ignore
      GLIF_TOKEN,
      // @ts-ignore
      RPC_URL,
      // @ts-ignore
      PDP_VERIFIER_ADDRESS,
      // @ts-ignore
      SECRET_HEADER_KEY,
      // @ts-ignore
      SECRET_HEADER_VALUE,
    } = env
    if (request.headers.get(SECRET_HEADER_KEY) !== SECRET_HEADER_VALUE) {
      return new Response('Unauthorized', { status: 401 })
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }
    const payload = await request.json()
    const pathname = new URL(request.url).pathname
    if (pathname === '/pdp-verifier/data-set-created') {
      if (
        !(
          typeof payload.set_id === 'number' ||
          typeof payload.set_id === 'string'
        ) ||
        !payload.storage_provider
      ) {
        console.error('PDPVerifier.DataSetCreated: Invalid payload', payload)
        return new Response('Bad Request', { status: 400 })
      }
      console.log(
        `New PDPVerifier data set (data_set_id=${payload.set_id}, storage_provider=${payload.storage_provider})`,
      )
      await env.DB.prepare(
        `
          INSERT INTO data_sets (
            id,
            storage_provider
          )
          VALUES (?, ?)
          ON CONFLICT DO UPDATE SET
            storage_provider=excluded.storage_provider
        `,
      )
        .bind(String(payload.set_id), payload.storage_provider.toLowerCase())
        .run()
      return new Response('OK', { status: 200 })
    } else if (pathname === '/pdp-verifier/pieces-added') {
      if (
        !(
          typeof payload.set_id === 'number' ||
          typeof payload.set_id === 'string'
        ) ||
        !payload.piece_ids ||
        typeof payload.piece_ids !== 'string'
      ) {
        console.error('PDPVerifier.PiecesAdded: Invalid payload', payload)
        return new Response('Bad Request', { status: 400 })
      }

      /** @type {string[]} */
      const pieceIds = payload.piece_ids.split(',')

      const dataSetId = BigInt(payload.set_id)

      const pdpVerifier = createPdpVerifierClient({
        rpcUrl: RPC_URL,
        glifToken: GLIF_TOKEN,
        pdpVerifierAddress: PDP_VERIFIER_ADDRESS,
      })

      const pieceCids = payload.piece_cids
        ? payload.piece_cids.split(',')
        : await Promise.all(
            pieceIds.map(async (pieceId) => {
              try {
                return await pdpVerifier.getPieceCid(
                  dataSetId,
                  BigInt(pieceId),
                  payload.block_number,
                )
              } catch (/** @type {any} */ err) {
                console.error(
                  `RootsAdded: Cannot resolve root CID for dataSetId=${dataSetId} pieceId=${pieceId}: ${err?.stack ?? err}`,
                )
                throw err
              }
            }),
          )

      console.log(
        `New pieces (piece_ids=[${pieceIds.join(', ')}], piece_cids=[${pieceCids.join(', ')}], data_set_id=${payload.set_id})`,
      )

      await insertDataSetPieces(env, payload.set_id, pieceIds, pieceCids)

      return new Response('OK', { status: 200 })
    } else if (pathname === '/pdp-verifier/pieces-removed') {
      if (
        !(
          typeof payload.set_id === 'number' ||
          typeof payload.set_id === 'string'
        ) ||
        !payload.piece_ids ||
        typeof payload.piece_ids !== 'string'
      ) {
        console.error('PDPVerifier.PiecesRemoved: Invalid payload', payload)
        return new Response('Bad Request', { status: 400 })
      }

      /** @type {string[]} */
      const pieceIds = payload.piece_ids.split(',')

      console.log(
        `Removing pieces (piece_ids=[${pieceIds.join(', ')}], data_set_id=${payload.set_id})`,
      )

      await removeDataSetPieces(env, payload.set_id, pieceIds)
      return new Response('OK', { status: 200 })
    } else if (pathname === '/filecoin-warm-storage-service/data-set-created') {
      if (
        !payload.data_set_id ||
        !(
          typeof payload.data_set_id === 'number' ||
          typeof payload.data_set_id === 'string'
        ) ||
        !payload.payer ||
        !payload.payee ||
        typeof payload.with_cdn !== 'boolean'
      ) {
        console.error('FilecoinWarmStorageService.DataSetCreated: Invalid payload', payload)
        return new Response('Bad Request', { status: 400 })
      }

      console.log(
        `New FilecoinWarmStorageService data set (data_set_id=${payload.data_set_id}, payer=${payload.payer}, payee=${payload.payee}, with_cdn=${payload.with_cdn})`,
      )

      try {
        await handleFilecoinWarmStorageServiceDataSetCreated(env, payload, {
          checkIfAddressIsSanctioned,
        })
      } catch (err) {
        console.log(
          `Error handling FilecoinWarmStorageService data set creation: ${err}. Retrying...`,
        )
        // @ts-ignore
        env.RETRY_QUEUE.send({ type: 'filecoin-warm-storage-service-data-set-created', payload })
      }

      return new Response('OK', { status: 200 })
    } else if (pathname === '/provider-registered') {
      const { provider, piece_retrieval_url: pieceRetrievalUrl } = payload
      return await handleProviderRegistered(env, provider, pieceRetrievalUrl)
    } else if (pathname === '/provider-removed') {
      const { provider } = payload
      return await handleProviderRemoved(env, provider)
    } else {
      return new Response('Not Found', { status: 404 })
    }
  },
  /**
   * Handles incoming messages from the retry queue.
   *
   * @param {MessageBatch<{ type: string; payload: any }>} batch
   * @param {Env} env
   * @param {object} options
   * @param {typeof defaultCheckIfAddressIsSanctioned} [options.checkIfAddressIsSanctioned]
   */
  async queue(
    batch,
    env,
    { checkIfAddressIsSanctioned = defaultCheckIfAddressIsSanctioned } = {},
  ) {
    for (const message of batch.messages) {
      if (message.body.type === 'proof-set-rail-created') {
        try {
          await handleFilecoinWarmStorageServiceDataSetCreated(env, message.body.payload, {
            checkIfAddressIsSanctioned,
          })

          message.ack()
        } catch (err) {
          console.log(
            `Error handling FilecoinWarmStorageService data set creation: ${err}. Retrying...`,
          )
          message.retry({ delaySeconds: 10 })
        }
      } else {
        console.error(`Unknown message type: ${message.body.type}.`)
        message.ack() // Acknowledge unknown messages to avoid reprocessing
      }
    }
  },

  /**
   * @param {any} _controller
   * @param {Env} _env
   * @param {ExecutionContext} _ctx
   * @param {object} [options]
   * @param {typeof globalThis.fetch} [options.fetch]
   */
  async scheduled(_controller, _env, _ctx, { fetch = globalThis.fetch } = {}) {
    const [subgraph, chainHead] = await Promise.all([
      (async () => {
        const res = await fetch(
          'https://api.goldsky.com/api/public/project_cmb91qc80slyu01wca6e2eupl/subgraphs/pdp-verifier/1.0.0/gn',
          {
            method: 'POST',
            body: JSON.stringify({
              query: `
              query {
                _meta {
                  hasIndexingErrors
                  block {
                    number
                  }
                }
              }
            `,
            }),
          },
        )
        const { data } = await res.json()
        return data
      })(),
      (async () => {
        const res = await fetch(
          'https://calibration.filecoin.chain.love/rpc/v0',
          {
            method: 'POST',
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'Filecoin.ChainHead',
              params: [],
              id: 1,
            }),
          },
        )
        const { result } = await res.json()
        return result
      })(),
    ])
    const alerts = []
    if (subgraph._meta.hasIndexingErrors) {
      alerts.push('Goldsky has indexing errors')
    }
    const lag = chainHead.Height - subgraph._meta.block.number
    if (lag > 2) {
      // TODO: Even 2 blocks is too much, but this is where Goldksy is at
      alerts.push(`Goldsky is ${lag} blocks behind`)
    }
    if (alerts.length) {
      throw new Error(alerts.join(' & '))
    }
  },
}
