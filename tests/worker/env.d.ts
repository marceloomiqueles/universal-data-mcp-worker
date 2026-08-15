declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database
      OWNER_SETUP_TOKEN: string
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

export {}
