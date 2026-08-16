import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseEnv } from 'node:util'

import {
  cloudflareTest,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

const requiredShopifyValues = [
  'SHOPIFY_SHOP_DOMAIN',
  'SHOPIFY_CLIENT_ID',
  'SHOPIFY_CLIENT_SECRET',
] as const

async function liveShopifyBindings(): Promise<Record<string, string>> {
  let values: Record<string, string>
  try {
    values = parseEnv(await readFile('.dev.vars', 'utf8'))
  } catch {
    throw new Error(
      'Live Shopify validation requires an ignored .dev.vars file. See TESTING.md.',
    )
  }

  for (const name of requiredShopifyValues) {
    if (!values[name]) {
      throw new Error(
        `Live Shopify validation requires ${name} in ignored .dev.vars.`,
      )
    }
  }

  return Object.fromEntries(
    requiredShopifyValues.map((name) => [`LIVE_${name}`, values[name]!]),
  )
}

export default defineConfig(async () => {
  const migrations = await readD1Migrations(
    path.join(import.meta.dirname, 'migrations'),
  )

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            ...(await liveShopifyBindings()),
            OWNER_SETUP_TOKEN: randomBytes(32).toString('base64url'),
            INTEGRATION_SECRETS_KEY: randomBytes(32).toString('base64url'),
            TEST_MIGRATIONS: migrations,
          },
        },
      }),
    ],
    test: {
      include: ['tests/live/shopify-activation.live.test.ts'],
      setupFiles: ['./tests/worker/apply-migrations.ts'],
      testTimeout: 30_000,
    },
  }
})
