import { handleAdminApi } from './admin-api/auth'
import { integrationRegistry } from './integrations'
import {
  createOAuthProvider,
  protectOAuthRequest,
  type McpOAuthEnv,
} from './mcp/oauth'

export type Env = McpOAuthEnv

function defaultExecutionContext(): ExecutionContext {
  return {
    waitUntil() {},
    passThroughOnException() {},
  } as unknown as ExecutionContext
}

function isBoundary(pathname: string, boundary: string): boolean {
  return pathname === boundary || pathname.startsWith(`${boundary}/`)
}

function usesOAuthProvider(pathname: string): boolean {
  return (
    isBoundary(pathname, '/mcp') ||
    pathname === '/api/mcp/oauth/authorize' ||
    pathname === '/api/mcp/oauth/grants' ||
    pathname === '/api/mcp/oauth/revoke' ||
    pathname === '/oauth/token' ||
    pathname === '/oauth/register' ||
    pathname === '/.well-known/oauth-authorization-server' ||
    isBoundary(pathname, '/.well-known/oauth-protected-resource')
  )
}

export async function handleRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext = defaultExecutionContext(),
): Promise<Response> {
  const { pathname } = new URL(request.url)
  if (!usesOAuthProvider(pathname)) {
    if (isBoundary(pathname, '/api')) {
      return handleAdminApi(request, env, integrationRegistry)
    }
    return env.ASSETS.fetch(request)
  }

  const protectionError = await protectOAuthRequest(request, env)
  if (protectionError) return protectionError
  const provider = createOAuthProvider(request, integrationRegistry)
  return provider.fetch(request, env, ctx)
}

export default {
  fetch: handleRequest,
} satisfies ExportedHandler<Env>
