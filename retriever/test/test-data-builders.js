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
