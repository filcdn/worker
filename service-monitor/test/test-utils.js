import { vi } from 'vitest'

/** Common test fixtures and utilities for service-monitor tests */

// Mock environment factory
export const createMockEnv = (overrides = {}) => ({
  ENVIRONMENT: 'calibration',
  RPC_URL: 'https://api.calibration.node.glif.io/',
  FILECOIN_WARM_STORAGE_SERVICE_ADDRESS:
    '0x1234567890abcdef1234567890abcdef12345678',
  FILCDN_CONTROLLER_ADDRESS_PRIVATE_KEY:
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
  TRANSACTION_MONITOR_WORKFLOW: {
    create: vi.fn().mockResolvedValue(undefined),
  },
  TRANSACTION_QUEUE: {
    send: vi.fn().mockResolvedValue(undefined),
  },
  TERMINATE_SERVICE_QUEUE: {
    sendBatch: vi.fn().mockResolvedValue(undefined),
  },
  DB: {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
    }),
    exec: vi.fn().mockResolvedValue(undefined),
  },
  ...overrides,
})

// Mock account factory
export const createMockAccount = () => ({
  address: '0x1234567890abcdef1234567890abcdef12345678',
})

// Mock wallet client factory
export const createMockWalletClient = (overrides = {}) => ({
  getTransactionCount: vi.fn().mockResolvedValue(42),
  writeContract: vi.fn().mockResolvedValue('0xtxhash123'),
  sendTransaction: vi.fn().mockResolvedValue('0xtxhash123'),
  ...overrides,
})

// Mock public client factory
export const createMockPublicClient = (overrides = {}) => ({
  getTransaction: vi.fn().mockResolvedValue({
    nonce: 42,
    hash: '0xoriginalhash123',
    gasPrice: 1000000000n,
    maxFeePerGas: null,
    maxPriorityFeePerGas: null,
  }),
  simulateContract: vi.fn().mockResolvedValue({
    request: {
      address: '0xcontract',
      abi: ['function terminateCDNService(uint256) external'],
      functionName: 'terminateCDNService',
      args: [123],
    },
  }),
  getTransactionReceipt: vi.fn().mockResolvedValue({
    status: 'success',
    transactionHash: '0xoriginalhash123',
  }),
  ...overrides,
})

// Mock chain client factory
export const createMockChainClient = (overrides = {}) => ({
  walletClient: createMockWalletClient(overrides.walletClient),
  publicClient: createMockPublicClient(overrides.publicClient),
})

// Helper to seed a sanctioned wallet
export async function withSanctionedWallet(env, address) {
  await env.DB.prepare(
    `INSERT INTO wallet_details (address, is_sanctioned, last_screened_at) VALUES (?, ?, datetime('now'))`,
  )
    .bind(address, 1)
    .run()
}

// Helper to seed a data set
export async function withDataSet(
  env,
  { id, storageProviderAddress, payerAddress, payeeAddress, withCDN = true },
) {
  await env.DB.prepare(
    `INSERT INTO data_sets (id, storage_provider_address, payer_address, payee_address, with_cdn) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, storageProviderAddress, payerAddress, payeeAddress, withCDN)
    .run()
}

// Common test data
export const TEST_ADDRESSES = {
  SANCTIONED: '0xSanctionedAddress123',
  STORAGE_PROVIDER: '0x2A06D234246eD18b6C91de8349fF34C22C7268e2',
  PAYER: '0x1234567890abcdef1234567890abcdef12345678',
  PAYEE: '0x9876543210fedcba9876543210fedcba98765432',
}

export const TEST_DATA_SETS = {
  BASIC: {
    id: '1',
    storageProviderAddress: TEST_ADDRESSES.STORAGE_PROVIDER,
    payerAddress: TEST_ADDRESSES.PAYER,
    payeeAddress: TEST_ADDRESSES.PAYEE,
  },
  WITH_SANCTIONED_PROVIDER: {
    id: '2',
    storageProviderAddress: TEST_ADDRESSES.SANCTIONED,
    payerAddress: TEST_ADDRESSES.PAYER,
    payeeAddress: TEST_ADDRESSES.PAYEE,
  },
}

export const TEST_TRANSACTIONS = {
  PENDING: {
    hash: '0xoriginalhash123',
    nonce: 42,
    gasPrice: 1000000000n,
    maxFeePerGas: null,
    maxPriorityFeePerGas: null,
  },
  EIP1559: {
    hash: '0xoriginalhash456',
    nonce: 43,
    gasPrice: null,
    maxFeePerGas: 2000000000n,
    maxPriorityFeePerGas: 1000000000n,
  },
}
