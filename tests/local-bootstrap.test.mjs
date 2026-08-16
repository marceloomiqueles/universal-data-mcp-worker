import { readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { parseEnv } from 'node:util'

import {
  ensureLocalConfiguration,
  generateBootstrapProof,
  runLocalSetup,
  setupUrl,
} from '../scripts/local-bootstrap.mjs'

const temporaryDirectories = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })),
  )
})

async function temporarySecretPath() {
  const directory = await mkdtemp(join(tmpdir(), 'universal-local-setup-'))
  temporaryDirectories.push(directory)
  return join(directory, '.dev.vars')
}

describe('local installation bootstrap', () => {
  it('generates distinct 256-bit Base64URL bootstrap proofs', () => {
    const first = generateBootstrapProof()
    const second = generateBootstrapProof()

    assert.match(first, /^[A-Za-z0-9_-]{43}$/u)
    assert.match(second, /^[A-Za-z0-9_-]{43}$/u)
    assert.notEqual(first, second)
  })

  it('creates a private local secret and preserves it on repeated setup', async () => {
    const path = await temporarySecretPath()
    const first = await ensureLocalConfiguration(path)
    const before = await readFile(path, 'utf8')
    const second = await ensureLocalConfiguration(path)

    assert.equal(first.created, true)
    assert.equal(second.created, false)
    assert.equal(second.proof, first.proof)
    assert.equal(await readFile(path, 'utf8'), before)
    assert.equal((await stat(path)).mode & 0o777, 0o600)
  })

  it('refuses to overwrite an existing invalid local configuration', async () => {
    const path = await temporarySecretPath()
    const invalid = 'OWNER_SETUP_TOKEN="example-only"\nOTHER_VALUE="keep"\n'
    await writeFile(path, invalid)

    await assert.rejects(
      ensureLocalConfiguration(path),
      /exists but does not contain a valid 256-bit Base64URL OWNER_SETUP_TOKEN/u,
    )
    assert.equal(await readFile(path, 'utf8'), invalid)
  })

  it('uses the production bootstrap fragment contract', () => {
    assert.equal(
      setupUrl('proof with reserved characters'),
      'http://localhost:5173/login#bootstrap=proof%20with%20reserved%20characters',
    )
  })

  it('runs migrations before printing the authorized setup URL', async () => {
    const path = await temporarySecretPath()
    const events = []

    await runLocalSetup({
      path,
      migrate: async () => events.push('migrated'),
      log: (message) => events.push(message),
    })

    assert.equal(events[0], 'Created the ignored local secret file .dev.vars.')
    assert.equal(events[1], 'migrated')
    assert.equal(events[2], 'Authorized setup URL:')
    assert.match(events[3], /^http:\/\/localhost:5173\/login#bootstrap=/u)
  })

  it('keeps the committed example deliberately unusable', async () => {
    const example = parseEnv(await readFile('.dev.vars.example', 'utf8'))
    assert.equal(example.OWNER_SETUP_TOKEN, '')
  })
})
