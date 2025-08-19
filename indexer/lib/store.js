/**
 * @param {Env} env
 * @param {number | string} proofSetId
 * @param {(number | string)[]} rootIds
 * @param {string[]} rootCids
 */
export async function insertProofSetRoots(env, proofSetId, rootIds, rootCids) {
  await env.DB.prepare(
    `INSERT INTO indexer_roots (
      root_id,
      set_id,
      root_cid
    ) VALUES ${new Array(rootIds.length)
      .fill(null)
      .map(() => '(?, ?, ?)')
      .join(', ')}
      ON CONFLICT DO NOTHING
    `,
  )
    .bind(
      ...rootIds.flatMap((rootId, i) => [
        String(rootId),
        String(proofSetId),
        rootCids[i],
      ]),
    )
    .run()
}

/**
 * @param {Env} env
 * @param {number | string} proofSetId
 * @param {(number | string)[]} rootIds
 */
export async function removeProofSetRoots(env, proofSetId, rootIds) {
  await env.DB.prepare(
    `
    DELETE FROM indexer_roots
    WHERE set_id = ? AND root_id IN (${new Array(rootIds.length)
      .fill(null)
      .map(() => '?')
      .join(', ')})
    `,
  )
    .bind(String(proofSetId), ...rootIds.map(String))
    .run()
}
