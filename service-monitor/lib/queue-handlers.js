import { getChainClient as defaultGetChainClient } from './chain.js'

/**
 * @typedef {{
 *   type: 'terminate-cdn-service'
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
 *   ENVIRONMENT: 'dev' | 'calibration' | 'mainnet'
 *   RPC_URL: string
 *   FILECOIN_WARM_STORAGE_SERVICE_ADDRESS: string
 *   FILCDN_CONTROLLER_ADDRESS_PRIVATE_KEY: string
 *   TRANSACTION_MONITOR_WORKFLOW: import('cloudflare:workers').WorkflowEntrypoint
 *   TRANSACTION_QUEUE: import('cloudflare:workers').Queue<
 *     | TerminateServiceMessage
 *     | TransactionCancelMessage
 *     | TransactionRetryMessage
 *   >
 * }} Env
 */

/**
 * Handles terminate CDN service queue messages
 *
 * @param {TerminateServiceMessage} message
 * @param {Env} env
 */
export async function handleTerminateServiceQueueMessage(
  message,
  env,
  { getChainClient = defaultGetChainClient } = {},
) {
  const { dataSetId } = message

  console.log(
    `Processing terminate CDN service request for dataSetId: ${dataSetId}`,
  )

  try {
    // Get contract instance
    const { walletClient, publicClient } = getChainClient(env)

    // Create contract call
    const { request } = await publicClient.simulateContract({
      address: env.FILECOIN_WARM_STORAGE_SERVICE_ADDRESS,
      abi: ['function terminateCDNService(uint256) external'],
      functionName: 'terminateCDNService',
      args: [dataSetId],
    })

    console.log(
      `Sending terminateCDNService transaction for dataSetId: ${dataSetId}`,
    )

    // Send transaction
    const hash = await walletClient.writeContract(request)

    console.log(`Transaction sent for dataSetId: ${dataSetId}, hash: ${hash}`)

    // Start transaction monitor workflow
    await env.TRANSACTION_MONITOR_WORKFLOW.create({
      transactionHash: hash,
    })

    console.log(`Started transaction monitor workflow for transaction: ${hash}`)
  } catch (error) {
    console.error(
      `Failed to process terminate CDN service for dataSetId: ${dataSetId}`,
      error,
    )
    throw error
  }
}

/**
 * Handles transaction cancellation queue messages
 *
 * @param {TransactionCancelMessage} message
 * @param {Env} env
 */
export async function handleTransactionCancelQueueMessage(
  message,
  env,
  { getChainClient = defaultGetChainClient } = {},
) {
  const { transactionHash } = message

  console.log(
    `Processing transaction cancellation for hash: ${transactionHash}`,
  )

  try {
    const { publicClient, walletClient } = getChainClient(env)

    // First check if the original transaction is still pending
    try {
      await publicClient.getTransactionReceipt({
        hash: transactionHash,
      })
      console.log(
        `Transaction ${transactionHash} is no longer pending, cancellation not needed`,
      )
      return
    } catch (error) {
      // Transaction not found or still pending, continue with cancellation
      console.log(
        `Transaction ${transactionHash} is still pending, proceeding with cancellation`,
      )
    }

    // Get the original transaction to determine gas price
    const originalTx = await publicClient.getTransaction({
      hash: transactionHash,
    })

    console.log(
      `Retrieved original transaction ${transactionHash} for cancellation`,
    )

    // Calculate higher gas price (150% of original)
    const newGasPrice = originalTx.gasPrice
      ? (originalTx.gasPrice * 3n) / 2n
      : undefined
    const newMaxFeePerGas = originalTx.maxFeePerGas
      ? (originalTx.maxFeePerGas * 3n) / 2n
      : undefined
    const newMaxPriorityFeePerGas = originalTx.maxPriorityFeePerGas
      ? (originalTx.maxPriorityFeePerGas * 3n) / 2n
      : undefined

    // Send empty transaction to same address with same nonce but higher gas to cancel
    const cancelHash = await walletClient.sendTransaction({
      to: originalTx.to,
      value: 0n,
      nonce: originalTx.nonce,
      gasPrice: newGasPrice,
      maxFeePerGas: newMaxFeePerGas,
      maxPriorityFeePerGas: newMaxPriorityFeePerGas,
    })

    console.log(
      `Sent cancellation transaction ${cancelHash} for original transaction ${transactionHash}`,
    )

    // Start a new transaction monitor workflow for the cancellation transaction
    await env.TRANSACTION_MONITOR_WORKFLOW.create({
      transactionHash: cancelHash,
    })

    console.log(
      `Started transaction monitor workflow for cancellation: ${cancelHash}`,
    )
  } catch (error) {
    console.error(
      `Failed to process transaction cancellation for hash: ${transactionHash}`,
      error,
    )
    throw error
  }
}
