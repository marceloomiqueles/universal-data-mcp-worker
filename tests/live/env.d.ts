declare global {
  namespace Cloudflare {
    interface Env {
      LIVE_SHOPIFY_SHOP_DOMAIN: string
      LIVE_SHOPIFY_CLIENT_ID: string
      LIVE_SHOPIFY_CLIENT_SECRET: string
    }
  }
}

export {}
