import {
  handleProviderRegistered,
  handleProviderRemoved,
} from '../lib/provider-events-handler.js'
import { createPdpVerifierClient as defaultCreatePdpVerifierClient } from '../lib/pdp-verifier.js'
import { createLogger } from '../../telemetry/papertrail.js'

export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @param {ExecutionContext} ctx
   * @param {object} options
   * @param {typeof defaultCreatePdpVerifierClient} [options.createPdpVerifierClient]
   * @returns {Promise<Response>}
   */
  async fetch(
    request,
    env,
    ctx,
    { createPdpVerifierClient = defaultCreatePdpVerifierClient } = {},
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
    const logger = createLogger(env)
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
        logger.error('Invalid payload', payload)
        return new Response('Bad Request', { status: 400 })
      }
      logger.log(
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
        logger.error('Invalid payload', payload)
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
                logger.error(
                  `Cannot get root CID for setId=${setId} rootId=${rootId}: ${err?.stack ?? err}`,
                )
                throw err
              }
            }),
          )

      logger.log(
        `New roots (root_ids=[${rootIds.join(', ')}], root_cids=[${rootCids.join(', ')}], set_id=${payload.set_id})`,
      )
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
            String(payload.set_id),
            rootCids[i],
          ]),
        )
        .run()
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
        logger.error('Invalid payload', payload)
        return new Response('Bad Request', { status: 400 })
      }
      logger.log(
        `New proof set rail (proof_set_id=${payload.proof_set_id}, rail_id=${payload.rail_id}, payer=${payload.payer}, payee=${payload.payee}, with_cdn=${payload.with_cdn})`,
      )
      await env.DB.prepare(
        `
          INSERT INTO indexer_proof_set_rails (
            proof_set_id,
            rail_id,
            payer,
            payee,
            with_cdn
          )
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT DO NOTHING
        `,
      )
        .bind(
          String(payload.proof_set_id),
          String(payload.rail_id),
          payload.payer,
          payload.payee,
          payload.with_cdn ?? null,
        )
        .run()
      return new Response('OK', { status: 200 })
    } else if (pathname === '/provider-registered') {
      const { provider, piece_retrieval_url: pieceRetrievalUrl } = payload
      return await handleProviderRegistered(env, provider, pieceRetrievalUrl, {
        logger,
      })
    } else if (pathname === '/provider-removed') {
      const { provider } = payload
      return await handleProviderRemoved(env, provider, { logger })
    } else {
      return new Response('Not Found', { status: 404 })
    }
  },
}
