export type IntegrationStatus = 'not_configured'

export interface IntegrationDescriptor {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly status: IntegrationStatus
}

export interface IntegrationRegistry {
  list(): readonly IntegrationDescriptor[]
}

export function createIntegrationRegistry(
  descriptors: readonly IntegrationDescriptor[],
): IntegrationRegistry {
  const ids = new Set<string>()

  for (const descriptor of descriptors) {
    if (ids.has(descriptor.id)) {
      throw new Error(`Duplicate integration id: ${descriptor.id}`)
    }
    ids.add(descriptor.id)
  }

  const registered = descriptors.map((descriptor) => ({ ...descriptor }))

  return {
    list: () => registered.map((descriptor) => ({ ...descriptor })),
  }
}
