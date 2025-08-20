import { assertOkResponse } from 'assert-ok-response'
import { Interface } from '@ethersproject/abi'
import { CID } from 'multiformats/cid'

export const pdpVerifierAbi = [
  // Returns the piece CID for a given data set and piece ID
  'function getPieceCid(uint256 setId, uint256 pieceId) public view returns (tuple(bytes))',
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
   * @param {BigInt} dataSetId
   * @param {BigInt} pieceId
   * @param {number | 'latest' | 'earliest' | 'pending'} [blockNumber='latest']
   *   Default is `'latest'`
   * @returns {Promise<string | null>} The CID in string format (`baga...`)
   */
  const getPieceCid = async (dataSetId, pieceId, blockNumber = 'latest') => {
    const requestParams = {
      to: pdpVerifierAddress,
      data: pdpVerifierIface.encodeFunctionData('getPieceCid', [dataSetId, pieceId]),
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
      'getPieceCid',
      resBody.result,
    )

    const [[pieceCidRaw]] = returnValues

    // When the piece was deleted, getPieceCid() returns '0x' (an empty byte array?)
    if (pieceCidRaw === '0x') return null

    try {
      const cidBytes = Buffer.from(pieceCidRaw.slice(2), 'hex')
      const pieceCid = CID.decode(cidBytes)
      return pieceCid.toString()
    } catch (err) {
      throw new Error(
        `Cannot decode getPieceCid() response ${JSON.stringify(returnValues)}`,
        {
          cause: err,
        },
      )
    }
  }

  return { getPieceCid }
}
