export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @param {ExecutionContext} ctx
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    // TypeScript setup is broken in our monorepo
    // There are multiple global Env interfaces defined (one per worker),
    // TypeScript merges them in a way that breaks our code.
    // We should eventually fix that.
    // @ts-ignore
    const { SECRET_HEADER_KEY, SECRET_HEADER_VALUE } = env
    if (request.headers.get(secretHeaderKey) !== secretHeaderValue) {
      return new Response('Unauthorized', { status: 401 })
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }
    const payload = await request.json()
    const pathname = new URL(request.url).pathname
    if (pathname === '/proof-set-created') {
      if (!payload.set_id || !payload.owner) {
        return new Response('Bad Request', { status: 400 })
      }
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
        .bind(payload.set_id, payload.owner)
        .run()
      return new Response('OK', { status: 200 })
    } else if (pathname === '/roots-added') {
      if (
        !payload.set_id ||
        !payload.root_ids ||
        !Array.isArray(payload.root_ids) ||
        !payload.root_ids.every(
          (/** @type {any} */ item) => typeof item === 'string',
        )
      ) {
        return new Response('Bad Request', { status: 400 })
      }

      /** @type {string[]} */
      const rootIds = payload.root_ids

      await env.DB.prepare(
        `
          INSERT INTO indexer_roots (
            root_id,
            set_id,
            root_cid
          )
          VALUES ${new Array(payload.root_ids.length)
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
            payload.root_cids ? String(payload.root_cids[i]) : null,
          ]),
        )
        .run()
      return new Response('OK', { status: 200 })
    } else if (pathname === '/proof-set-rail-created') {
      if (
        !payload.proof_set_id ||
        !payload.rail_id ||
        !payload.payer ||
        !payload.payee
      ) {
        return new Response('Bad Request', { status: 400 })
      }
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
          payload.proof_set_id,
          payload.rail_id,
          payload.payer,
          payload.payee,
          payload.with_cdn || null,
        )
        .run()
      return new Response('OK', { status: 200 })
    } else {
      return new Response('Not Found', { status: 404 })
    }
  },
}
