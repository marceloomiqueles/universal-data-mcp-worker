import type { IntegrationRegistration } from '../../core/integrations/registry'
import { readShopifyStatus } from './connection'

export const shopifyIntegrationDescriptor = {
  id: 'shopify',
  name: 'Shopify',
  description:
    'Shopify integration for product, inventory, and recent order sales data.',
  readStatus: readShopifyStatus,
} satisfies IntegrationRegistration
