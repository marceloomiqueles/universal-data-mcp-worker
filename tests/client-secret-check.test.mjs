import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'

import { assertNoLocalSecretsInClient } from '../scripts/check-client-secrets.mjs'

const temporaryDirectories = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  )
})

async function fixture(clientContents) {
  const root = await mkdtemp(join(tmpdir(), 'client-secret-check-'))
  temporaryDirectories.push(root)
  const clientPath = join(root, 'client')
  const secretPath = join(root, '.dev.vars')
  await mkdir(clientPath)
  await writeFile(secretPath, 'OWNER_SETUP_TOKEN="sensitive-proof"\n')
  await writeFile(join(clientPath, 'app.js'), clientContents)
  return { clientPath, secretPath }
}

describe('browser build secret inspection', () => {
  it('accepts browser assets that do not contain local secret values', async () => {
    await assertNoLocalSecretsInClient(await fixture('safe browser asset'))
  })

  it('rejects a local secret copied into a browser asset', async () => {
    await assert.rejects(
      assertNoLocalSecretsInClient(
        await fixture('const leaked = "sensitive-proof"'),
      ),
      /local secret was found in browser asset/u,
    )
  })

  it('does not treat the empty committed example as a secret', async () => {
    const paths = await fixture('safe browser asset')
    await writeFile(paths.secretPath, 'OWNER_SETUP_TOKEN=\n')
    await assertNoLocalSecretsInClient(paths)
  })
})
