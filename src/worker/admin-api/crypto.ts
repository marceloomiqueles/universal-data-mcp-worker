const PASSWORD_ALGORITHM = 'PBKDF2'
const PASSWORD_HASH = 'SHA-256'
const PASSWORD_ITERATIONS = 600_000
const PASSWORD_KEY_BYTES = 32
const PASSWORD_SALT_BYTES = 16

const encoder = new TextEncoder()

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''

  for (const byte of bytes) binary += String.fromCharCode(byte)

  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

function decodeBase64Url(value: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return undefined

  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const binary = atob(padded)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    return undefined
  }
}

async function derivePassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    PASSWORD_ALGORITHM,
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: PASSWORD_ALGORITHM,
      hash: PASSWORD_HASH,
      salt,
      iterations,
    },
    key,
    PASSWORD_KEY_BYTES * 8,
  )

  return new Uint8Array(bits)
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false

  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index]
  }

  return difference === 0
}

export async function createPasswordVerifier(
  password: string,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES))
  const derived = await derivePassword(password, salt, PASSWORD_ITERATIONS)

  return [
    'pbkdf2-sha256-v1',
    PASSWORD_ITERATIONS.toString(),
    encodeBase64Url(salt),
    encodeBase64Url(derived),
  ].join('$')
}

export async function verifyPassword(
  password: string,
  verifier: string,
): Promise<boolean> {
  const [version, iterationsText, saltText, hashText, extra] =
    verifier.split('$')
  const iterations = Number(iterationsText)
  const salt = decodeBase64Url(saltText ?? '')
  const expected = decodeBase64Url(hashText ?? '')

  if (
    version !== 'pbkdf2-sha256-v1' ||
    extra !== undefined ||
    iterations !== PASSWORD_ITERATIONS ||
    salt?.length !== PASSWORD_SALT_BYTES ||
    expected?.length !== PASSWORD_KEY_BYTES
  ) {
    return false
  }

  const actual = await derivePassword(password, salt, iterations)
  return equalBytes(actual, expected)
}

export function createSessionToken(): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

export async function digestSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret))
  return encodeBase64Url(new Uint8Array(digest))
}

export async function secretsEqual(
  left: string,
  right: string,
): Promise<boolean> {
  const [leftDigest, rightDigest] = await Promise.all([
    digestSecret(left),
    digestSecret(right),
  ])

  return equalBytes(encoder.encode(leftDigest), encoder.encode(rightDigest))
}
