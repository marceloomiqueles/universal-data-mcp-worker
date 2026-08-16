import { ShopifyConnectionError } from './provider'

const SCALE = 1_000_000n
const maximumAmount = 9_000_000_000_000n * SCALE

export function parseShopifyMoney(value: string): bigint {
  const match = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,6}))?$/u.exec(value)
  if (!match) throw new ShopifyConnectionError('PROVIDER_CHANGED')
  const fraction = (match[3] ?? '').padEnd(6, '0')
  const units = BigInt(match[2]!) * SCALE + BigInt(fraction || '0')
  const signed = match[1] === '-' ? -units : units
  if (signed > maximumAmount || signed < -maximumAmount)
    throw new ShopifyConnectionError('PROVIDER_CHANGED')
  return signed
}

export function formatShopifyMoney(value: bigint): string {
  const negative = value < 0n
  const absolute = negative ? -value : value
  const whole = absolute / SCALE
  const fraction = (absolute % SCALE)
    .toString()
    .padStart(6, '0')
    .replace(/0+$/u, '')
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}

export function averageShopifyMoney(
  total: bigint,
  count: number,
): string | null {
  if (count === 0) return null
  const divisor = BigInt(count)
  const negative = total < 0n
  const absolute = negative ? -total : total
  const rounded = (absolute + divisor / 2n) / divisor
  return formatShopifyMoney(negative ? -rounded : rounded)
}
