import { assertOkResponse } from 'assert-ok-response'
import { Interface } from '@ethersproject/abi'
import { CID } from 'multiformats/cid'

// The ABI is based on the PDPVerifier source
// https://github.com/FilOzone/pdp/blob/main/src/PDPVerifier.sol
export const pdpVerifierAbi = [
  // Returns the owner of a proof set and the proposed owner if any
  'function getProofSetOwner(uint256 setId) public view returns (address, address)',
  // Returns the root CID for a given proof set and root ID
  'function getRootCid(uint256 setId, uint256 rootId) public view returns (tuple(bytes))',
]

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
  const authorization = glifToken ? `Bearer ${glifToken}` : ''
  const pdpVerifierIface = new Interface(pdpVerifierAbi)

  /**
   * @param {BigInt} setId
   * @param {BigInt} rootId
   * @returns {Promise<string>} The CID in string format (`baga...`)
   */
  const getRootCid = async (setId, rootId) => {
    const result = await callEth({
      rpcUrl,
      authorization,
      contractAddress: pdpVerifierAddress,
      callData: pdpVerifierIface.encodeFunctionData('getRootCid', [
        setId,
        rootId,
      ]),
    })

    const returnValues = pdpVerifierIface.decodeFunctionResult(
      'getRootCid',
      result,
    )

    const [[rootCidRaw]] = returnValues
    const cidBytes = Buffer.from(rootCidRaw.slice(2), 'hex')
    const rootCid = CID.decode(cidBytes)
    return rootCid.toString()
  }

  /**
   * @param {BigInt} setId
   * @returns {Promise<string>} The owner address in string format (`0x...`)
   */
  const getProofSetOwner = async (setId) => {
    const result = await callEth({
      rpcUrl,
      authorization,
      contractAddress: pdpVerifierAddress,
      callData: pdpVerifierIface.encodeFunctionData('getProofSetOwner', [
        setId,
      ]),
    })

    const returnValues = pdpVerifierIface.decodeFunctionResult(
      'getProofSetOwner',
      result,
    )

    const [currentOwner /** , nextOwner */] = returnValues
    return currentOwner
  }

  return { getRootCid, getProofSetOwner }
}

/**
 * @param {object} params
 * @param {string} params.rpcUrl
 * @param {string} params.authorization
 * @param {string} params.contractAddress
 * @param {string} params.callData
 * @param {number | 'latest'} [params.blockNumber]
 * @returns {Promise<string>}
 */
async function callEth({
  rpcUrl,
  authorization,
  contractAddress,
  callData,
  blockNumber = 'latest',
}) {
  // TODO: add p-retry

  const rpcResponse = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      authorization,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [
        {
          to: contractAddress,
          data: callData,
        },
        blockNumber,
      ],
    }),
  })
  await assertOkResponse(rpcResponse)

  /** @type {any} */
  const resBody = await rpcResponse.json()
  if (resBody.error) {
    throw new Error(`RPC error: ${JSON.stringify(resBody.error, null, 2)}`)
  }
  if (!resBody.result) {
    throw new Error('RPC error: empty result.')
  }
  return resBody.result
}
