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
    const requestParams = {
      to: pdpVerifierAddress,
      data: pdpVerifierIface.encodeFunctionData('getRootCid', [setId, rootId]),
    }

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
        params: [requestParams, 'latest'],
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
    const cidBytes = Buffer.from(rootCidRaw.slice(2), 'hex')
    try {
      const rootCid = CID.decode(cidBytes)
      return rootCid.toString()
    } catch (err) {
      throw new Error(`Cannot decode getRootCid() response "${rootCidRaw}"`, {
        cause: err,
      })
    }
  }

  return { getRootCid }
}
