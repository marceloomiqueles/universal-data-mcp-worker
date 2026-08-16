import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

import {
  configuredDatabaseId,
  configuredDatabaseName,
  deploymentArguments,
  deploymentUrl,
  mcpOAuthRateLimitNamespace,
  rateLimitNamespace,
  regenerateProvisioningConfig,
  secretListArguments,
  selectDatabase,
  shopifyConfigurationExists,
  updateProvisioningConfig,
} from '../scripts/cloudflare-provision.mjs'

const draftConfig = `{
  "ratelimits": [
    {
      "name": "LOGIN_RATE_LIMITER",
      "namespace_id": "1001001"
    },
    {
      "name": "MCP_OAUTH_RATE_LIMITER",
      "namespace_id": "1001002"
    }
  ],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "universal-data-mcp-worker"
    },
  ]
}`

describe('Cloudflare provisioning configuration', () => {
  it('uses the current Wrangler secret-list output option', () => {
    assert.deepEqual(secretListArguments(), [
      'secret',
      'list',
      '--format',
      'json',
      '--config',
      '.wrangler.production.jsonc',
    ])
  })

  it('declares the native Workers Builds migration-before-deploy flow', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8'))

    assert.equal(
      packageJson.scripts['db:migrations:apply'],
      'wrangler d1 migrations apply DB --remote',
    )
    assert.equal(
      packageJson.scripts.deploy,
      'pnpm db:migrations:apply && wrangler deploy',
    )
    assert.match(
      packageJson.cloudflare.bindings.OWNER_SETUP_TOKEN.description,
      /Temporary high-entropy proof/u,
    )
    assert.match(
      packageJson.cloudflare.bindings.INTEGRATION_SECRETS_KEY.description,
      /32-byte Base64URL secret/u,
    )
  })

  it('updates D1 and rate-limit bindings without changing their logical names', () => {
    const database = {
      name: 'universal-data-mcp-worker',
      uuid: '12345678-1234-1234-1234-123456789abc',
    }
    const updated = updateProvisioningConfig(draftConfig, database)

    assert.equal(configuredDatabaseId(updated), database.uuid)
    assert.equal(configuredDatabaseName(updated), database.name)
    assert.match(updated, /"binding": "DB"/u)
    assert.match(updated, /"name": "LOGIN_RATE_LIMITER"/u)
    assert.match(updated, /"name": "MCP_OAUTH_RATE_LIMITER"/u)
    assert.match(
      updated,
      new RegExp(`"namespace_id": "${rateLimitNamespace(database.uuid)}"`, 'u'),
    )
    assert.match(
      updated,
      new RegExp(
        `"namespace_id": "${mcpOAuthRateLimitNamespace(database.uuid)}"`,
        'u',
      ),
    )
  })

  it('keeps the public D1 binding eligible for automatic provisioning', async () => {
    const source = await readFile('wrangler.jsonc', 'utf8')

    assert.equal(configuredDatabaseId(source), undefined)
    assert.doesNotMatch(source, /00000000-0000-0000-0000-000000000000/u)
  })

  it('routes OAuth and MCP protocol endpoints through the Worker before SPA assets', async () => {
    const source = await readFile('wrangler.jsonc', 'utf8')

    for (const path of [
      '/mcp',
      '/mcp/*',
      '/oauth/*',
      '/.well-known/oauth-authorization-server',
      '/.well-known/oauth-protected-resource/*',
    ]) {
      assert.ok(source.includes(JSON.stringify(path)))
    }
  })

  it('deploys defensively without treating a stale generated snapshot as authority', () => {
    assert.deepEqual(deploymentArguments(), [
      'deploy',
      '--strict',
      '--keep-vars',
      '--config',
      '.wrangler.production.jsonc',
    ])
    assert.deepEqual(deploymentArguments('/private/secrets.env'), [
      'deploy',
      '--strict',
      '--keep-vars',
      '--config',
      '.wrangler.production.jsonc',
      '--secrets-file',
      '/private/secrets.env',
    ])
  })

  it('regenerates owned bindings from the committed template, not stale routes', () => {
    const staleSnapshot = `${draftConfig.slice(0, -2)},
  "routes": [{ "pattern": "admin.example.com", "custom_domain": true }]
}`
    const database = {
      name: 'universal-data-mcp-worker',
      uuid: '12345678-1234-1234-1234-123456789abc',
    }
    const regenerated = regenerateProvisioningConfig(draftConfig, database)

    assert.match(staleSnapshot, /admin\.example\.com/u)
    assert.doesNotMatch(regenerated, /admin\.example\.com/u)
    assert.equal(configuredDatabaseId(regenerated), database.uuid)
  })

  it('derives a stable positive integer namespace per D1 installation', () => {
    const first = rateLimitNamespace('first-database-id')
    assert.match(first, /^[1-9][0-9]*$/u)
    assert.equal(first, rateLimitNamespace('first-database-id'))
    assert.notEqual(first, rateLimitNamespace('second-database-id'))
    assert.notEqual(first, mcpOAuthRateLimitNamespace('first-database-id'))
  })

  it('reuses a configured database by ID', () => {
    const databases = [
      { name: 'universal-data-mcp-worker', uuid: 'database-id' },
    ]
    assert.equal(
      selectDatabase(databases, 'database-id', 'universal-data-mcp-worker'),
      databases[0],
    )
  })

  it('reuses a deterministically named database while configuration is draft', () => {
    const databases = [
      { name: 'universal-data-mcp-worker', uuid: 'database-id' },
    ]
    assert.equal(
      selectDatabase(databases, undefined, 'universal-data-mcp-worker'),
      databases[0],
    )
  })

  it('rejects the zero UUID instead of sending it to Cloudflare', () => {
    assert.throws(
      () =>
        selectDatabase(
          [],
          '00000000-0000-0000-0000-000000000000',
          'universal-data-mcp-worker',
        ),
      /invalid zero UUID placeholder/u,
    )
  })

  it('refuses to replace an unavailable configured database', () => {
    assert.throws(
      () =>
        selectDatabase([], 'missing-database-id', 'universal-data-mcp-worker'),
      /not available in the authenticated Cloudflare account/u,
    )
  })

  it('extracts the HTTPS workers.dev target reported by Wrangler', () => {
    assert.equal(
      deploymentUrl(
        'Deployed https://universal-data-mcp-worker.example.workers.dev',
      ),
      'https://universal-data-mcp-worker.example.workers.dev',
    )
  })

  it('detects encrypted Shopify configuration before replacing a missing key', () => {
    assert.equal(
      shopifyConfigurationExists(
        JSON.stringify([{ success: true, results: [{ configured: 1 }] }]),
      ),
      true,
    )
    assert.equal(
      shopifyConfigurationExists(
        JSON.stringify([{ success: true, results: [{ configured: 0 }] }]),
      ),
      false,
    )
    assert.throws(
      () => shopifyConfigurationExists(JSON.stringify([{ results: [] }])),
      /Could not determine/u,
    )
  })
})
