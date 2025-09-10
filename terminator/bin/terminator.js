/** @import {MessageBatch} from 'cloudflare:workers' */
import { TransactionMonitorWorkflow } from '../lib/transaction-monitor-workflow.js'
import { terminateCDNServiceForSanctionedWallets as defaultTerminateCDNServiceForSanctionedWallets } from '../lib/terminate-cdn-service.js'
import {
  handleTerminateCdnServiceQueueMessage as defaultHandleTerminateCdnServiceQueueMessage,
  handleTransactionCancelQueueMessage as defaultHandleTransactionCancelQueueMessage,
} from '../lib/queue-handlers.js'

/**
 * @typedef {{
 *   type: 'terminate-cdn-service'
 *   dataSetId: string
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
 *   TRANSACTION_QUEUE: import('cloudflare:workers').Queue<
 *     TerminateServiceMessage | TransactionCancelMessage
 *   >
 *   TRANSACTION_MONITOR_WORKFLOW: import('cloudflare:workers').WorkflowEntrypoint
 * }} TerminatorEnv
 */

export default {
  /**
   * @param {any} _controller
   * @param {TerminatorEnv} env
   * @param {ExecutionContext} _ctx
   * @param {object} options
   * @param {typeof defaultTerminateCDNServiceForSanctionedWallets} [options.terminateCDNServiceForSanctionedWallets]
   */
  async scheduled(
    _controller,
    env,
    _ctx,
    {
      terminateCDNServiceForSanctionedWallets = defaultTerminateCDNServiceForSanctionedWallets,
    } = {},
  ) {
    await terminateCDNServiceForSanctionedWallets(env)
  },

  /**
   * Queue consumer for all transaction-related messages
   *
   * @param {MessageBatch<
   *   TerminateServiceMessage | TransactionCancelMessage
   * >} batch
   * @param {TerminatorEnv} env
   * @param {ExecutionContext} ctx
   */
  async queue(
    batch,
    env,
    ctx,
    {
      handleTerminateCdnServiceQueueMessage = defaultHandleTerminateCdnServiceQueueMessage,
      handleTransactionCancelQueueMessage = defaultHandleTransactionCancelQueueMessage,
    } = {},
  ) {
    for (const message of batch.messages) {
      console.log(
        `Processing transaction queue message of type: ${message.type}`,
      )
      try {
        switch (message.body.type) {
          case 'terminate-cdn-service':
            await handleTerminateCdnServiceQueueMessage(message.body, env)
            break

          case 'transaction-cancel':
            await handleTransactionCancelQueueMessage(message.body, env)
            break

          default:
            throw new Error(`Unknown message type: ${message.body.type}`)
        }
        message.ack()
      } catch (error) {
        console.error(`Failed to process queue message, retrying:`, error)
        message.retry()
      }
    }
  },
}

// Re-export workflows
export { TransactionMonitorWorkflow }
