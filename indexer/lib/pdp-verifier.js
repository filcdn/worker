import { assertOkResponse } from 'assert-ok-response'
import { Interface } from '@ethersproject/abi'
import { CID } from 'multiformats/cid'

export const pdpVerifierAbi = [
  // Returns the root CID for a given proof set and root ID
  'function getRootCid(uint256 setId, uint256 rootId) public view returns (tuple(bytes))',
]

/**
 * @param {object} params
 * @param {string} params.rpcUrl
 * @param {string} [params.glifToken]
 * @param {string} params.pdpVerifierAddress
 * @param {Function} [params.fetch=globalThis.fetch] Default is
 *   `globalThis.fetch`
 */
export function createPdpVerifierClient({
  rpcUrl,
  glifToken,
  pdpVerifierAddress,
  fetch = globalThis.fetch,
}) {
  const authorization = glifToken ? `Bearer ${glifToken}` : ''
  const pdpVerifierIface = new Interface(pdpVerifierAbi)

  /**
   * @param {BigInt} setId
   * @param {BigInt} rootId
   * @param {number | 'latest' | 'earliest' | 'pending'} [blockNumber='latest']
   *   Default is `'latest'`
   * @returns {Promise<string | null>} The CID in string format (`baga...`)
   */
  const getRootCid = async (setId, rootId, blockNumber = 'latest') => {
    const requestParams = {
      to: pdpVerifierAddress,
      data: pdpVerifierIface.encodeFunctionData('getRootCid', [setId, rootId]),
    }

    const blockNumberParam =
      typeof blockNumber === 'number'
        ? `0x${blockNumber.toString(16)}`
        : blockNumber

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
        params: [requestParams, blockNumberParam],
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

    const returnValues = pdpVerifierIface.decodeFunctionResult(
      'getRootCid',
      resBody.result,
    )

    const [[rootCidRaw]] = returnValues

    // When the root was deleted, getRootCid() returns '0x' (an empty byte array?)
    if (rootCidRaw === '0x') return null

    try {
      const cidBytes = Buffer.from(rootCidRaw.slice(2), 'hex')
      const rootCid = CID.decode(cidBytes)
      return rootCid.toString()
    } catch (err) {
      throw new Error(
        `Cannot decode getRootCid() response ${JSON.stringify(returnValues)}`,
        {
          cause: err,
        },
      )
    }
  }

  return { getRootCid }
}
