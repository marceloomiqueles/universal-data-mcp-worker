import type { IntegrationRegistry } from '../../core/integrations/registry'

export async function listIntegrations(
  registry: IntegrationRegistry,
  db: D1Database,
): Promise<Response> {
  return Response.json(
    {
      integrations: (await registry.list(db)).map(
        ({ id, name, description, status }) => ({
          id,
          name,
          description,
          status,
        }),
      ),
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
