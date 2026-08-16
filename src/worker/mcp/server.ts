import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'

import type { IntegrationRegistry } from '../../core/integrations/registry'
import { queryShopifyInventory } from '../../integrations/shopify/inventory-query'
import {
  queryShopifySales,
  queryShopifySalesPeriod,
  ShopifySalesQueryError,
} from '../../integrations/shopify/sales-query'

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

export async function createMcpServer(
  registry: IntegrationRegistry,
  db: D1Database,
): Promise<McpServer> {
  const server = new McpServer(
    { name: 'universal-data-mcp-worker', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  const integrationSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    status: z.enum([
      'not_configured',
      'configured',
      'connected',
      'connection_error',
    ]),
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
    async () => {
      const result = {
        integrations: (await registry.list(db)).map(
          ({ id, name, description, status }) => ({
            id,
            name,
            description,
            status,
          }),
        ),
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

  const shopify = (await registry.list(db)).find(({ id }) => id === 'shopify')
  if (shopify?.status === 'connected') {
    const inventoryItemSchema = z.object({
      product: z.string(),
      variant: z.string(),
      sku: z.string().nullable(),
      tracked: z.boolean(),
      location: z.string().nullable(),
      available: z.number().int().nullable(),
    })
    const inventoryOutputSchema = z.object({
      items: z.array(inventoryItemSchema),
      nextCursor: z.string().nullable(),
      lastSuccessfulSyncAt: z.string().datetime().nullable(),
    })

    server.registerTool(
      'get_inventory',
      {
        title: 'Get Shopify inventory',
        description:
          'Searches the latest persisted Shopify product inventory by exact SKU, product title, location, or stock state. Use this for stock availability, out-of-stock, low-stock, SKU, and location questions. Results reflect the last completed sync and are not live Shopify data.',
        inputSchema: z
          .object({
            sku: z.string().trim().min(1).max(128).optional(),
            productText: z.string().trim().min(1).max(128).optional(),
            location: z.string().trim().min(1).max(128).optional(),
            stockState: z
              .enum(['all', 'in_stock', 'out_of_stock', 'low_stock'])
              .optional(),
            lowStockThreshold: z.number().int().min(0).max(1000).optional(),
            limit: z.number().int().min(1).max(100).optional(),
            cursor: z.string().min(1).max(2048).optional(),
          })
          .strict(),
        outputSchema: inventoryOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      async (input) => {
        const inventory = await queryShopifyInventory(db, input)
        const freshness = inventory.lastSuccessfulSyncAt
          ? ` Last completed sync: ${inventory.lastSuccessfulSyncAt}.`
          : ' No completed inventory sync is recorded.'
        return {
          content: [
            {
              type: 'text',
              text:
                inventory.items.length === 0
                  ? `No inventory matched the requested filters.${freshness}`
                  : `Found ${inventory.items.length} inventory result${inventory.items.length === 1 ? '' : 's'}.${freshness}`,
            },
          ],
          structuredContent: {
            items: inventory.items,
            nextCursor: inventory.nextCursor,
            lastSuccessfulSyncAt: inventory.lastSuccessfulSyncAt,
          },
        }
      },
    )

    const topProductSchema = z.object({
      product: z.string(),
      variant: z.string().nullable(),
      sku: z.string().nullable(),
      quantity: z.number().int(),
      merchandiseSalesBeforeTax: z.string(),
      currency: z.string(),
    })
    const salesOutputSchema = z.object({
      period: z.object({
        start: z.string().datetime(),
        end: z.string().datetime(),
      }),
      timezone: z.string(),
      orderCount: z.number().int().nonnegative(),
      totalSales: z.string(),
      averageOrderValue: z.string().nullable(),
      currency: z.string(),
      topProducts: z.array(topProductSchema).max(25),
      lastSuccessfulOrderSync: z.string().datetime(),
      coverage: z.object({
        limitation: z.literal('recent_60_days_only'),
        windowStart: z.string().datetime(),
        windowEnd: z.string().datetime(),
        complete: z.literal(true),
      }),
    })
    const salesInputSchema = z
      .object({
        period: z
          .enum(['today', 'yesterday', 'this_week', 'last_week', 'last_7_days'])
          .optional(),
        start: z.string().datetime().optional(),
        end: z.string().datetime().optional(),
        includeTopProducts: z.boolean().optional(),
        topProductsLimit: z.number().int().min(1).max(25).optional(),
      })
      .strict()
      .superRefine((input, context) => {
        const explicit = input.start !== undefined || input.end !== undefined
        if (
          (input.period !== undefined && explicit) ||
          (input.period === undefined &&
            (input.start === undefined || input.end === undefined))
        )
          context.addIssue({
            code: 'custom',
            message: 'Provide either period or both start and end.',
          })
      })

    server.registerTool(
      'get_sales',
      {
        title: 'Get persisted Shopify sales',
        description:
          'Returns bounded sales aggregates from the last persisted Shopify order sync. Sales means the sum of current non-cancelled Shopify order totals after returns, including taxes and discounts; it is not accounting revenue. Average order value uses the same included orders. Optional top-product amounts are current merchandise sales after discounts but before tax, so they need not reconcile to order totals. Use a merchant-timezone period or explicit UTC start/end instants. Standard source coverage is limited to the recent 60 days, and this tool never queries Shopify live.',
        inputSchema: salesInputSchema,
        outputSchema: salesOutputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      async (input) => {
        try {
          const options = {
            includeTopProducts: input.includeTopProducts,
            topProductsLimit: input.topProductsLimit,
          }
          const sales = input.period
            ? await queryShopifySalesPeriod(db, input.period, options)
            : await queryShopifySales(db, {
                start: input.start!,
                end: input.end!,
                ...options,
              })
          const structuredContent = {
            period: sales.period,
            timezone: sales.timezone,
            orderCount: sales.orderCount,
            totalSales: sales.totalSales,
            averageOrderValue: sales.averageOrderValue,
            currency: sales.currency,
            topProducts: sales.topProducts,
            lastSuccessfulOrderSync: sales.lastSuccessfulSyncAt,
            coverage: sales.coverage,
          }
          return {
            content: [
              {
                type: 'text',
                text:
                  sales.orderCount === 0
                    ? `No non-cancelled orders were found in the covered period. Total sales: 0 ${sales.currency}. Last completed order sync: ${sales.lastSuccessfulSyncAt}.`
                    : `Found ${sales.orderCount} non-cancelled order${sales.orderCount === 1 ? '' : 's'} totaling ${sales.totalSales} ${sales.currency}. Last completed order sync: ${sales.lastSuccessfulSyncAt}.`,
              },
            ],
            structuredContent,
          }
        } catch (cause) {
          const message =
            cause instanceof ShopifySalesQueryError
              ? cause.code === 'INVALID_RANGE'
                ? 'The requested sales period is invalid or exceeds 60 days.'
                : cause.code === 'MIXED_CURRENCY'
                  ? 'The persisted sales data contains currencies that cannot be combined.'
                  : 'The requested period is not covered by the latest complete order sync.'
              : 'Sales data could not be queried.'
          return {
            isError: true,
            content: [{ type: 'text', text: message }],
          }
        }
      },
    )
  }

  return server
}

export async function handleMcpRequest(
  request: Request,
  registry: IntegrationRegistry,
  authorization: McpAuthorization,
  db: D1Database,
): Promise<Response> {
  const validationError = validateRequest(request)
  if (validationError) return validationError
  if (!authorization.scopes.includes(REQUIRED_SCOPE)) {
    return jsonRpcError(403, -32000, 'Required scope is missing.')
  }

  const bounded = await boundedRequest(request)
  if (bounded instanceof Response) return bounded

  const server = await createMcpServer(registry, db)
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
