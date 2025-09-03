import { createWalletClient, getContract, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { filecoinCalibration, filecoin } from 'viem/chains'

const filecoinWarmStorageServiceAbi = [
  'function terminateCDNService(uint256) external',
]

export function getFilecoinWarmStorageServiceContract(env) {
  const chain = env.ENVIRONMENT === 'mainnet' ? filecoin : filecoinCalibration

  const walletClient = createWalletClient({
    chain,
    transport: http(env.RPC_URL),
    account: privateKeyToAccount(env.FILCDN_CONTROLLER_ADDRESS_PRIVATE_KEY),
  })

  const contract = getContract({
    address: env.FILECOIN_WARM_STORAGE_SERVICE_ADDRESS,
    client: { wallet: walletClient },
    abi: filecoinWarmStorageServiceAbi,
  })

  return contract
}
