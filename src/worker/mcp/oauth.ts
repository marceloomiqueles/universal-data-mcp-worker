import {
  AuthorizationError,
  OAuthProvider,
  type AuthRequest,
  type OAuthHelpers,
} from '@cloudflare/workers-oauth-provider'

import type { IntegrationRegistry } from '../../core/integrations/registry'
import {
  authenticatedOwner,
  handleAdminApi,
  type AuthEnv,
} from '../admin-api/auth'
import { handleMcpRequest, type McpAuthorization } from './server'

const MCP_SCOPE = 'integrations:read'
const OWNER_ID = 'owner-1'
const OAUTH_RATE_LIMIT_SECONDS = 60

export interface McpOAuthEnv extends AuthEnv {
  ASSETS: {
    fetch(request: Request): Promise<Response>
  }
  OAUTH_KV: KVNamespace
  MCP_OAUTH_RATE_LIMITER: RateLimit
  OAUTH_PROVIDER?: OAuthHelpers
}

function htmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function oauthErrorResponse(error: AuthorizationError): Response {
  if (!error.redirectUri) {
    return new Response('The authorization request is invalid.', {
      status: 400,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  const redirect = new URL(error.redirectUri)
  redirect.searchParams.set('error', error.code)
  redirect.searchParams.set('error_description', error.description)
  if (error.state) redirect.searchParams.set('state', error.state)
  if (error.issuer) redirect.searchParams.set('iss', error.issuer)
  return Response.redirect(redirect.toString(), 302)
}

async function parsedAuthorizationRequest(
  request: Request,
  helpers: OAuthHelpers,
): Promise<AuthRequest | Response> {
  try {
    return await helpers.parseAuthRequest(request)
  } catch (cause) {
    if (cause instanceof AuthorizationError) return oauthErrorResponse(cause)
    throw cause
  }
}

function consentPage(clientName: string, redirectUri: string): Response {
  const safeClientName = htmlEscape(clientName)
  const redirectOrigin = new URL(redirectUri).origin
  return new Response(
    `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorize MCP access</title></head>
<body><main>
<h1>Authorize MCP access</h1>
<p><strong>${safeClientName}</strong> requests read-only access to list the integrations registered in this deployment.</p>
<form method="post"><button name="decision" value="approve" type="submit">Authorize</button> <button name="decision" value="deny" type="submit">Deny</button></form>
</main></body></html>`,
    {
      headers: {
        'cache-control': 'no-store',
        'content-security-policy': `default-src 'none'; form-action 'self' ${redirectOrigin}; base-uri 'none'; frame-ancestors 'none'`,
        'content-type': 'text/html; charset=utf-8',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
      },
    },
  )
}

function authorizationRedirect(request: AuthRequest, code: string): Response {
  const redirect = new URL(request.redirectUri)
  redirect.searchParams.set('error', code)
  if (request.state) redirect.searchParams.set('state', request.state)
  if (request.issuer) redirect.searchParams.set('iss', request.issuer)
  return Response.redirect(redirect.toString(), 302)
}

async function handleAuthorization(
  request: Request,
  env: McpOAuthEnv,
): Promise<Response> {
  const owner = await authenticatedOwner(request, env)
  if (!owner) {
    const current = new URL(request.url)
    const returnTo = `${current.pathname}${current.search}`
    return Response.redirect(
      new URL(
        `/login?redirect=${encodeURIComponent(returnTo)}`,
        current.origin,
      ).toString(),
      302,
    )
  }

  const requestOrigin = request.headers.get('origin')
  if (
    request.method !== 'GET' &&
    requestOrigin &&
    requestOrigin !== 'null' &&
    requestOrigin !== new URL(request.url).origin
  ) {
    return new Response('The request origin is not allowed.', { status: 403 })
  }

  const helpers = env.OAUTH_PROVIDER
  if (!helpers) throw new Error('OAuth helpers are unavailable')
  const parsed = await parsedAuthorizationRequest(request, helpers)
  if (parsed instanceof Response) return parsed
  const client = await helpers.lookupClient(parsed.clientId)
  if (!client) return new Response('Unknown OAuth client.', { status: 400 })

  if (request.method === 'GET') {
    return consentPage(client.clientName ?? 'MCP client', parsed.redirectUri)
  }

  const form = await request.formData()
  if (form.get('decision') !== 'approve') {
    return authorizationRedirect(parsed, 'access_denied')
  }

  const grantedScopes = parsed.scope.filter((scope) => scope === MCP_SCOPE)
  if (!grantedScopes.includes(MCP_SCOPE)) {
    return authorizationRedirect(parsed, 'invalid_scope')
  }

  const { redirectTo } = await helpers.completeAuthorization({
    request: parsed,
    userId: OWNER_ID,
    metadata: { clientName: client.clientName ?? 'MCP client' },
    scope: grantedScopes,
    props: {
      userId: OWNER_ID,
      scopes: grantedScopes,
    } satisfies McpAuthorization,
  })
  return Response.redirect(redirectTo, 302)
}

function isOAuthPublicEndpoint(pathname: string): boolean {
  return (
    pathname === '/oauth/token' ||
    pathname === '/oauth/register' ||
    pathname === '/api/mcp/oauth/authorize'
  )
}

function isLoopback(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  )
}

export async function protectOAuthRequest(
  request: Request,
  env: McpOAuthEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url)
  const pathname = url.pathname
  if (url.protocol !== 'https:' && !isLoopback(url.hostname)) {
    return Response.json(
      { error: 'invalid_request', error_description: 'HTTPS is required.' },
      { status: 426, headers: { upgrade: 'TLS/1.2' } },
    )
  }
  if (pathname === '/mcp' || pathname.startsWith('/mcp/')) {
    const origin = request.headers.get('origin')
    if (origin && origin !== url.origin) {
      return Response.json(
        {
          error: 'invalid_request',
          error_description: 'Origin is not allowed.',
        },
        { status: 403 },
      )
    }
  }
  if (!isOAuthPublicEndpoint(pathname)) return undefined
  const address = request.headers.get('cf-connecting-ip') ?? 'local-development'
  const result = await env.MCP_OAUTH_RATE_LIMITER.limit({
    key: `${address}:${pathname}`,
  })
  if (result.success) return undefined
  return Response.json(
    { error: 'temporarily_unavailable', error_description: 'Try again later.' },
    {
      status: 429,
      headers: { 'retry-after': String(OAUTH_RATE_LIMIT_SECONDS) },
    },
  )
}

export function createOAuthProvider(
  request: Request,
  registry: IntegrationRegistry,
): OAuthProvider<McpOAuthEnv> {
  const origin = new URL(request.url).origin
  const resource = `${origin}/mcp`

  const mcpHandler = {
    fetch: async (mcpRequest, _env, context) => {
      const authorization = (context as ExecutionContext<McpAuthorization>)
        .props
      if (!authorization) return new Response('Unauthorized', { status: 401 })
      return handleMcpRequest(mcpRequest, registry, authorization, _env.DB)
    },
  } satisfies Pick<Required<ExportedHandler<McpOAuthEnv>>, 'fetch'>

  const defaultHandler: ExportedHandler<McpOAuthEnv> = {
    fetch: async (applicationRequest, env) => {
      const { pathname } = new URL(applicationRequest.url)
      if (pathname === '/api/mcp/oauth/authorize') {
        return handleAuthorization(applicationRequest, env)
      }
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        return handleAdminApi(applicationRequest, env, registry)
      }
      return env.ASSETS.fetch(applicationRequest)
    },
  }

  return new OAuthProvider<McpOAuthEnv>({
    apiRoute: '/mcp',
    apiHandler: mcpHandler,
    defaultHandler,
    authorizeEndpoint: '/api/mcp/oauth/authorize',
    tokenEndpoint: '/oauth/token',
    clientRegistrationEndpoint: '/oauth/register',
    scopesSupported: [MCP_SCOPE],
    allowImplicitFlow: false,
    allowPlainPKCE: false,
    allowTokenExchangeGrant: false,
    tokenExchangeCallback: ({ userId, requestedScope }) => ({
      accessTokenProps: {
        userId,
        scopes: requestedScope,
      } satisfies McpAuthorization,
    }),
    clientIdMetadataDocumentEnabled: true,
    resourceMetadata: {
      resource,
      ...(origin.startsWith('https:')
        ? { authorization_servers: [origin] }
        : {}),
      scopes_supported: [MCP_SCOPE],
      bearer_methods_supported: ['header'],
      resource_name: 'Universal Data MCP Worker',
    },
  })
}
