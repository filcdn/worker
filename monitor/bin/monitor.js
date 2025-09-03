/** @import {WorkflowEvent, WorkflowStep} from 'cloudflare:workers' */
import { WorkflowEntrypoint } from 'cloudflare:workers'
import { getFilecoinWarmStorageServiceContract as defaultGetFilecoinWarmStorageServiceContract } from '../lib/contract.js'
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
 * }} IndexerEnv
 */

export default {
  /**
   * @param {any} _controller
   * @param {IndexerEnv} env
   * @param {ExecutionContext} _ctx
   * @param {object} options
   * @param {typeof defaultGetFilecoinWarmStorageServiceContract} options.getFilecoinWarmStorageServiceContract
   *   - Function to get the contract instance
   */
  async scheduled(
    _controller,
    env,
    _ctx,
    {
      getFilecoinWarmStorageServiceContract = defaultGetFilecoinWarmStorageServiceContract,
    },
  ) {
    const filecoinWarmStorageServiceContract =
      await getFilecoinWarmStorageServiceContract(env)
    await terminateCDNServiceForSanctionedClients(
      env,
      filecoinWarmStorageServiceContract,
    )
  },
}

export class TerminateCDNServiceWorkflow extends WorkflowEntrypoint {
  /**
   * @param {WorkflowEvent} event
   * @param {WorkflowStep} step
   */
  async run({ payload: { dataSetId, contract } }, step) {
    console.log(`Terminating CDN service for dataSetId ${dataSetId}`)
    const tx = await step.do(
      `terminate CDN service for data set ${dataSetId}`,
      {
        retries: {
          limit: 5,
          delay: '5 second',
          backoff: 'exponential',
        },
        timeout: '15 minutes',
      },
      async () => {
        return await contract.write.terminateCDNService(BigInt(dataSetId))
      },
    )

    const receipt = await step.do(
      `wait for termination transaction receipt for data set ${dataSetId}`,
      { timeout: '15 minutes' },
      async () => {
        return await tx.wait()
      },
    )

    console.log(
      `Terminated CDN service for dataSetId ${dataSetId}, tx hash: ${receipt.transactionHash}`,
    )
  }
}
