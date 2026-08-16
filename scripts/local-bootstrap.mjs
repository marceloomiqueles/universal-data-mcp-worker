import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const command = process.argv[2]
const localSecretPath = resolve('.dev.vars')
const localOrigin = 'http://localhost:5173'

function validSecret(value) {
  return typeof value === 'string' && value.length >= 32
}

function setupUrl(secret) {
  return `${localOrigin}/login#bootstrap=${encodeURIComponent(secret)}`
}

async function createLocalConfiguration() {
  const secret = randomBytes(32).toString('base64url')

  try {
    await writeFile(localSecretPath, `OWNER_SETUP_TOKEN="${secret}"\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'EEXIST') {
      throw new Error(
        '.dev.vars already exists. It was not changed. Run `pnpm setup:url` to print its setup URL.',
        { cause: error },
      )
    }
    throw error
  }

  console.log('Created the ignored local secret file .dev.vars.')
  console.log('After starting the app with `pnpm dev`, open:')
  console.log(setupUrl(secret))
}

function printSetupUrl() {
  const secret = process.env.OWNER_SETUP_TOKEN
  if (!validSecret(secret)) {
    throw new Error(
      'OWNER_SETUP_TOKEN is missing or shorter than 32 characters in .dev.vars. Run `pnpm setup:local` from a clean local configuration.',
    )
  }

  console.log(setupUrl(secret))
}

try {
  if (command === 'create') await createLocalConfiguration()
  else if (command === 'url') printSetupUrl()
  else throw new Error('Expected `create` or `url`.')
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Local setup failed.')
  process.exitCode = 1
}
