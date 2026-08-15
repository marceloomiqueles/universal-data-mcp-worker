import { describe, expect, it } from 'vitest'

import { handleRequest } from '../src/worker/index'

const assets = {
  fetch: async () =>
    new Response('<!doctype html><html><body>SPA</body></html>', {
      headers: { 'content-type': 'text/html' },
    }),
}

describe('Worker routing boundaries', () => {
  it.each([
    ['/api', 'admin-api'],
    ['/api/', 'admin-api'],
    ['/api/health', 'admin-api'],
    ['/api/health?check=1', 'admin-api'],
    ['/mcp', 'mcp'],
    ['/mcp/', 'mcp'],
    ['/mcp/session', 'mcp'],
    ['/mcp/session?check=1', 'mcp'],
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

  it.each(['/status', '/apiary', '/mcproxy'])(
    'delegates %s to the static asset binding',
    async (path) => {
      const response = await handleRequest(
        new Request(`https://example.test${path}`),
        {
          ASSETS: assets,
        },
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/html')
    },
  )
})
