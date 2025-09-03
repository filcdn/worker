/** @import {WorkflowEvent, WorkflowStep} from 'cloudflare:workers' */
import { WorkflowEntrypoint } from 'cloudflare:workers'
import { createWalletClient, getContract, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { filecoinCalibration } from 'viem/chains'

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
    await this.terminateCDNServiceForSanctionedClients(env)
    // const results = await Promise.allSettled([
    //   this.terminateCDNServiceForSanctionedClients(env),
    // ])
    // const errors = results
    //   .filter((r) => r.status === 'rejected')
    //   .map((r) => r.reason)
    // if (errors.length === 1) {
    //   throw errors[0]
    // } else if (errors.length) {
    //   throw new AggregateError(errors, 'One or more scheduled tasks failed')
    // }
  },

  /** @param {IndexerEnv} env */
  async terminateCDNServiceForSanctionedClients(env) {
  //   const { results: dataSets } = env.DB.prepare(`
  //     SELECT DISTINCT ds.id
  //     FROM data_sets ds
  //       LEFT JOIN wallet_details sp ON ds.storage_provider_address = sp.address
  //       LEFT JOIN wallet_details pa ON ds.payer_address = pa.address
  //       LEFT JOIN wallet_details pe ON ds.payee_address = pe.address
  //     WHERE sp.is_sanctioned = 1
  //       OR pa.is_sanctioned = 1
  //       OR pe.is_sanctioned = 1;
  // `)

    const account = privateKeyToAccount(env.FILCDN_CONTROLLER_ADDRESS_PRIVATE_KEY)
    const client = createWalletClient({
      account,
      chain: filecoinCalibration,
      transport: http()
    })
    const contract = getContract({
      address: env.FILECOIN_WARM_STORAGE_SERVICE_ADDRESS,
      abi: [
        'function terminateCDNService(uint256 dataSetId) external'
      ],
      client,
    })
    
    const dataSets = [{id: '1'}]
    for (const { id } of dataSets) {
      console.log('create')
      await env.TERMINATE_CDN_SERVICE_WORKFLOW.create({
        id,
        contract: contract,
      })
      console.log('created')
    }
  },
}

export class TerminateCDNServiceWorkflow extends WorkflowEntrypoint {
  /**
   * @param {WorkflowEvent<{
   *   id: string
   *   contract: { terminateService: (BigInt) => Promise<void> }
   * }>} event
   * @param {WorkflowStep} step
   */
  async run({ id, contract }, step) {
    // Logic to terminate the CDN service for the sanctioned client
    console.log('terminate')
    const tx = await step.do(
      'terminateCDNService',
      {
        retries: {
          limit: 5,
          delay: '5 second',
          backoff: 'exponential',
        },
        timeout: '15 minutes',
      },
      async () => contract.terminateService(BigInt(id)),
    )
    console.log('terminate')

    const receipt = await step.do(
      'waitForReceipt',
      { timeout: '15 minutes' },
      async () => {
        return await tx.wait()
      },
    )
    console.log('done')

    console.log(
      `Terminated CDN service for dataSetId ${id}, tx hash: ${receipt.transactionHash}`,
    )
  }
}

