import type { IntegrationDescriptor } from '../../core/integrations/registry'

export const garminIntegrationDescriptor = {
  id: 'garmin',
  name: 'Garmin',
  description: 'Garmin integration for health and activity data.',
  status: 'not_configured',
} as const satisfies IntegrationDescriptor
