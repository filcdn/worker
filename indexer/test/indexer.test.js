import { describe, it, expect } from 'vitest'
import workerImpl from '../bin/indexer.js'
import { env } from 'cloudflare:test'

describe('retriever.indexer', () => {
  it('returns 405 for non-POST requests', async () => {
    const req = new Request('https://host/', { method: 'GET' })
    const res = await workerImpl.fetch(req, env)
    expect(res.status).toBe(405)
    expect(await res.text()).toBe('Method Not Allowed')
  })
  describe('POST /proof-set-created', () => {
    it('returns 400 if set_id or owner is missing', async () => {
      const req = new Request('https://host/proof-set-created', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      const res = await workerImpl.fetch(req, env)
      expect(res.status).toBe(400)
      expect(await res.text()).toBe('Bad Request')
    })
    it('inserts a proof set', async () => {
      const setId = String(Math.ceil(Math.random() * 1e10))
      const req = new Request('https://host/proof-set-created', {
        method: 'POST',
        body: JSON.stringify({ set_id: setId, owner: '0xOwnerAddress' }),
      })
      const res = await workerImpl.fetch(req, env)
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('OK')

      const { results: proofSets } = await env.DB
        .prepare('SELECT * FROM indexer_proof_sets WHERE set_id = ?')
        .bind(setId)
        .all()
      expect(proofSets.length).toBe(1)
      expect(proofSets[0].set_id).toBe(setId)
      expect(proofSets[0].owner).toBe('0xOwnerAddress')
    })
    it('does not insert duplicate proof sets', async () => {
      const setId = String(Math.ceil(Math.random() * 1e10))
      for (let i = 0; i < 2; i++) {
        const req = new Request('https://host/proof-set-created', {
          method: 'POST',
          body: JSON.stringify({ set_id: setId, owner: '0xOwnerAddress' }),
        })
        const res = await workerImpl.fetch(req, env)
        expect(res.status).toBe(200)
        expect(await res.text()).toBe('OK')
      }

      const { results: proofSets } = await env.DB
        .prepare('SELECT * FROM indexer_proof_sets WHERE set_id = ?')
        .bind(setId)
        .all()
      expect(proofSets.length).toBe(1)
    })
  })
})
