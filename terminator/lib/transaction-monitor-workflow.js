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

      await step.do('clean when transaction confirmed', {}, async () => {
        this.env.DB.prepare(
          'UPDATE data_sets SET terminate_service_tx_hash = NULL WHERE terminate_service_tx_hash = ?',
        )
          .bind(transactionHash)
          .run()
      })
    } catch (error) {
      // Send message to cancel queue
      await step.do(
        'send to cancel queue',
        { timeout: '30 seconds' },
        async () => {
          await this.env.TRANSACTION_QUEUE.send({
            type: 'transaction-cancel',
            transactionHash,
          })
        },
      )
    }
  }
}
