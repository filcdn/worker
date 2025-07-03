import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkAddresses } from '../lib/sanction-check.js'
import { isValidEthereumAddress } from '../../retriever/lib/address.js'

// Mock the imported address validation function
vi.mock('../../retriever/lib/address.js', () => ({
    isValidEthereumAddress: vi.fn(address => /^0x[a-fA-F0-9]{40}$/.test(address))
}))

// Mock fetch
global.fetch = vi.fn()

describe('sanction-check', () => {
    beforeEach(() => {
        vi.resetAllMocks()
    })

    it('should check addresses against Chainalysis API in batches', async () => {
        // Mock successful batch API response
        fetch.mockImplementation((url, options) => {
            // Verify the API key from environment is being used
            expect(options.headers['X-API-KEY']).toBe('test-api-key-for-unit-tests')

            if (url === 'https://api.chainalysis.com/api/risk/v1/ethereum/addresses') {
                const requestBody = JSON.parse(options.body)
                const mockResponse = {}

                requestBody.addresses.forEach(address => {
                    // Make the first address sanctioned
                    if (address === '0x1234567890abcdef1234567890abcdef12345678') {
                        mockResponse[address] = {
                            risk: { category: 'sanctions' },
                            identifications: [{ category: 'sanctions' }]
                        }
                    } else {
                        mockResponse[address] = {
                            risk: { category: 'low' }
                        }
                    }
                })

                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(mockResponse)
                })
            }

            return Promise.resolve({
                ok: false,
                status: 404
            })
        })

        const addresses = [
            '0x1234567890abcdef1234567890abcdef12345678', // Sanctioned
            '0x2A06D234246eD18b6C91de8349fF34C22C7268e2', // Approved
            'invalid-address' // Should be filtered out
        ]

        // Use the API key from the environment (set in vitest.config.js)
        const env = { CHAINALYSIS_API_KEY: 'test-api-key-for-unit-tests' }
        const results = await checkAddresses(addresses, env.CHAINALYSIS_API_KEY)

        // Should only process valid addresses
        expect(results).toHaveLength(2)

        // Check results
        expect(results).toContainEqual({
            address: '0x1234567890abcdef1234567890abcdef12345678',
            status: 'sanctioned'
        })

        expect(results).toContainEqual({
            address: '0x2A06D234246eD18b6C91de8349fF34C22C7268e2',
            status: 'approved'
        })
    })

    it('should handle API errors gracefully', async () => {
        // Mock API failure
        fetch.mockImplementation(() => {
            return Promise.resolve({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            })
        })

        const addresses = [
            '0x1234567890abcdef1234567890abcdef12345678',
            '0x2A06D234246eD18b6C91de8349fF34C22C7268e2'
        ]

        const results = await checkAddresses(addresses, 'test-api-key')

        // Should mark all addresses as pending when API calls fail
        expect(results).toEqual([
            { address: '0x1234567890abcdef1234567890abcdef12345678', status: 'pending' },
            { address: '0x2A06D234246eD18b6C91de8349fF34C22C7268e2', status: 'pending' }
        ])
    })

    it('should process multiple batches for large address lists', async () => {
        // Create a list of 30 addresses (will require 2 batches with batchSize=25)
        const largeAddressList = Array.from({ length: 30 }, (_, i) =>
            `0x${i.toString().padStart(2, '0')}${'0'.repeat(38)}`
        );

        // Mock successful batch API responses
        let batchCount = 0;
        fetch.mockImplementation((url, options) => {
            if (url === 'https://api.chainalysis.com/api/risk/v1/ethereum/addresses') {
                batchCount++;
                const requestBody = JSON.parse(options.body);
                const mockResponse = {};

                requestBody.addresses.forEach(address => {
                    mockResponse[address] = {
                        risk: { category: 'low' }
                    };
                });

                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(mockResponse)
                });
            }
        });

        await checkAddresses(largeAddressList, 'test-api-key');

        // Verify that fetch was called twice (once for each batch)
        expect(batchCount).toBe(2);
        expect(fetch).toHaveBeenCalledTimes(2);
    })
})



})
