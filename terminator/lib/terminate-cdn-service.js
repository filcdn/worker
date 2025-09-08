/**
 * @param {{
 *   DB: D1Database
 *   TRANSACTION_QUEUE: import('cloudflare:workers').Queue<{
 *     dataSetId: string
 *   }>
 * }} env
 */
export async function terminateCDNServiceForSanctionedWallets(env) {
  const { results: dataSets } = await env.DB.prepare(
    `
      SELECT DISTINCT ds.id
      FROM data_sets ds
        LEFT JOIN wallet_details wd ON ds.payer_address = wd.address
      WHERE ds.with_cdn = 1 AND wd.is_sanctioned = 1 AND ds.terminate_service_tx_hash IS NULL;
  `,
  ).run()

  console.log(`Found ${dataSets.length} sanctioned data sets to terminate`)

  // Send messages to queue for processing
  const messages = dataSets.map(({ id: dataSetId }) => ({
    body: {
      dataSetId,
      type: 'terminate-cdn-service',
    },
  }))

  if (messages.length > 0) {
    await env.TRANSACTION_QUEUE.sendBatch(messages)
    console.log(`Sent ${messages.length} messages to transaction queue`)
  }
}
