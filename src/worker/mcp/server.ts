import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'

import type { IntegrationRegistry } from '../../core/integrations/registry'

const MAX_REQUEST_BYTES = 64 * 1024
const REQUIRED_SCOPE = 'integrations:read'

export interface McpAuthorization {
  readonly userId: string
  readonly scopes: readonly string[]
}

function jsonRpcError(status: number, code: number, message: string): Response {
  return Response.json(
    { jsonrpc: '2.0', error: { code, message }, id: null },
    { status },
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

function validateRequest(request: Request): Response | undefined {
  const url = new URL(request.url)
  if (url.protocol !== 'https:' && !isLoopback(url.hostname)) {
    return jsonRpcError(426, -32000, 'HTTPS is required.')
  }

  const origin = request.headers.get('origin')
  if (origin && origin !== url.origin) {
    return jsonRpcError(403, -32000, 'The request origin is not allowed.')
  }

  const declaredLength = request.headers.get('content-length')
  if (declaredLength && Number(declaredLength) > MAX_REQUEST_BYTES) {
    return jsonRpcError(413, -32000, 'Request body is too large.')
  }

  return undefined
}

async function boundedRequest(request: Request): Promise<Request | Response> {
  if (!request.body) return request

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > MAX_REQUEST_BYTES) {
      await reader.cancel()
      return jsonRpcError(413, -32000, 'Request body is too large.')
    }
    chunks.push(value)
  }

  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }

  return new Request(request, { body })
}

export function createMcpServer(registry: IntegrationRegistry): McpServer {
  const server = new McpServer(
    { name: 'universal-data-mcp-worker', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  const integrationSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    status: z.literal('not_configured'),
  })
  const outputSchema = z.object({
    integrations: z.array(integrationSchema),
  })

  server.registerTool(
    'list_integrations',
    {
      title: 'List registered integrations',
      description:
        'Lists the integrations compiled into this deployment and their current setup status. Use this to answer which data sources are available or configured.',
      inputSchema: z.object({}).strict(),
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    () => {
      const result = {
        integrations: registry
          .list()
          .map(({ id, name, description, status }) => ({
            id,
            name,
            description,
            status,
          })),
      }

      return {
        content: [
          {
            type: 'text',
            text:
              result.integrations.length === 0
                ? 'No integrations are registered in this deployment.'
                : `Registered integrations: ${result.integrations.map(({ name, status }) => `${name} (${status})`).join(', ')}.`,
          },
        ],
        structuredContent: result,
      }
    },
  )

  return server
}

export async function handleMcpRequest(
  request: Request,
  registry: IntegrationRegistry,
  authorization: McpAuthorization,
): Promise<Response> {
  const validationError = validateRequest(request)
  if (validationError) return validationError
  if (!authorization.scopes.includes(REQUIRED_SCOPE)) {
    return jsonRpcError(403, -32000, 'Required scope is missing.')
  }

  const bounded = await boundedRequest(request)
  if (bounded instanceof Response) return bounded

  const server = createMcpServer(registry)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })

  try {
    await server.connect(transport)
    return await transport.handleRequest(bounded)
  } catch (cause) {
    console.error('MCP request failed.', {
      error: cause instanceof Error ? cause.name : 'UnknownError',
      method: request.method,
      pathname: new URL(request.url).pathname,
    })
    return jsonRpcError(500, -32603, 'Internal server error.')
  } finally {
    await transport.close()
    await server.close()
  }
}
