import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function executable(name) {
  return resolve(
    'node_modules',
    '.bin',
    process.platform === 'win32' ? `${name}.cmd` : name,
  )
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

export async function runDeployment({ run = runVisible } = {}) {
  await run('wrangler', ['d1', 'migrations', 'apply', 'DB', '--remote'])
  await run('wrangler', ['deploy'])
}

async function main() {
  await runDeployment()
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Deployment failed.')
    process.exitCode = 1
  }
}
