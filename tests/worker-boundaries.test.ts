import { describe, expect, it } from 'vitest'

import { handleRequest } from '../src/worker/index'

const assets = {
  fetch: async () =>
    new Response('<!doctype html><html><body>SPA</body></html>', {
      headers: { 'content-type': 'text/html' },
    }),
} as Fetcher

describe('Worker routing boundaries', () => {
  it.each([
    ['/api/status', 'admin-api'],
    ['/mcp/session', 'mcp'],
  ])('keeps %s out of the SPA', async (path, boundary) => {
    const response = await handleRequest(
      new Request(`https://example.test${path}`),
      {
        ASSETS: assets,
      },
    )

    expect(response.status).toBe(501)
    expect(response.headers.get('content-type')).toContain('application/json')
    await expect(response.json()).resolves.toEqual({
      boundary,
      status: 'not-implemented',
    })
  })

  it('delegates browser routes to the static asset binding', async () => {
    const response = await handleRequest(
      new Request('https://example.test/status'),
      {
        ASSETS: assets,
      },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
  })
})
