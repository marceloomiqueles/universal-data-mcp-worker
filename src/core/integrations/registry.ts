export type IntegrationStatus =
  'not_configured' | 'configured' | 'connected' | 'connection_error'

export interface IntegrationDescriptor {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly status: IntegrationStatus
}

export interface IntegrationRegistry {
  list(db: D1Database): Promise<readonly IntegrationDescriptor[]>
}

export interface IntegrationRegistration {
  readonly id: string
  readonly name: string
  readonly description: string
  readStatus(db: D1Database): Promise<IntegrationStatus>
}

export function createIntegrationRegistry(
  descriptors: readonly IntegrationRegistration[],
): IntegrationRegistry {
  const ids = new Set<string>()

  for (const descriptor of descriptors) {
    if (ids.has(descriptor.id)) {
      throw new Error(`Duplicate integration id: ${descriptor.id}`)
    }
    ids.add(descriptor.id)
  }

  const registered = [...descriptors]

  return {
    list: async (db) =>
      Promise.all(
        registered.map(async ({ id, name, description, readStatus }) => ({
          id,
          name,
          description,
          status: await readStatus(db),
        })),
      ),
  }
}
