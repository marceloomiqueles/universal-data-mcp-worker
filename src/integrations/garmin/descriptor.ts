import type { IntegrationRegistration } from '../../core/integrations/registry'

export const garminIntegrationDescriptor = {
  id: 'garmin',
  name: 'Garmin',
  description: 'Garmin integration for health and activity data.',
  readStatus: async () => 'not_configured' as const,
} as const satisfies IntegrationRegistration
