import validator from 'validator'
import { Interface } from '@ethersproject/abi'
import { assertOkResponse } from 'assert-ok-response'

const serviceProviderRegistryAbi = [
  'struct PDPOffering { string serviceURL; uint256 minPieceSizeInBytes; uint256 maxPieceSizeInBytes; bool ipniPiece; bool ipniIpfs; uint256 storagePricePerTibPerMonth; // Storage price per TiB per month in attoFIL }',
  'struct ServiceProviderInfo { address beneficiary; string description; bool isActive; }',
  'function getPDPService(uint256 providerId) external view returns (PDPOffering, string[], bool)',
  'function getProvider(uint256 providerId) external view returns (ServiceProviderInfo)',
]
const serviceProviderRegistryIface = new Interface(serviceProviderRegistryAbi)

/**
 * @param {string} to
 * @param {string} functionName
 * @param {(string | number)[]} args
 * @param {string} glifToken
 * @param {number | 'latest' | 'earliest' | 'pending'} blockNumber
 * @param {string} rpcUrl
 */
export async function rpcRequest(
  to,
  functionName,
  args,
  glifToken,
  blockNumber,
  rpcUrl,
) {
  const requestParams = {
    to,
    data: serviceProviderRegistryIface.encodeFunctionData(functionName, args),
  }
  const authorization = glifToken ? `Bearer ${glifToken}` : ''
  const blockNumberParam =
    typeof blockNumber === 'number'
      ? `0x${blockNumber.toString(16)}`
      : blockNumber
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
  return serviceProviderRegistryIface.decodeFunctionResult(
    functionName,
    resBody.result,
  )
}

/**
 * @param {Env} env
 * @param {function} rpcRequest
 * @param {string | number} providerId
 * @param {string | number} productType
 * @param {string} rpcUrl
 * @param {string} glifToken
 * @param {number | 'latest' | 'earliest' | 'pending'} blockNumber
 * @param {string} serviceProviderRegistryAddress
 * @returns {Promise<Response>}
 */
export async function handleProductAdded(
  env,
  rpcRequest,
  providerId,
  productType,
  rpcUrl,
  glifToken,
  blockNumber,
  serviceProviderRegistryAddress,
) {
  if (
    !providerId ||
    (typeof providerId !== 'string' && typeof providerId !== 'number') ||
    !productType ||
    (typeof productType !== 'string' && typeof productType !== 'number')
  ) {
    console.error('ServiceProviderRegistry.ProductAdded: Invalid payload', {
      providerId,
      productType,
    })
    return new Response('Bad Request', { status: 400 })
  }
  if (Number(productType) !== 0) {
    return new Response('OK', { status: 200 })
  }

  return await handleProviderServiceUrlUpdate(
    env,
    rpcRequest,
    providerId,
    rpcUrl,
    glifToken,
    blockNumber,
    serviceProviderRegistryAddress,
  )
}

/**
 * @param {Env} env
 * @param {function} rpcRequest
 * @param {string | number} providerId
 * @param {string | number} productType
 * @param {string} rpcUrl
 * @param {string} glifToken
 * @param {number | 'latest' | 'earliest' | 'pending'} blockNumber
 * @param {string} serviceProviderRegistryAddress
 * @returns {Promise<Response>}
 */
export async function handleProductUpdated(
  env,
  rpcRequest,
  providerId,
  productType,
  rpcUrl,
  glifToken,
  blockNumber,
  serviceProviderRegistryAddress,
) {
  if (
    !providerId ||
    (typeof providerId !== 'string' && typeof providerId !== 'number') ||
    !productType ||
    (typeof productType !== 'string' && typeof productType !== 'number')
  ) {
    console.error('ServiceProviderRegistry.ProductUpdated: Invalid payload', {
      providerId,
      productType,
    })
    return new Response('Bad Request', { status: 400 })
  }
  if (Number(productType) !== 0) {
    return new Response('OK', { status: 200 })
  }

  return await handleProviderServiceUrlUpdate(
    env,
    rpcRequest,
    providerId,
    rpcUrl,
    glifToken,
    blockNumber,
    serviceProviderRegistryAddress,
  )
}

/**
 * @param {Env} env
 * @param {string | number} providerId
 * @param {string | number} productType
 * @returns {Promise<Response>}
 */
export async function handleProductRemoved(env, providerId, productType) {
  if (
    !providerId ||
    (typeof providerId !== 'string' && typeof providerId !== 'number') ||
    !productType ||
    (typeof productType !== 'string' && typeof productType !== 'number')
  ) {
    console.error('ServiceProviderRegistry.ProductRemoved: Invalid payload', {
      providerId,
      productType,
    })
    return new Response('Bad Request', { status: 400 })
  }
  if (Number(productType) !== 0) {
    return new Response('OK', { status: 200 })
  }

  await env.DB.prepare(
    `
        DELETE FROM providers WHERE id = ?
      `,
  )
    .bind(providerId)
    .run()
  return new Response('OK', { status: 200 })
}

/**
 * @param {Env} env
 * @param {function} rpcRequest
 * @param {string | number} providerId
 * @param {string} rpcUrl
 * @param {string} glifToken
 * @param {number | 'latest' | 'earliest' | 'pending'} blockNumber
 * @param {string} serviceProviderRegistryAddress
 * @returns {Promise<Response>}
 */
async function handleProviderServiceUrlUpdate(
  env,
  rpcRequest,
  providerId,
  rpcUrl,
  glifToken,
  blockNumber,
  serviceProviderRegistryAddress,
) {
  const [[{ serviceUrl }], [{ beneficiary }]] = await Promise.all([
    rpcRequest(
      serviceProviderRegistryAddress,
      'getPDPService',
      [providerId],
      glifToken,
      blockNumber,
      rpcUrl,
    ),
    rpcRequest(
      serviceProviderRegistryAddress,
      'getProvider',
      [providerId],
      glifToken,
      blockNumber,
      rpcUrl,
    ),
  ])
  if (!validator.isURL(serviceUrl)) {
    console.error('ServiceProviderRegistry.ProductAdded: Invalid Service URL', {
      serviceUrl,
    })
    return new Response('Bad Request', { status: 400 })
  }

  console.log(
    `Product added (providerId=${providerId}, serviceUrl=${serviceUrl}, beneficiary=${beneficiary})`,
  )

  await env.DB.prepare(
    `
        INSERT INTO providers (
          id,
          beneficiary,
          service_url
        )
        VALUES (?, ?, ?)
        ON CONFLICT(id, owner) DO UPDATE SET service_url=excluded.service_url
      `,
  )
    .bind(providerId, beneficiary.toLowerCase(), serviceUrl)
    .run()
  return new Response('OK', { status: 200 })
}

/**
 * @param {Env} env
 * @param {string} provider
 * @returns {Promise<Response>}
 */
export async function handleProviderRemoved(env, provider) {
  if (!provider || typeof provider !== 'string') {
    console.error('ProviderRemoved: Invalid payload', { provider })
    return new Response('Bad Request', { status: 400 })
  }

  console.log(`Provider removed (provider=${provider})`)

  /** @type {D1Result<Record<string, unknown>>} */
  const result = await env.DB.prepare(`DELETE FROM providers WHERE owner = ?`)
    .bind(provider.toLowerCase())
    .run()

  // SQLite-specific: result.changes may indicate rows affected
  if (result.meta.changes === 0) {
    return new Response('Provider Not Found', { status: 404 })
  }

  return new Response('OK', { status: 200 })
}
