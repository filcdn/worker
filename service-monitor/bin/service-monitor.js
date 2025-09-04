/** @import {MessageBatch} from 'cloudflare:workers' */
import { TransactionMonitorWorkflow } from '../lib/transaction-workflows.js'
import { terminateCDNServiceForSanctionedWallets } from '../lib/terminate-cdn-service.js'
import {
  handleTerminateServiceQueueMessage,
  handleTransactionCancelQueueMessage,
} from '../lib/queue-handlers.js'

/**
 * @typedef {{
 *   type: 'terminate-service'
 *   dataSetId: number
 * }} TerminateServiceMessage
 */

/**
 * @typedef {{
 *   type: 'transaction-cancel'
 *   transactionHash: string
 * }} TransactionCancelMessage
 */

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
 *   TERMINATE_SERVICE_QUEUE: import('cloudflare:workers').Queue<TerminateServiceMessage>
 *   TRANSACTION_QUEUE: import('cloudflare:workers').Queue<
 *     | TerminateServiceMessage
 *     | TransactionCancelMessage
 *     | TransactionRetryMessage
 *   >
 *   TRANSACTION_MONITOR_WORKFLOW: import('cloudflare:workers').WorkflowEntrypoint
 * }} ServiceMonitorEnv
 *   }} ServiceMonitorEnv
 */

export default {
  /**
   * @param {any} _controller
   * @param {ServiceMonitorEnv} env
   * @param {ExecutionContext} _ctx
   */
  async scheduled(_controller, env, _ctx) {
    await terminateCDNServiceForSanctionedWallets(env)
  },

  /**
   * Queue consumer for all transaction-related messages
   *
   * @param {MessageBatch<
   *   TerminateServiceMessage | TransactionCancelMessage
   * >} batch
   * @param {ServiceMonitorEnv} env
   * @param {ExecutionContext} ctx
   */
  async queue(batch, env, ctx) {
    for (const message of batch.messages) {
      console.log(
        `Processing transaction queue message of type: ${message.type}`,
      )
      try {
        switch (message.type) {
          case 'terminate-service':
            return await handleTerminateServiceQueueMessage(message, env)

          case 'transaction-cancel':
            return await handleTransactionCancelQueueMessage(message, env)

          default:
            console.error(`Unknown message type: ${message.type}`)
        }
        message.ack()
      } catch (error) {
        console.error(`Failed to process queue message:`, error)
        message.retry()
      }
    }
  },
}

// Re-export workflows
export { TransactionMonitorWorkflow }
