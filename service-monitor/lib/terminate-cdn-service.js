/**
 * @param {{
 *   TERMINATE_CDN_SERVICE_WORKFLOW: import('clouflare:workers').WorkflowEntrypoint
 * }} env
 * @param {any} filecoinWarmStorageServiceContract
 */
export async function terminateCDNServiceForSanctionedClients(
  env,
  filecoinWarmStorageServiceContract,
) {
  const { results: dataSets } = env.DB.prepare(`
      SELECT DISTINCT ds.id
      FROM data_sets ds
        LEFT JOIN wallet_details sp ON ds.storage_provider_address = sp.address
        LEFT JOIN wallet_details pa ON ds.payer_address = pa.address
        LEFT JOIN wallet_details pe ON ds.payee_address = pe.address
      WHERE sp.is_sanctioned = 1
        OR pa.is_sanctioned = 1
        OR pe.is_sanctioned = 1
        AND ds.with_cdn = 1;
  `)

  const instances = []
  for (const { id: dataSetId } of dataSets) {
    const id = `terminate-cdn-sanctioned-${dataSetId}`
    const instance = await env.TERMINATE_CDN_SERVICE_WORKFLOW.get(id)
    const status = instance?.status || 'unknown'
    const error = instance?.error

    if (
      [
        'queued',
        'running',
        'paused',
        'complete',
        'waiting',
        'waitingForPause',
      ].includes(status)
    ) {
      console.log(
        `Workflow for dataSetId ${dataSetId} is already in progress or completed (status: ${status}). Skipping.`,
      )
      continue
    }

    if (status === 'errored' || error) {
      console.log(
        `Restarting workflow for dataSetId ${dataSetId} (status: ${status}, error: ${error})`,
      )
      await instance.restart()
      continue
    }

    // Status is unknown, create a new workflow
    console.log(`Creating new workflow for dataSetId ${dataSetId}`)
    instances.push({
      id,
      params: { dataSetId, contract: filecoinWarmStorageServiceContract },
    })
  }

  await env.TERMINATE_CDN_SERVICE_WORKFLOW.createBatch(instances)
}
