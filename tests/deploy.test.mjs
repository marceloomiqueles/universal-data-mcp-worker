import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, it } from 'node:test'

import { runDeployment } from '../scripts/deploy.mjs'

const execFileAsync = promisify(execFile)
const temporaryDirectories = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })),
  )
})

function wranglerExecutable() {
  return resolve(
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler',
  )
}

async function createMigrationFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'd1-deploy-gate-'))
  temporaryDirectories.push(directory)
  const migrationsDirectory = join(directory, 'migrations')
  const stateDirectory = join(directory, 'state')
  const configPath = join(directory, 'wrangler.jsonc')

  await mkdir(migrationsDirectory)
  await writeFile(
    configPath,
    JSON.stringify({
      name: 'd1-deploy-gate-test',
      d1_databases: [
        {
          binding: 'DB',
          database_name: 'd1-deploy-gate-test',
          database_id: '11111111-1111-4111-8111-111111111111',
          migrations_dir: 'migrations',
        },
      ],
    }),
  )
  await cp(
    'migrations/0001_owner_auth.sql',
    join(migrationsDirectory, '0001_owner_auth.sql'),
    {
      recursive: true,
    },
  )
  await cp(
    'migrations/0002_shopify_connection.sql',
    join(migrationsDirectory, '0002_shopify_connection.sql'),
    { recursive: true },
  )

  return { directory, migrationsDirectory, stateDirectory, configPath }
}

async function runWrangler(args) {
  return execFileAsync(wranglerExecutable(), args, {
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
    maxBuffer: 10 * 1024 * 1024,
  })
}

async function applyLocalMigrations(fixture) {
  return runWrangler([
    'd1',
    'migrations',
    'apply',
    'DB',
    '--local',
    '--persist-to',
    fixture.stateDirectory,
    '--config',
    fixture.configPath,
  ])
}

async function appliedMigrations(fixture) {
  const result = await runWrangler([
    'd1',
    'execute',
    'DB',
    '--local',
    '--persist-to',
    fixture.stateDirectory,
    '--config',
    fixture.configPath,
    '--json',
    '--command',
    'SELECT name FROM d1_migrations ORDER BY id',
  ])
  const executions = JSON.parse(result.stdout)
  return executions[0].results.map((row) => row.name)
}

function localDeploymentRunner(fixture, events) {
  return async (name, args) => {
    assert.equal(name, 'wrangler')
    if (args[0] === 'deploy') {
      events.push('deployed')
      return
    }

    assert.deepEqual(args, ['d1', 'migrations', 'apply', 'DB', '--remote'])
    events.push('migrating')
    await applyLocalMigrations(fixture)
    events.push('migrated')
  }
}

describe('production deployment migration gate', () => {
  it('applies a pending migration before allowing deployment', async () => {
    const fixture = await createMigrationFixture()
    await applyLocalMigrations(fixture)
    await cp(
      'migrations/0003_shopify_inventory.sql',
      join(fixture.migrationsDirectory, '0003_shopify_inventory.sql'),
    )
    const events = []

    await runDeployment({ run: localDeploymentRunner(fixture, events) })

    assert.deepEqual(events, ['migrating', 'migrated', 'deployed'])
    assert.deepEqual(await appliedMigrations(fixture), [
      '0001_owner_auth.sql',
      '0002_shopify_connection.sql',
      '0003_shopify_inventory.sql',
    ])
  })

  it('allows deployment when no migrations are pending', async () => {
    const fixture = await createMigrationFixture()
    await cp(
      'migrations/0003_shopify_inventory.sql',
      join(fixture.migrationsDirectory, '0003_shopify_inventory.sql'),
    )
    await applyLocalMigrations(fixture)
    const events = []

    await runDeployment({ run: localDeploymentRunner(fixture, events) })

    assert.deepEqual(events, ['migrating', 'migrated', 'deployed'])
    assert.deepEqual(await appliedMigrations(fixture), [
      '0001_owner_auth.sql',
      '0002_shopify_connection.sql',
      '0003_shopify_inventory.sql',
    ])
  })

  it('does not deploy when a pending migration fails', async () => {
    const fixture = await createMigrationFixture()
    await applyLocalMigrations(fixture)
    await writeFile(
      join(fixture.migrationsDirectory, '0003_test_failure.sql'),
      'THIS IS NOT VALID SQL;',
    )
    const events = []

    await assert.rejects(
      runDeployment({ run: localDeploymentRunner(fixture, events) }),
    )

    assert.deepEqual(events, ['migrating'])
    assert.deepEqual(await appliedMigrations(fixture), [
      '0001_owner_auth.sql',
      '0002_shopify_connection.sql',
    ])
  })
})
