/**
 * @typedef {{
 *   GLIF_TOKEN: string
 *   ENVIRONMENT: 'dev' | 'calibration' | 'mainnet'
 *   RPC_URL:
 *     | 'https://api.calibration.node.glif.io/'
 *     | 'https://api.node.glif.io/'
 *   FILECOIN_WARM_STORAGE_SERVICE_ADDRESS: string
 *   FILCDN_CONTROLLER_ADDRESS_PRIVATE_KEY: string
 *   DB: D1Database
 * }} IndexerEnv
 */

export default {
  /**
   * @param {any} _controller
   * @param {IndexerEnv} env
   * @param {ExecutionContext} _ctx
   */
  async scheduled(_controller, env, _ctx) {
    const results = await Promise.allSettled([
      this.terminateCDNServiceForSanctionedClients(env),
    ])
    const errors = results
      .filter((r) => r.status === 'rejected')
      .map((r) => r.reason)
    if (errors.length === 1) {
      throw errors[0]
    } else if (errors.length) {
      throw new AggregateError(errors, 'One or more scheduled tasks failed')
    }
  },

  /** @param {IndexerEnv} env */
  async terminateCDNServiceForSanctionedClients(env) {
    const { results: dataSets } = env.DB.prepare(`
      SELECT DISTINCT ds.id
      FROM data_sets ds
        LEFT JOIN wallet_details sp ON ds.storage_provider_address = sp.address
        LEFT JOIN wallet_details pa ON ds.payer_address = pa.address
        LEFT JOIN wallet_details pe ON ds.payee_address = pe.address
      WHERE sp.is_sanctioned = 1
        OR pa.is_sanctioned = 1
        OR pe.is_sanctioned = 1;
  `)

    const mockContract = {
      terminateService: async (id) => {
        console.log(`Mock terminating service for dataset ${id}`)
        return {
          wait: async () => ({ transactionHash: '0xMOCKTRANSACTIONHASH' }),
        }
      },
    }
    for (const { id } of dataSets) {
      await env.TERMINATE_CDN_SERVICE_WORKFLOW.create({
        id,
        contract: mockContract,
      })
    }
  },
}
