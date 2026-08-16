declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database
      LOGIN_RATE_LIMITER: RateLimit
      OWNER_SETUP_TOKEN: string
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

export {}
