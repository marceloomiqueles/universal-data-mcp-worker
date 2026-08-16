export interface IntegrationDescriptor {
  id: string
  name: string
  description: string
  status: 'not_configured'
}

interface IntegrationsResponse {
  integrations: IntegrationDescriptor[]
}

function isIntegrationDescriptor(
  value: unknown,
): value is IntegrationDescriptor {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<IntegrationDescriptor>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.description === 'string' &&
    candidate.status === 'not_configured'
  )
}

function isIntegrationsResponse(value: unknown): value is IntegrationsResponse {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    Array.isArray((value as Partial<IntegrationsResponse>).integrations) &&
    (value as Partial<IntegrationsResponse>).integrations!.every(
      isIntegrationDescriptor,
    )
  )
}

export async function fetchIntegrations(
  request: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<IntegrationDescriptor[]> {
  const response = await request('/api/integrations', {
    credentials: 'same-origin',
  })

  if (!response.ok) throw new Error('Integrations request failed')

  const body: unknown = await response.json()
  if (!isIntegrationsResponse(body)) {
    throw new Error('Invalid integrations response')
  }

  return body.integrations
}
