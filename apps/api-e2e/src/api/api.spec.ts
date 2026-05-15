import { describe, it, expect } from 'vitest'
import axios from 'axios'
describe('GET /api', () => {
  it('should return uptime information', async () => {
    const res = await axios.get(`/api/uptime`)
    expect(res.status).toBe(200)
    expect(typeof res.data).toBe('number')
    expect(res.data).toBeGreaterThan(0)
  })
})
