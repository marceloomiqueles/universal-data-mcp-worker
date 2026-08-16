import { createIntegrationRegistry } from '../core/integrations/registry'
import { garminIntegrationDescriptor } from '../integrations/garmin/descriptor'

export const integrationRegistry = createIntegrationRegistry([
  garminIntegrationDescriptor,
])
