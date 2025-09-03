/** @import {WorkflowEvent, WorkflowStep} from 'cloudflare:workers' */
import { WorkflowEntrypoint } from 'cloudflare:workers'

export class TerminateCDNServiceForSanctionedClientWorkflow extends WorkflowEntrypoint {
  /**
   * @param {WorkflowEvent<{
   *   id: string
   *   contract: { terminateService: (BigInt) => Promise<void> }
   * }>} event
   * @param {WorkflowStep} step
   */
  async run(event, step) {
    // Logic to terminate the CDN service for the sanctioned client
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
      async () => event.contract.terminateService(BigInt(event.id)),
    )

    const receipt = await step.do(
      'waitForReceipt',
      { timeout: '15 minutes' },
      async () => {
        return await tx.wait()
      },
    )

    console.log(
      `Terminated CDN service for dataSetId ${event.id}, tx hash: ${receipt.transactionHash}`,
    )
  }
}
