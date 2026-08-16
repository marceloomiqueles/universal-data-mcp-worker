import { handleAdminApi, type AuthEnv } from './admin-api/auth'

export interface Env extends AuthEnv {
  ASSETS: {
    fetch(request: Request): Promise<Response>
  }
}

function isBoundary(pathname: string, boundary: string): boolean {
  return pathname === boundary || pathname.startsWith(`${boundary}/`)
}

function boundaryResponse(boundary: 'admin-api' | 'mcp'): Response {
  return Response.json(
    {
      boundary,
      status: 'not-implemented',
    },
    { status: 501 },
  )
}

export async function handleRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const { pathname } = new URL(request.url)

  if (isBoundary(pathname, '/api')) {
    return handleAdminApi(request, env)
  }

  if (isBoundary(pathname, '/mcp')) {
    return boundaryResponse('mcp')
  }

  return env.ASSETS.fetch(request)
}

export default {
  fetch: handleRequest,
} satisfies ExportedHandler<Env>
