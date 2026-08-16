declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database
      LOGIN_RATE_LIMITER: RateLimit
      MCP_OAUTH_RATE_LIMITER: RateLimit
      OAUTH_KV: KVNamespace
      OWNER_SETUP_TOKEN: string
      INTEGRATION_SECRETS_KEY: string
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

export {}
