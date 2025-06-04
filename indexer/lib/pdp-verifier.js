import { ethers } from 'ethers'
import { CID } from 'multiformats/cid'

export const pdpVerifierAbi = [
  // Returns the next proof set ID
  'function getNextProofSetId() public view returns (uint64)',
  // Returns false if the proof set is 1) not yet created 2) deleted
  'function proofSetLive(uint256 setId) public view returns (bool)',
  // Returns false if the proof set is not live or if the root id is 1) not yet created 2) deleted
  'function rootLive(uint256 setId, uint256 rootId) public view returns (bool)',
  // Returns the next root ID for a proof set
  'function getNextRootId(uint256 setId) public view returns (uint256)',
  // Returns the root CID for a given proof set and root ID
  'function getRootCid(uint256 setId, uint256 rootId) public view returns (tuple(bytes))',
]

/**
 * @typedef {{
 *   getNextProofSetId(): Promise<BigInt>
 *   proofSetLive(setId: BigInt): Promise<Boolean>
 *   rootLive(setId: BigInt, rootId: BigInt): Promise<Boolean>
 *   getNextRootId(setId: BigInt): Promise<BigInt>
 *   getRootCid(setId: BigInt, rootId: BigInt): Promise<[string]>
 * }} PdpVerifier
 */

/**
 * @param {object} params
 * @param {string} params.rpcUrl
 * @param {string} [params.glifToken]
 * @param {string} params.pdpVerifierAddress
 */
export function createPdpVerifierClient({
  rpcUrl,
  glifToken,
  pdpVerifierAddress,
}) {
  const fetchRequest = new ethers.FetchRequest(rpcUrl)
  if (glifToken) {
    fetchRequest.setHeader('Authorization', `Bearer ${glifToken}`)
  }
  const provider = new ethers.JsonRpcProvider(fetchRequest, undefined, {
    polling: true,
  })

  /** @type {PdpVerifier} */
  const pdpVerifier = /** @type {any} */ (
    new ethers.Contract(pdpVerifierAddress, pdpVerifierAbi, provider)
  )

  return pdpVerifier
}

/**
 * @param {PdpVerifier} pdpVerifier
 * @param {BigInt} setId
 * @param {BigInt} rootId
 * @returns
 */
export async function getRootCid(pdpVerifier, setId, rootId) {
  const [rootCidRaw] = await pdpVerifier.getRootCid(setId, rootId)
  const cidBytes = Buffer.from(rootCidRaw.slice(2), 'hex')
  const rootCid = CID.decode(cidBytes)
  return rootCid.toString()
}
