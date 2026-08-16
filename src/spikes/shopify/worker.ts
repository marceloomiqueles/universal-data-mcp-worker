import {
  runShopifySpike,
  ShopifySpikeError,
  type ShopifySpikeConfig,
} from './client'

interface ShopifySpikeEnv {
  SHOPIFY_SHOP_DOMAIN?: string
  SHOPIFY_CLIENT_ID?: string
  SHOPIFY_CLIENT_SECRET?: string
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

function config(env: ShopifySpikeEnv): ShopifySpikeConfig {
  return {
    shopDomain: env.SHOPIFY_SHOP_DOMAIN ?? '',
    clientId: env.SHOPIFY_CLIENT_ID ?? '',
    clientSecret: env.SHOPIFY_CLIENT_SECRET ?? '',
  }
}

export async function handleShopifySpikeRequest(
  request: Request,
  env: ShopifySpikeEnv,
): Promise<Response> {
  const url = new URL(request.url)
  if (!isLoopback(url.hostname))
    return new Response('Not found.', { status: 404 })
  if (request.method !== 'GET' || url.pathname !== '/') {
    return new Response('Not found.', { status: 404 })
  }

  try {
    const result = await runShopifySpike(config(env))
    return Response.json({ ok: true, result })
  } catch (error) {
    const safeError =
      error instanceof ShopifySpikeError
        ? error
        : new ShopifySpikeError(
            'PROVIDER_UNAVAILABLE',
            'Shopify Spike 0 failed unexpectedly.',
          )
    return Response.json(
      {
        ok: false,
        error: { code: safeError.code, message: safeError.message },
      },
      { status: safeError.code === 'CONFIGURATION_MISSING' ? 400 : 502 },
    )
  }
}

export default {
  fetch: handleShopifySpikeRequest,
} satisfies ExportedHandler<ShopifySpikeEnv>
