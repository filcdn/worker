import { getBadBitsEntry } from '../lib/bad-bits-util'

/**
 * @param {Env} env
 * @param {Object} options
 * @param {string} options.owner
 * @param {string} options.rootCid
 * @param {number} options.proofSetId
 * @param {number} options.railId
 * @param {boolean} options.with_cdn
 */
export async function withProofSetRoots(
  env,
  {
    owner = '0x2A06D234246eD18b6C91de8349fF34C22C7268e2',
    clientAddress = '0x1234567890abcdef1234567890abcdef12345608',
    rootCid = 'bagaTEST',
    proofSetId = 0,
    railId = 0,
    withCDN = true,
    rootId = 0,
  } = {},
) {
  await env.DB.batch([
    env.DB.prepare(
      `
      INSERT INTO indexer_proof_sets (set_id, owner)
      VALUES (?, ?)
    `,
    ).bind(String(proofSetId), owner),

    env.DB.prepare(
      `
      INSERT INTO indexer_roots (root_id, set_id, root_cid)
      VALUES (?, ?, ?)
    `,
    ).bind(String(rootId), String(proofSetId), rootCid),
    env.DB.prepare(
      `
      INSERT INTO indexer_proof_set_rails (proof_set_id, rail_id, payer, payee, with_cdn)
      VALUES (?, ?, ?, ?, ?)
    `,
    ).bind(String(proofSetId), String(railId), clientAddress, owner, withCDN),
  ])
}

/**
 * @param {Env} env
 * @param {Object} options
 * @param {string} options.ownerAddress
 * @param {string} [options.pieceRetrievalUrl]
 */
export async function withApprovedProvider(
  env,
  { ownerAddress, pieceRetrievalUrl = 'https://pdp.xyz/' } = {},
) {
  await env.DB.prepare(
    `
    INSERT INTO provider_urls (address, piece_retrieval_url)
    VALUES (?, ?)
  `,
  )
    .bind(ownerAddress.toLowerCase(), pieceRetrievalUrl)
    .run()
}

/**
 * @param {Env} env
 * @param {...string} cids
 */
export async function withBadBits(env, ...cids) {
  const stmt = await env.DB.prepare(
    'INSERT INTO bad_bits (hash, last_modified_at) VALUES (?, CURRENT_TIME)',
  )
  const entries = await Promise.all(cids.map(getBadBitsEntry))
  await env.DB.batch(entries.map((it) => stmt.bind(it)))
}

/**
 * Inserts an address into the database with an optional sanctioned flag.
 *
 * @param {Env} env
 * @param {string} address
 * @param {boolean} [isSanctioned=false] Default is `false`
 * @returns {Promise<void>}
 */
export async function withWalletDetails(env, address, isSanctioned = false) {
  await env.DB.prepare(
    `
    INSERT INTO wallet_details (address, is_sanctioned)
    VALUES (?, ?)
  `,
  )
    .bind(address.toLowerCase(), isSanctioned ? 1 : 0)
    .run()
}
