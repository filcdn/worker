/** @import {WorkflowEntrypoint} from 'cloudflare:workers' */
import { terminateCDNServiceForSanctionedClients } from '../lib/terminate-cdn-service.js'

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
 *   TERMINATE_CDN_SERVICE_WORKFLOW: WorkflowEntrypoint
 * }} ServiceMonitorEnv
 */

export default {
  /**
   * @param {any} _controller
   * @param {ServiceMonitorEnv} env
   * @param {ExecutionContext} _ctx
   *
   *   - Function to get the contract instance
   */
  async scheduled(_controller, env, _ctx) {
    await terminateCDNServiceForSanctionedClients(env)
  },
}
