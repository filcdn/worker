/**
 * @param {{
 *   DB: D1Database
 *   TERMINATE_SERVICE_QUEUE: import('cloudflare:workers').Queue<{
 *     dataSetId: number
 *   }>
 * }} env
 */
export async function terminateCDNServiceForSanctionedWallets(env) {
  const { results: dataSets } = await env.DB.prepare(
    `
      SELECT DISTINCT ds.id
      FROM data_sets ds
        LEFT JOIN wallet_details sp ON ds.storage_provider_address = sp.address
        LEFT JOIN wallet_details pa ON ds.payer_address = pa.address
        LEFT JOIN wallet_details pe ON ds.payee_address = pe.address
      WHERE ds.with_cdn = 1 AND (sp.is_sanctioned = 1 OR pa.is_sanctioned = 1 OR pe.is_sanctioned = 1);
  `,
  ).run()

  console.log(`Found ${dataSets.length} sanctioned data sets to terminate`)

  // Send messages to queue for processing
  const messages = dataSets.map(({ id: dataSetId }) => ({
    dataSetId,
    type: 'terminate-cdn-service',
  }))

  if (messages.length > 0) {
    await env.TERMINATE_SERVICE_QUEUE.sendBatch(messages)
    console.log(`Sent ${messages.length} messages to transaction queue`)
  }
}
