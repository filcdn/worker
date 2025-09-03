import { createPublicClient, createWalletClient, getContract, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { filecoinCalibration, filecoin } from 'viem/chains'

const filecoinWarmStorageServiceAbi = [
  'function terminateCDNService(uint256) external',
]

/**
 * @param {{
 *   ENVIRONMENT: 'mainnet' | 'calibration' | 'dev'
 *   RPC_URL: string
 * }} env
 * @returns
 */
export function getFilecoinWarmStorageServiceContract(env) {
  const chain = env.ENVIRONMENT === 'mainnet' ? filecoin : filecoinCalibration
  const transport = http(env.RPC_URL)

  const publicClient = createPublicClient({
    chain,
    transport,
  })

  const nonceManagerId = this.env.NONCE_MANAGER.idFromName(
    this.env.FILCDN_CONTROLLER_ADDRESS_PRIVATE_KEY,
  )
  const nonceManager = this.env.NONCE_MANAGER.get(nonceManagerId)

  const walletClient = createWalletClient({
    chain,
    transport,
    account: privateKeyToAccount(env.FILCDN_CONTROLLER_ADDRESS_PRIVATE_KEY, {
      nonceManager,
    }),
  })

  const contract = getContract({
    address: env.FILECOIN_WARM_STORAGE_SERVICE_ADDRESS,
    client: { public: publicClient, wallet: walletClient },
    abi: filecoinWarmStorageServiceAbi,
  })

  return contract
}
