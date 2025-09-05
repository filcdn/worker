import { describe, it, expect } from 'vitest'
import { getChainClient } from '../lib/chain.js'

describe('getChainClient', () => {
  it('creates clients for mainnet environment', async () => {
    const env = {
      ENVIRONMENT: 'mainnet',
      RPC_URL: 'https://api.node.glif.io/',
      FILECOIN_WARM_STORAGE_SERVICE_ADDRESS:
        '0x90f8bf6a479f320ead074411a4b0e7944ea8c9c1',
      FILCDN_CONTROLLER_ADDRESS_PRIVATE_KEY:
        '0x4c0883a69102937d6231471b5dbb6204fe5129617082796fbc48dfcb573d7e0c',
    }

    const { walletClient, publicClient } = getChainClient(env)
    expect(walletClient).toBeDefined()
    expect(publicClient).toBeDefined()
    const chainId = await publicClient.getChainId()
    expect(chainId).toBe(314)
  })

  it('creates clients for calibration environment', async () => {
    const env = {
      ENVIRONMENT: 'calibration',
      RPC_URL: 'https://api.calibration.node.glif.io/',
      FILECOIN_WARM_STORAGE_SERVICE_ADDRESS:
        '0x90f8bf6a479f320ead074411a4b0e7944ea8c9c1',
      FILCDN_CONTROLLER_ADDRESS_PRIVATE_KEY:
        '0x4c0883a69102937d6231471b5dbb6204fe5129617082796fbc48dfcb573d7e0c',
    }

    const { walletClient, publicClient } = getChainClient(env)
    expect(walletClient).toBeDefined()
    expect(publicClient).toBeDefined()
    const chainId = await publicClient.getChainId()
    expect(chainId).toBe(314159)
  })

  it('creates clients for dev environment (uses calibration chain)', async () => {
    const env = {
      ENVIRONMENT: 'calibration',
      RPC_URL: 'https://api.calibration.node.glif.io/',
      FILECOIN_WARM_STORAGE_SERVICE_ADDRESS:
        '0x90f8bf6a479f320ead074411a4b0e7944ea8c9c1',
      FILCDN_CONTROLLER_ADDRESS_PRIVATE_KEY:
        '0x4c0883a69102937d6231471b5dbb6204fe5129617082796fbc48dfcb573d7e0c',
    }

    const { walletClient, publicClient } = getChainClient(env)
    expect(walletClient).toBeDefined()
    expect(publicClient).toBeDefined()
    const chainId = await publicClient.getChainId()
    expect(chainId).toBe(314159)
  })
})
