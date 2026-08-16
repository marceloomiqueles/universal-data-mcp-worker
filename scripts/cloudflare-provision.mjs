import { createHash } from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import {
  generateBootstrapProof,
  setupUrl as localSetupUrl,
} from './local-bootstrap.mjs'

const execFileAsync = promisify(execFile)
const defaultDatabaseName = 'universal-data-mcp-worker'
const invalidPlaceholderDatabaseId = '00000000-0000-0000-0000-000000000000'
const templateConfigPath = 'wrangler.jsonc'
const deploymentConfigPath = '.wrangler.production.jsonc'

function executable(name) {
  return resolve(
    'node_modules',
    '.bin',
    process.platform === 'win32' ? `${name}.cmd` : name,
  )
}

async function captureWrangler(args, { allowFailure = false } = {}) {
  try {
    return await execFileAsync(executable('wrangler'), args, {
      encoding: 'utf8',
      env: { ...process.env, CI: '1' },
      maxBuffer: 10 * 1024 * 1024,
    })
  } catch (error) {
    if (allowFailure) return { error }
    throw error
  }
}

async function runVisible(name, args) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(executable(name), args, {
      env: { ...process.env, CI: '1' },
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise()
      else {
        reject(
          new Error(
            signal
              ? `${name} was interrupted by ${signal}.`
              : `${name} failed with exit code ${code ?? 'unknown'}.`,
          ),
        )
      }
    })
  })
}

export function rateLimitNamespace(databaseId) {
  const value = createHash('sha256')
    .update(databaseId)
    .digest()
    .readUIntBE(0, 6)
  return String(value || 1)
}

export function mcpOAuthRateLimitNamespace(databaseId) {
  const value = createHash('sha256')
    .update(`${databaseId}:mcp-oauth`)
    .digest()
    .readUIntBE(0, 6)
  return String(value || 1)
}

function updateSectionProperty(source, section, binding, property, value) {
  const sectionPattern = new RegExp(
    `("${section}"\\s*:\\s*\\[)([\\s\\S]*?)(\\])`,
    'u',
  )
  const sectionMatch = source.match(sectionPattern)
  if (!sectionMatch || !sectionMatch[2]) {
    throw new Error(`Could not find the ${section} configuration section.`)
  }
  const objectPattern = /\{[\s\S]*?\}/gu
  const bindingPattern = new RegExp(
    `"(?:binding|name)"\\s*:\\s*"${binding}"`,
    'u',
  )
  const object = sectionMatch[2]
    .match(objectPattern)
    ?.find((candidate) => bindingPattern.test(candidate))
  if (!object) {
    throw new Error(
      `Could not find ${binding} in the ${section} configuration section.`,
    )
  }

  const propertyPattern = new RegExp(`("${property}"\\s*:\\s*)"[^"]*"`, 'u')
  if (!propertyPattern.test(object)) {
    throw new Error(`Could not find ${property} for ${binding}.`)
  }

  const updatedObject = object.replace(
    propertyPattern,
    `$1${JSON.stringify(value)}`,
  )
  const updatedBody = sectionMatch[2].replace(object, updatedObject)
  return source.replace(sectionPattern, `$1${updatedBody}$3`)
}

export function updateProvisioningConfig(source, database) {
  let updated = updateSectionProperty(
    source,
    'd1_databases',
    'DB',
    'database_name',
    database.name,
  )
  updated = setDatabaseId(updated, database.uuid)
  updated = updateSectionProperty(
    updated,
    'ratelimits',
    'LOGIN_RATE_LIMITER',
    'namespace_id',
    rateLimitNamespace(database.uuid),
  )
  return updateSectionProperty(
    updated,
    'ratelimits',
    'MCP_OAUTH_RATE_LIMITER',
    'namespace_id',
    mcpOAuthRateLimitNamespace(database.uuid),
  )
}

function setDatabaseId(source, databaseId) {
  if (/"database_id"\s*:/u.test(source)) {
    return updateSectionProperty(
      source,
      'd1_databases',
      'DB',
      'database_id',
      databaseId,
    )
  }

  const sectionPattern = new RegExp(
    `("d1_databases"\\s*:\\s*\\[\\s*\\{)([\\s\\S]*?)(\\}\\s*,?\\s*\\])`,
    'u',
  )
  const sectionMatch = source.match(sectionPattern)
  if (!sectionMatch?.[2] || !/"binding"\s*:\s*"DB"/u.test(sectionMatch[2])) {
    throw new Error('Could not find DB in the d1_databases section.')
  }

  const updatedBody = sectionMatch[2].replace(
    /("database_name"\s*:\s*"[^"]+"\s*,?)/u,
    `$1\n      "database_id": ${JSON.stringify(databaseId)},`,
  )
  if (updatedBody === sectionMatch[2]) {
    throw new Error('Could not find database_name for DB.')
  }
  return source.replace(sectionPattern, `$1${updatedBody}$3`)
}

export function regenerateProvisioningConfig(template, database) {
  return updateProvisioningConfig(template, database)
}

export function configuredDatabaseId(source) {
  const match = source.match(
    /"d1_databases"\s*:\s*\[\s*\{[\s\S]*?"binding"\s*:\s*"DB"[\s\S]*?"database_id"\s*:\s*"([^"]+)"/u,
  )
  return match?.[1]
}

export function configuredDatabaseName(source) {
  const match = source.match(
    /"d1_databases"\s*:\s*\[\s*\{[\s\S]*?"binding"\s*:\s*"DB"[\s\S]*?"database_name"\s*:\s*"([^"]+)"/u,
  )
  if (!match?.[1])
    throw new Error('Could not read the DB database name from wrangler.jsonc.')
  return match[1]
}

export function selectDatabase(databases, configuredId, requestedName) {
  if (configuredId === invalidPlaceholderDatabaseId) {
    throw new Error(
      'The DB binding contains the invalid zero UUID placeholder. Remove database_id to allow automatic provisioning, or use a real D1 ID.',
    )
  }

  if (configuredId) {
    const configured = databases.find(
      (database) => database.uuid === configuredId,
    )
    if (!configured) {
      throw new Error(
        `The configured D1 database ${configuredId} is not available in the authenticated Cloudflare account. No resource was changed.`,
      )
    }
    if (configured.name !== requestedName) {
      throw new Error(
        `The configured D1 database is named ${configured.name}, not ${requestedName}. No resource was changed.`,
      )
    }
    return configured
  }

  return databases.find((database) => database.name === requestedName)
}

export function deploymentUrl(output) {
  const matches = output.match(/https:\/\/[A-Za-z0-9.-]+\.workers\.dev\/?/gu)
  if (!matches?.[0]) {
    throw new Error(
      'Wrangler deployed the Worker but did not report a workers.dev URL.',
    )
  }
  return matches[0].replace(/\/$/u, '')
}

async function authenticated() {
  const result = await captureWrangler(['whoami', '--json'], {
    allowFailure: true,
  })
  if ('error' in result) return false
  try {
    return JSON.parse(result.stdout).loggedIn === true
  } catch {
    return false
  }
}

async function listDatabases() {
  const result = await captureWrangler(['d1', 'list', '--json'])
  return JSON.parse(result.stdout)
}

async function ensureDatabase(requestedName, configuredId, template) {
  let databases = await listDatabases()
  let database = selectDatabase(databases, configuredId, requestedName)

  if (!database) {
    console.log(`Creating D1 database ${requestedName}...`)
    await runVisible('wrangler', [
      'd1',
      'create',
      requestedName,
      '--binding',
      'DB',
      '--update-config',
      '--config',
      deploymentConfigPath,
    ])
    databases = await listDatabases()
    database = databases.find((candidate) => candidate.name === requestedName)
    if (!database) {
      throw new Error(
        'Cloudflare created D1 but it could not be verified afterward.',
      )
    }
  } else {
    console.log(`Reusing D1 database ${database.name}.`)
  }

  const updated = regenerateProvisioningConfig(template, database)
  await writeFile(deploymentConfigPath, updated, { mode: 0o600 })
  console.log('Updated the DB binding and installation rate-limit namespaces.')
  return database
}

async function workerExists() {
  const result = await captureWrangler(
    ['deployments', 'status', '--json', '--config', deploymentConfigPath],
    { allowFailure: true },
  )
  if (!('error' in result)) return true

  const error = result.error
  const details =
    error && typeof error === 'object'
      ? `${'stdout' in error ? String(error.stdout) : ''}\n${'stderr' in error ? String(error.stderr) : ''}`
      : String(error)
  if (/does not exist|not found|no deployments/iu.test(details)) return false

  throw new Error(
    'Wrangler could not determine whether the Worker already exists. No deployment was attempted.',
    { cause: error },
  )
}

async function deploy(secret) {
  let secretDirectory
  const args = deploymentArguments()

  try {
    if (secret) {
      secretDirectory = await mkdtemp(join(tmpdir(), 'universal-provision-'))
      const secretPath = join(secretDirectory, 'secrets.env')
      await writeFile(secretPath, `OWNER_SETUP_TOKEN="${secret}"\n`, {
        encoding: 'utf8',
        mode: 0o600,
      })
      args.push('--secrets-file', secretPath)
    }

    const result = await captureWrangler(args)
    process.stdout.write(result.stdout)
    process.stderr.write(result.stderr)
    return deploymentUrl(`${result.stdout}\n${result.stderr}`)
  } finally {
    if (secretDirectory) await rm(secretDirectory, { recursive: true })
  }
}

export function deploymentArguments(secretPath) {
  const args = [
    'deploy',
    '--strict',
    '--keep-vars',
    '--config',
    deploymentConfigPath,
  ]
  if (secretPath) args.push('--secrets-file', secretPath)
  return args
}

async function setupStatus(origin) {
  const response = await fetch(`${origin}/api/auth/setup-status`)
  if (!response.ok) {
    throw new Error(`Setup status returned HTTP ${response.status}.`)
  }
  return response.json()
}

async function validateHttps(origin) {
  const insecure = await fetch(
    `${origin.replace(/^https:/u, 'http:')}/api/auth/setup-status`,
    { redirect: 'manual' },
  )
  if (![301, 302, 307, 308, 426].includes(insecure.status)) {
    throw new Error(
      `Insecure production traffic returned HTTP ${insecure.status}; expected an HTTPS redirect or rejection.`,
    )
  }
}

function requestedDatabaseName(argv, existingName) {
  const option = argv.find((argument) =>
    argument.startsWith('--database-name='),
  )
  if (!option) return existingName ?? defaultDatabaseName
  const value = option.slice('--database-name='.length).trim()
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/u.test(value)) {
    throw new Error(
      'Database names must use lowercase letters, numbers, and dashes.',
    )
  }
  return value
}

export async function provisionCloudflare(argv = process.argv.slice(2)) {
  if (!(await authenticated())) {
    throw new Error(
      'Wrangler is not authenticated. Run `pnpm exec wrangler login`, then run provisioning again.',
    )
  }

  const deploymentConfigExisted = await access(deploymentConfigPath).then(
    () => true,
    () => false,
  )
  const previousConfig = deploymentConfigExisted
    ? await readFile(deploymentConfigPath, 'utf8')
    : undefined
  const previousDatabaseId = previousConfig
    ? configuredDatabaseId(previousConfig)
    : undefined
  const previousDatabaseName = previousConfig
    ? configuredDatabaseName(previousConfig)
    : undefined
  const databaseName = requestedDatabaseName(argv, previousDatabaseName)

  const template = await readFile(templateConfigPath, 'utf8')
  await writeFile(deploymentConfigPath, template, { mode: 0o600 })

  const existingWorker = await workerExists()
  if (existingWorker && !deploymentConfigExisted) {
    await rm(deploymentConfigPath)
    throw new Error(
      `Worker ${defaultDatabaseName} already exists, but this installation has no generated deployment configuration. Refusing to overwrite existing routes or settings.`,
    )
  }

  await ensureDatabase(databaseName, previousDatabaseId, template)
  await runVisible('vite', ['build'])
  await runVisible('wrangler', [
    'd1',
    'migrations',
    'apply',
    'DB',
    '--remote',
    '--config',
    deploymentConfigPath,
  ])

  let proof
  let origin
  if (existingWorker) {
    origin = await deploy()
    const status = await setupStatus(origin)
    if (status.setupRequired) {
      proof = generateBootstrapProof()
      console.log(
        'Owner setup is incomplete; rotating its temporary authorization.',
      )
      origin = await deploy(proof)
    }
  } else {
    proof = generateBootstrapProof()
    origin = await deploy(proof)
  }

  const status = await setupStatus(origin)
  if (status.setupRequired && !status.bootstrapConfigured) {
    throw new Error(
      'The deployed Worker does not have bootstrap authorization configured.',
    )
  }
  await validateHttps(origin)

  console.log('\nDeployment complete.\n')
  if (status.setupRequired) {
    if (!proof) {
      throw new Error(
        'Owner setup is required but no current bootstrap proof is available.',
      )
    }
    console.log('Open this link to create the administrator account:')
    console.log(localSetupUrl(proof).replace('http://localhost:5173', origin))
    console.log(
      '\nThis bootstrap link is sensitive and is displayed only by this command.',
    )
  } else {
    console.log('The administrator account already exists. Open:')
    console.log(`${origin}/login`)
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await provisionCloudflare()
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Provisioning failed.',
    )
    process.exitCode = 1
  }
}
