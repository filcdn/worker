/** @import {WorkflowEvent, WorkflowStep} from 'cloudflare:workers' */
import { WorkflowEntrypoint } from 'cloudflare:workers'
import { getChainClient as defaultGetChainClient } from './chain.js'

/**
 * Workflow that monitors a transaction and starts cancel workflow if it takes
 * too long
 */
export class TransactionMonitorWorkflow extends WorkflowEntrypoint {
  /**
   * @param {WorkflowEvent} event
   * @param {WorkflowStep} step
   */
  async run(
    { payload },
    step,
    { getChainClient = defaultGetChainClient } = {},
  ) {
    const { transactionHash } = payload
    const tx = step.do('get transaction details', async () => {
      const { publicClient } = getChainClient(this.env)
      return await publicClient.getTransaction({
        hash: transactionHash,
      })
    })

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
      // Send message to cancel queue
      await step.do(
        'send to cancel queue',
        { timeout: '30 seconds' },
        async () => {
          await this.env.TRANSACTION_QUEUE.send({
            type: 'transaction-cancel',
            transactionHash,
            nonce: tx.nonce,
          })
        },
      )
    }
  }
}
