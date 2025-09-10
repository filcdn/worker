/** @import {WorkflowEvent, WorkflowStep} from 'cloudflare:workers' */
import { WorkflowEntrypoint } from 'cloudflare:workers'
import { getChainClient as defaultGetChainClient } from './chain.js'

/**
 * Workflow that monitors a transaction and starts retry workflow if it takes
 * too long
 */
export class TransactionMonitorWorkflow extends WorkflowEntrypoint {
  /**
   * @param {WorkflowEvent} event
   * @param {WorkflowStep} step
   */
  async run(
    { payload: { transactionHash } },
    step,
    { getChainClient = defaultGetChainClient } = {},
  ) {
    try {
      // Wait for transaction receipt with timeout
      await step.do(
        `wait for transaction receipt ${transactionHash}`,
        {
          timeout: `5 minutes`,
          retries: {
            limit: 3,
          },
        },
        async () => {
          const { publicClient } = getChainClient(this.env)
          return await publicClient.waitForTransactionReceipt({
            hash: transactionHash,
          })
        },
      )
    } catch (error) {
      // Send retry message to transaction queue
      await step.do(
        'send to retry queue',
        { timeout: '30 seconds' },
        async () => {
          await this.env.TRANSACTION_QUEUE.send({
            type: 'transaction-retry',
            transactionHash,
          })
        },
      )
    }
  }
}
