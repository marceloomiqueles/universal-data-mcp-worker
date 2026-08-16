import { randomBytes } from 'node:crypto'
import { chmod, readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'

const command = process.argv[2]
const localSecretPath = '.dev.vars'
const localOrigin = 'http://localhost:5173'

export function generateBootstrapProof() {
  return randomBytes(32).toString('base64url')
}

export function validBootstrapProof(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/u.test(value)
}

export function setupUrl(secret) {
  return `${localOrigin}/login#bootstrap=${encodeURIComponent(secret)}`
}

async function readLocalBootstrapProof(path) {
  let source

  try {
    source = await readFile(path, 'utf8')
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return undefined
    }
    throw error
  }

  const proof = parseEnv(source).OWNER_SETUP_TOKEN
  if (!validBootstrapProof(proof)) {
    throw new Error(
      `${path} exists but does not contain a valid 256-bit Base64URL OWNER_SETUP_TOKEN. It was not changed.`,
    )
  }

  return proof
}

export async function ensureLocalConfiguration(path = localSecretPath) {
  const existingProof = await readLocalBootstrapProof(path)
  if (existingProof) {
    await chmod(path, 0o600)
    return { created: false, proof: existingProof }
  }

  const proof = generateBootstrapProof()
  await writeFile(path, `OWNER_SETUP_TOKEN="${proof}"\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  })

  return { created: true, proof }
}

export async function applyLocalMigrations() {
  const executable = resolve(
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler',
  )

  await new Promise((resolvePromise, reject) => {
    const migration = spawn(
      executable,
      ['d1', 'migrations', 'apply', 'DB', '--local'],
      {
        env: { ...process.env, CI: '1' },
        stdio: 'inherit',
      },
    )

    migration.once('error', reject)
    migration.once('exit', (code, signal) => {
      if (code === 0) resolvePromise()
      else {
        reject(
          new Error(
            signal
              ? `Local D1 migration was interrupted by ${signal}.`
              : `Local D1 migration failed with exit code ${code ?? 'unknown'}.`,
          ),
        )
      }
    })
  })
}

export async function printSetupUrl(path = localSecretPath, log = console.log) {
  const proof = await readLocalBootstrapProof(path)
  if (!proof) {
    throw new Error(
      '.dev.vars does not exist. Run `pnpm setup:local` to prepare local development.',
    )
  }

  log('Authorized setup URL:')
  log(setupUrl(proof))
}

export async function runLocalSetup({
  path = localSecretPath,
  migrate = applyLocalMigrations,
  log = console.log,
} = {}) {
  const result = await ensureLocalConfiguration(path)
  log(
    result.created
      ? 'Created the ignored local secret file .dev.vars.'
      : 'Preserved the existing local secret file .dev.vars.',
  )
  await migrate()
  await printSetupUrl(path, log)
}

async function main() {
  if (command === 'setup') await runLocalSetup()
  else if (command === 'url') await printSetupUrl()
  else throw new Error('Expected `setup` or `url`.')
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await main()
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Local setup failed.',
    )
    process.exitCode = 1
  }
}
