const encoder = new TextEncoder()
const decoder = new TextDecoder()

function encode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

function decode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value))
    throw new Error('Invalid encrypted value')
  const padded =
    value.replaceAll('-', '+').replaceAll('_', '/') +
    '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function key(encoded: string): Promise<CryptoKey> {
  const bytes = decode(encoded)
  if (bytes.byteLength !== 32)
    throw new Error('Invalid integration encryption key')
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

export async function encryptValue(
  plaintext: string,
  encodedKey: string,
  context: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(context) },
    await key(encodedKey),
    encoder.encode(plaintext),
  )
  return JSON.stringify({
    version: 1,
    keyVersion: 1,
    iv: encode(iv),
    ciphertext: encode(new Uint8Array(ciphertext)),
  })
}

export async function decryptValue(
  envelope: string,
  encodedKey: string,
  context: string,
): Promise<string> {
  const value = JSON.parse(envelope) as Record<string, unknown>
  if (
    value.version !== 1 ||
    value.keyVersion !== 1 ||
    typeof value.iv !== 'string' ||
    typeof value.ciphertext !== 'string'
  ) {
    throw new Error('Unsupported encrypted value')
  }
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: decode(value.iv),
      additionalData: encoder.encode(context),
    },
    await key(encodedKey),
    decode(value.ciphertext),
  )
  return decoder.decode(plaintext)
}
