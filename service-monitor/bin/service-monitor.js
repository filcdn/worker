/** @import {WorkflowEvent, WorkflowStep} from 'cloudflare:workers' */
import { WorkflowEntrypoint, DurableObject } from 'cloudflare:workers'
import { getFilecoinWarmStorageServiceContract as defaultGetFilecoinWarmStorageServiceContract } from '../lib/contracts.js'
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
 * }} ServiceMonitorEnv
 */

export default {
  /**
   * @param {any} _controller
   * @param {ServiceMonitorEnv} env
   * @param {ExecutionContext} _ctx
   *
   *   - Function to get the contract instance
   */
  async scheduled(_controller, env, _ctx) {
    await terminateCDNServiceForSanctionedClients(env)
  },
}

export class NonceManager extends DurableObject {
  /**
   * @param {DurableObjectState} state
   * @param {Env} env
   */
  constructor(state, env) {
    super(state, env)

    // Initialize nonce manager with maps
    /** @type {Map<string, number>} */
    this.deltaMap = new Map()
    /** @type {Map<string, number>} */
    this.nonceMap = new Map()
    /** @type {Map<string, Promise<number>>} */
    this.promiseMap = new Map()
  }

  async consume({ address, chainId, client }) {
    const key = this.#getKey({ address, chainId })
    const promise = this.nonceManager.get({ address, chainId, client })

    this.nonceManager.increment({ address, chainId })
    const nonce = await promise

    await this.#setNonceInSource({ address, chainId }, nonce)
    this.nonceMap.set(key, nonce)

    return nonce
  }

  increment({ address, chainId }) {
    const key = this.#getKey({ address, chainId })
    const delta = this.deltaMap.get(key) ?? 0
    this.deltaMap.set(key, delta + 1)
  }

  async get({ address, chainId, client }) {
    const key = this.#getKey({ address, chainId })

    let promise = this.promiseMap.get(key)
    if (!promise) {
      promise = (async () => {
        try {
          const nonce = await this.#getNonceFromSource({
            address,
            chainId,
            client,
          })
          const previousNonce = this.nonceMap.get(key) ?? 0
          if (previousNonce > 0 && nonce <= previousNonce) {
            return previousNonce + 1
          }
          this.nonceMap.delete(key)
          return nonce
        } finally {
          this.nonceManager.reset({ address, chainId })
        }
      })()
      this.promiseMap.set(key, promise)
    }

    const delta = this.deltaMap.get(key) ?? 0
    return delta + (await promise)
  }

  reset({ address, chainId }) {
    const key = this.#getKey({ address, chainId })
    this.deltaMap.delete(key)
    this.promiseMap.delete(key)
  }

  /**
   * Generate a unique key for address and chain combination
   *
   * @private
   * @param {object} params - Address and chain parameters
   * @param {string} params.address - Ethereum address
   * @param {number} params.chainId - Chain ID
   * @returns {string} Unique key
   */
  #getKey({ address, chainId }) {
    return `${address.toLowerCase()}.${chainId}`
  }

  /**
   * Load nonce data from storage
   *
   * @private
   * @param {string} key - Storage key
   */
  async #loadFromStorage(key) {
    if (!this.nonceMap.has(key)) {
      const stored = await this.state.storage.get(`nonce:${key}`)
      if (stored !== undefined) {
        this.nonceMap.set(key, stored)
      }
    }

    if (!this.deltaMap.has(key)) {
      const storedDelta = await this.state.storage.get(`delta:${key}`)
      if (storedDelta !== undefined) {
        this.deltaMap.set(key, storedDelta)
      } else {
        this.deltaMap.set(key, 0)
      }
    }
  }

  /**
   * Save nonce data to storage
   *
   * @private
   * @param {string} key - Storage key
   */
  async #saveToStorage(key) {
    const nonce = this.nonceMap.get(key)
    const delta = this.deltaMap.get(key)

    if (nonce !== undefined) {
      await this.state.storage.put(`nonce:${key}`, nonce)
    }
    if (delta !== undefined) {
      await this.state.storage.put(`delta:${key}`, delta)
    }
  }

  /**
   * Get nonce from storage source
   *
   * @private
   * @param {object} params
   * @param {string} params.address - Ethereum address
   * @param {number} params.chainId - Chain ID
   * @param {any} params.client - Client instance
   * @returns {Promise<number>} Nonce value
   */
  async #getNonceFromSource({ address, chainId, client }) {
    const key = this.#getKey({ address, chainId })
    await this.#loadFromStorage(key)

    // Return stored nonce or 0 if not found
    return this.nonceMap.get(key) || 0
  }

  /**
   * Set nonce in storage source
   *
   * @private
   * @param {object} params
   * @param {string} params.address - Ethereum address
   * @param {number} params.chainId - Chain ID
   * @param {number} nonce - Nonce value to set
   */
  async #setNonceInSource({ address, chainId }, nonce) {
    const key = this.#getKey({ address, chainId })
    this.nonceMap.set(key, nonce)
    await this.#saveToStorage(key)
  }
}

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
