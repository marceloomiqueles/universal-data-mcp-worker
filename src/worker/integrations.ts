import { createIntegrationRegistry } from '../core/integrations/registry'
import { garminIntegrationDescriptor } from '../integrations/garmin/descriptor'
import { shopifyIntegrationDescriptor } from '../integrations/shopify/descriptor'

export const integrationRegistry = createIntegrationRegistry([
  garminIntegrationDescriptor,
  shopifyIntegrationDescriptor,
])
