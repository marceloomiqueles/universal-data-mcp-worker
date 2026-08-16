import type { IntegrationRegistry } from '../../core/integrations/registry'

export function listIntegrations(registry: IntegrationRegistry): Response {
  return Response.json(
    {
      integrations: registry
        .list()
        .map(({ id, name, description, status }) => ({
          id,
          name,
          description,
          status,
        })),
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
