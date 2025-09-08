/**
 * @param {Env} env
 * @param {string} dataSetId
 * @param {string[]} pieceIds
 * @param {string[]} pieceCids
 */
export async function insertDataSetPieces(env, dataSetId, pieceIds, pieceCids) {
  await env.DB.prepare(
    `INSERT INTO pieces (
      id,
      data_set_id,
      cid
    ) VALUES ${new Array(pieceIds.length)
      .fill(null)
      .map(() => '(?, ?, ?)')
      .join(', ')}
      ON CONFLICT DO NOTHING
    `,
  )
    .bind(
      ...pieceIds.flatMap((pieceId, i) => [pieceId, dataSetId, pieceCids[i]]),
    )
    .run()
}

/**
 * @param {Env} env
 * @param {string} dataSetId
 * @param {string[]} pieceIds
 */
export async function removeDataSetPieces(env, dataSetId, pieceIds) {
  await env.DB.prepare(
    `
    DELETE FROM pieces
    WHERE data_set_id = ? AND id IN (${new Array(pieceIds.length)
      .fill(null)
      .map(() => '?')
      .join(', ')})
    `,
  )
    .bind(dataSetId, ...pieceIds)
    .run()
}
