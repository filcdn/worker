/** @import {WorkflowEvent, WorkflowStep} from 'cloudflare:workers' */
import { WorkflowEntrypoint } from 'cloudflare:workers'
import { getFilecoinWarmStorageServiceContract as defaultGetFilecoinWarmStorageServiceContract } from '../lib/contracts.js'

export class TerminateCDNServiceWorkflow extends WorkflowEntrypoint {
  /**
   * @param {WorkflowEvent} event
   * @param {WorkflowStep} step
   * @param {object} options
   * @param {typeof defaultGetFilecoinWarmStorageServiceContract} options.getFilecoinWarmStorageServiceContract
   */
  async run(
    { payload: { dataSetId } },
    step,
    {
      getFilecoinWarmStorageServiceContract = defaultGetFilecoinWarmStorageServiceContract,
    } = {},
  ) {
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
        const contract = getFilecoinWarmStorageServiceContract(this.env)
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
