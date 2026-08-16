import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'

async function filesUnder(path) {
  const entries = await readdir(path, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = join(path, entry.name)
    if (entry.isDirectory()) files.push(...(await filesUnder(entryPath)))
    else if (entry.isFile()) files.push(entryPath)
  }

  return files
}

export async function assertNoLocalSecretsInClient({
  secretPath = '.dev.vars',
  clientPath = 'dist/client',
} = {}) {
  let secretSource
  try {
    secretSource = await readFile(secretPath, 'utf8')
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return
    throw error
  }

  const values = Object.values(parseEnv(secretSource)).filter(
    (value) => value.length > 0,
  )
  if (values.length === 0) return

  for (const file of await filesUnder(clientPath)) {
    const contents = await readFile(file)
    for (const value of values) {
      if (contents.includes(Buffer.from(value))) {
        throw new Error(`A local secret was found in browser asset ${file}.`)
      }
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await assertNoLocalSecretsInClient()
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : 'Client secret inspection failed.',
    )
    process.exitCode = 1
  }
}
