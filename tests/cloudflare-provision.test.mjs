import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

import {
  configuredDatabaseId,
  deploymentUrl,
  rateLimitNamespace,
  selectDatabase,
  updateProvisioningConfig,
} from '../scripts/cloudflare-provision.mjs'

const draftConfig = `{
  "ratelimits": [
    {
      "name": "LOGIN_RATE_LIMITER",
      "namespace_id": "1001001"
    }
  ],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "universal-data-mcp-worker",
      "database_id": "00000000-0000-0000-0000-000000000000"
    },
  ]
}`

describe('Cloudflare provisioning configuration', () => {
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
  })

  it('updates D1 and rate-limit bindings without changing their logical names', () => {
    const database = {
      name: 'universal-data-mcp-worker',
      uuid: '12345678-1234-1234-1234-123456789abc',
    }
    const updated = updateProvisioningConfig(draftConfig, database)

    assert.equal(configuredDatabaseId(updated), database.uuid)
    assert.match(updated, /"binding": "DB"/u)
    assert.match(updated, /"name": "LOGIN_RATE_LIMITER"/u)
    assert.match(
      updated,
      new RegExp(`"namespace_id": "${rateLimitNamespace(database.uuid)}"`, 'u'),
    )
  })

  it('derives a stable positive integer namespace per D1 installation', () => {
    const first = rateLimitNamespace('first-database-id')
    assert.match(first, /^[1-9][0-9]*$/u)
    assert.equal(first, rateLimitNamespace('first-database-id'))
    assert.notEqual(first, rateLimitNamespace('second-database-id'))
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
      selectDatabase(
        databases,
        '00000000-0000-0000-0000-000000000000',
        'universal-data-mcp-worker',
      ),
      databases[0],
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
})
