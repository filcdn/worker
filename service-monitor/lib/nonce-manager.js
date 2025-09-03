import { DurableObject } from 'cloudflare:workers'

export class NonceManager extends DurableObject {
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
    const promise = this.get({ address, chainId, client })

    this.increment({ address, chainId })
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
          this.reset({ address, chainId })
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
