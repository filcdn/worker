import {
  handleProviderRegistered,
  handleProviderRemoved,
} from '../lib/provider-events-handler.js'
import { createPdpVerifierClient as defaultCreatePdpVerifierClient } from '../lib/pdp-verifier.js'
import { checkIfAddressIsSanctioned as defaultCheckIfAddressIsSanctioned } from '../lib/chainalysis.js'
import { handleProofSetRailCreated } from '../lib/proof-set-handler.js'
import { deleteProofSetRoots, insertProofSetRoots } from '../lib/store.js'

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
    if (pathname === '/proof-set-created') {
      if (
        !(
          typeof payload.set_id === 'number' ||
          typeof payload.set_id === 'string'
        ) ||
        !payload.owner
      ) {
        console.error('ProofSetCreated: Invalid payload', payload)
        return new Response('Bad Request', { status: 400 })
      }
      console.log(
        `New proof set (set_id=${payload.set_id}, owner=${payload.owner})`,
      )
      await env.DB.prepare(
        `
          INSERT INTO indexer_proof_sets (
            set_id,
            owner
          )
          VALUES (?, ?)
          ON CONFLICT DO NOTHING
        `,
      )
        .bind(String(payload.set_id), payload.owner?.toLowerCase())
        .run()
      return new Response('OK', { status: 200 })
    } else if (pathname === '/roots-added') {
      if (
        !(
          typeof payload.set_id === 'number' ||
          typeof payload.set_id === 'string'
        ) ||
        !payload.root_ids ||
        typeof payload.root_ids !== 'string'
      ) {
        console.error('RootsAdded: Invalid payload', payload)
        return new Response('Bad Request', { status: 400 })
      }

      /** @type {string[]} */
      const rootIds = payload.root_ids.split(',')

      const setId = BigInt(payload.set_id)

      const pdpVerifier = createPdpVerifierClient({
        rpcUrl: RPC_URL,
        glifToken: GLIF_TOKEN,
        pdpVerifierAddress: PDP_VERIFIER_ADDRESS,
      })

      const rootCids = payload.root_cids
        ? payload.root_cids.split(',')
        : await Promise.all(
            rootIds.map(async (rootId) => {
              try {
                return await pdpVerifier.getRootCid(setId, BigInt(rootId))
              } catch (/** @type {any} */ err) {
                console.error(
                  `RootsAdded: Cannot resolve root CID for setId=${setId} rootId=${rootId}: ${err?.stack ?? err}`,
                )
                throw err
              }
            }),
          )

      console.log(
        `New roots (root_ids=[${rootIds.join(', ')}], root_cids=[${rootCids.join(', ')}], set_id=${payload.set_id})`,
      )

      // @ts-ignore
      const { addedCids, addedRoots, deletedRoots } = rootIds.reduce(
        (acc, rootId, i) => {
          const cid = rootCids[i]
          if (!cid) {
            // @ts-ignore
            acc.deletedRoots.push(rootId)
          } else {
            // @ts-ignore
            acc.addedRoots.push(rootId)
            // @ts-ignore
            acc.addedCids.push(cid)
          }

          return acc
        },
        { addedRoots: [], addedCids: [], deletedRoots: [] },
      )

      if (addedRoots.length && addedCids.length) {
        await insertProofSetRoots(env, payload.set_id, rootIds, rootCids)
      }

      if (deletedRoots.length) {
        await deleteProofSetRoots(env, payload.set_id, deletedRoots)
      }

      return new Response('OK', { status: 200 })
    } else if (pathname === '/roots-removed') {
      if (
        !(
          typeof payload.set_id === 'number' ||
          typeof payload.set_id === 'string'
        ) ||
        !payload.root_ids ||
        typeof payload.root_ids !== 'string'
      ) {
        console.error('RootsRemoved: Invalid payload', payload)
        return new Response('Bad Request', { status: 400 })
      }

      /** @type {string[]} */
      const rootIds = payload.root_ids.split(',')

      console.log(
        `Removing roots (root_ids=[${rootIds.join(', ')}], set_id=${payload.set_id})`,
      )

      await deleteProofSetRoots(env, payload.set_id, rootIds)
      return new Response('OK', { status: 200 })
    } else if (pathname === '/proof-set-rail-created') {
      if (
        !payload.proof_set_id ||
        !(
          typeof payload.proof_set_id === 'number' ||
          typeof payload.proof_set_id === 'string'
        ) ||
        !payload.rail_id ||
        !(
          typeof payload.rail_id === 'number' ||
          typeof payload.rail_id === 'string'
        ) ||
        !payload.payer ||
        !payload.payee
      ) {
        console.error('ProofSetRailCreated: Invalid payload', payload)
        return new Response('Bad Request', { status: 400 })
      }

      console.log(
        `New proof set rail (proof_set_id=${payload.proof_set_id}, rail_id=${payload.rail_id}, payer=${payload.payer}, payee=${payload.payee}, with_cdn=${payload.with_cdn})`,
      )

      try {
        await handleProofSetRailCreated(env, payload, {
          checkIfAddressIsSanctioned,
        })
      } catch (err) {
        console.log(
          `Error handling proof set rail creation: ${err}. Retrying...`,
        )
        // @ts-ignore
        env.RETRY_QUEUE.send({ type: 'proof-set-rail-created', payload })
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
          await handleProofSetRailCreated(env, message.body.payload, {
            checkIfAddressIsSanctioned,
          })

          message.ack()
        } catch (err) {
          console.log(
            `Error handling proof set rail creation: ${err}. Retrying...`,
          )
          message.retry({ delaySeconds: 10 })
        }
      } else {
        console.error(`Unknown message type: ${message.body.type}.`)
        message.ack() // Acknowledge unknown messages to avoid reprocessing
      }
    }
  },
}
