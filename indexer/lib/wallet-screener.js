/**
 * @param {{ DB: D1Database; CHAINALYSIS_API_KEY: string }} env
 * @param {object} options
 * @param {number} options.staleThresholdMs Re-screen only wallets not screened
 *   in the last `staleThresholdMs` milliseconds
 * @param {number} options.batchSize Number of wallets to process in a single
 *   batch
 * @param {typeof import('./chainalysis.js').checkIfAddressIsSanctioned} options.checkIfAddressIsSanctioned
 */
export async function screenWallets(
  env,
  { staleThresholdMs, batchSize, checkIfAddressIsSanctioned },
) {
  const { results: wallets } = await env.DB.prepare(
    `
    SELECT address FROM wallet_details
    WHERE last_screened_at IS NULL OR unixepoch('subsec') - unixepoch(last_screened_at, 'subsec') >= ?
    ORDER BY last_screened_at ASC
    LIMIT ?
  `,
  )
    .bind(staleThresholdMs, batchSize)
    .all()

  // No wallets with a stale sanction check, nothing to do.
  if (!wallets || !wallets.length) return

  const updateStatementTemplate = env.DB.prepare(
    `
    UPDATE wallet_details
    SET is_sanctioned = ?, last_screened_at = datetime('now')
    WHERE address = ?
    `,
  )
  const updateStatements = []
  for (const w of wallets) {
    const address = /** @type {string} */ (w.address)

    try {
      const isSanctioned = await checkIfAddressIsSanctioned(address, {
        CHAINALYSIS_API_KEY: env.CHAINALYSIS_API_KEY,
      })
      updateStatements.push(
        updateStatementTemplate.bind(isSanctioned ? 1 : 0, address),
      )
    } catch (error) {
      console.error({
        message: `Failed to screen wallet ${address}: ${/** @type {Error} */ (error).message}`,
        error,
        stack: /** @type {Error} */ (error).stack,
      })
      // Do not update the wallet, we'll retry next time.
    }
  }

  await env.DB.batch(updateStatements)
}
