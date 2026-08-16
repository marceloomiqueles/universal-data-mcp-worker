<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { fetchIntegrations, type IntegrationDescriptor } from '../integrations'
import {
  disconnectShopify,
  fetchShopifyConnection,
  saveShopifyConfiguration,
  verifyShopifyConnection,
  type ShopifyConnectionState,
  type ShopifyErrorCode,
} from '../shopify'

const integrations = ref<IntegrationDescriptor[]>([])
const loading = ref(true)
const failed = ref(false)
const shopify = ref<ShopifyConnectionState | null>(null)
const dialogOpen = ref(false)
const dialogLoading = ref(false)
const step = ref<1 | 2>(1)
const shopDomain = ref('')
const clientId = ref('')
const clientSecret = ref('')
const formError = ref('')
const actionError = ref('')
const saving = ref(false)
const verifying = ref(false)
const disconnecting = ref(false)
const confirmingDisconnect = ref(false)

const secretHelp = computed(() =>
  shopify.value?.secretConfigured
    ? 'A client secret is already stored. Leave this blank to keep it unchanged.'
    : 'The client secret is required and will be encrypted by the server.',
)

function statusLabel(status: IntegrationDescriptor['status']): string {
  return {
    not_configured: 'Not configured',
    configured: 'Ready to verify',
    connected: 'Connected',
    connection_error: 'Connection needs attention',
  }[status]
}

function statusColor(status: IntegrationDescriptor['status']): string {
  if (status === 'connected') return 'success'
  if (status === 'connection_error') return 'error'
  return 'warning'
}

function providerError(code: ShopifyErrorCode | null): string {
  const messages: Record<ShopifyErrorCode, string> = {
    AUTH_FAILED:
      'Shopify rejected the credentials. Review the client ID and secret.',
    SCOPE_FAILED:
      'The Shopify app is missing one or more required read-only scopes.',
    RATE_LIMITED:
      'Shopify is temporarily rate limiting requests. Try again later.',
    SOURCE_UNAVAILABLE: 'Shopify is temporarily unavailable. Try again later.',
    PROVIDER_CHANGED:
      'Shopify returned an incompatible response. Check the project documentation.',
    MALFORMED_RESPONSE: 'Shopify returned an unexpected response.',
    UNKNOWN: 'The connection could not be verified. Try again later.',
  }
  return code ? messages[code] : messages.UNKNOWN
}

async function loadIntegrations(): Promise<void> {
  loading.value = true
  failed.value = false
  try {
    integrations.value = await fetchIntegrations()
    if (integrations.value.some(({ id }) => id === 'shopify')) {
      shopify.value = await fetchShopifyConnection()
    }
  } catch {
    integrations.value = []
    failed.value = true
  } finally {
    loading.value = false
  }
}

function clearEnteredSecret(): void {
  clientSecret.value = ''
}

async function openShopify(): Promise<void> {
  dialogOpen.value = true
  dialogLoading.value = true
  formError.value = ''
  actionError.value = ''
  confirmingDisconnect.value = false
  clearEnteredSecret()
  try {
    shopify.value = await fetchShopifyConnection()
    shopDomain.value = shopify.value.shopDomain ?? ''
    clientId.value = shopify.value.clientId ?? ''
    step.value = shopify.value.status === 'not_configured' ? 1 : 2
    if (shopify.value.status === 'connection_error') {
      actionError.value = providerError(shopify.value.lastErrorCode)
    }
  } catch {
    actionError.value = 'Shopify configuration could not be loaded.'
  } finally {
    dialogLoading.value = false
  }
}

function closeDialog(): void {
  clearEnteredSecret()
  formError.value = ''
  actionError.value = ''
  confirmingDisconnect.value = false
  dialogOpen.value = false
}

function editConfiguration(): void {
  clearEnteredSecret()
  formError.value = ''
  actionError.value = ''
  step.value = 1
}

async function saveConfiguration(): Promise<void> {
  formError.value = ''
  const domain = shopDomain.value.trim()
  const identifier = clientId.value.trim()
  if (!domain || !identifier) {
    formError.value = 'Shop domain and client ID are required.'
    return
  }
  if (!shopify.value?.secretConfigured && !clientSecret.value) {
    formError.value = 'Client secret is required.'
    return
  }
  saving.value = true
  try {
    shopify.value = await saveShopifyConfiguration({
      shopDomain: domain,
      clientId: identifier,
      ...(clientSecret.value ? { clientSecret: clientSecret.value } : {}),
    })
    clearEnteredSecret()
    step.value = 2
    await loadIntegrations()
  } catch {
    clearEnteredSecret()
    formError.value = 'The Shopify configuration could not be saved.'
  } finally {
    saving.value = false
  }
}

async function verifyConnection(): Promise<void> {
  actionError.value = ''
  verifying.value = true
  try {
    shopify.value = await verifyShopifyConnection()
    if (shopify.value.status === 'connection_error') {
      actionError.value = providerError(shopify.value.lastErrorCode)
    }
    await loadIntegrations()
  } catch {
    actionError.value = 'The verification request could not be completed.'
  } finally {
    verifying.value = false
  }
}

async function confirmDisconnect(): Promise<void> {
  disconnecting.value = true
  actionError.value = ''
  try {
    await disconnectShopify()
    clearEnteredSecret()
    confirmingDisconnect.value = false
    closeDialog()
    await loadIntegrations()
  } catch {
    actionError.value = 'Shopify could not be disconnected.'
  } finally {
    disconnecting.value = false
  }
}

onMounted(loadIntegrations)
</script>

<template>
  <section aria-labelledby="integrations-heading">
    <h1 id="integrations-heading" class="text-h4 mb-3">Integrations</h1>
    <p class="text-body-1 text-medium-emphasis mb-6">
      Integrations included in this self-hosted deployment.
    </p>

    <div v-if="loading" aria-live="polite" class="py-8 text-center">
      <VProgressCircular indeterminate color="primary" class="mb-4" />
      <p class="text-body-1">Loading integrations…</p>
    </div>

    <VAlert v-else-if="failed" type="error" variant="tonal">
      The integration list could not be loaded. Try again later.
    </VAlert>

    <VAlert v-else-if="integrations.length === 0" type="info" variant="tonal">
      No integrations are included in this deployment.
    </VAlert>

    <VRow v-else>
      <VCol
        v-for="integration in integrations"
        :key="integration.id"
        cols="12"
        md="6"
        lg="4"
      >
        <VCard variant="outlined" height="100%">
          <VCardTitle>{{ integration.name }}</VCardTitle>
          <VCardText>
            <p class="mb-4">{{ integration.description }}</p>
            <VChip :color="statusColor(integration.status)" variant="tonal">
              {{ statusLabel(integration.status) }}
            </VChip>
            <p
              v-if="integration.id === 'shopify' && shopify?.shopDomain"
              class="text-body-2 mt-3 mb-0"
            >
              {{ shopify.shopDomain }}
            </p>
            <p
              v-if="integration.id === 'shopify' && shopify?.verifiedAt"
              class="text-caption text-medium-emphasis mt-1 mb-0"
            >
              Verified {{ new Date(shopify.verifiedAt).toLocaleString() }}
            </p>
          </VCardText>
          <VCardActions v-if="integration.id === 'shopify'">
            <VBtn color="primary" variant="text" @click="openShopify">
              {{
                integration.status === 'not_configured' ? 'Configure' : 'Manage'
              }}
            </VBtn>
          </VCardActions>
        </VCard>
      </VCol>
    </VRow>

    <VDialog v-model="dialogOpen" max-width="640" persistent>
      <VCard>
        <VCardTitle>Shopify connection</VCardTitle>
        <VCardText>
          <div v-if="dialogLoading" class="py-8 text-center" aria-live="polite">
            <VProgressCircular indeterminate color="primary" />
            <p class="mt-3">Loading Shopify configuration…</p>
          </div>

          <template v-else-if="step === 1">
            <p class="text-body-2 text-medium-emphasis mb-5">
              Enter the credentials for a Shopify app owned by this deployment
              owner.
            </p>
            <VTextField
              v-model="shopDomain"
              label="Shop domain"
              autocomplete="off"
            />
            <VTextField
              v-model="clientId"
              label="Client ID"
              autocomplete="off"
            />
            <VTextField
              v-model="clientSecret"
              label="Client secret"
              type="password"
              autocomplete="new-password"
              :hint="secretHelp"
              persistent-hint
            />
            <VAlert v-if="formError" type="error" variant="tonal" class="mt-4">
              {{ formError }}
            </VAlert>
          </template>

          <template v-else>
            <p class="text-body-2 text-medium-emphasis">Shop being verified</p>
            <p class="text-h6 mb-4">{{ shopify?.shopDomain }}</p>
            <VAlert
              v-if="shopify?.status === 'connected'"
              type="success"
              variant="tonal"
              class="mb-4"
            >
              Shopify is connected.
              <span v-if="shopify.verifiedAt">
                Verified {{ new Date(shopify.verifiedAt).toLocaleString() }}.
              </span>
            </VAlert>
            <VAlert
              v-else-if="shopify?.status === 'connection_error'"
              type="error"
              variant="tonal"
              class="mb-4"
            >
              The saved configuration needs attention.
            </VAlert>
            <VAlert
              v-if="actionError"
              type="error"
              variant="tonal"
              class="mb-4"
            >
              {{ actionError }}
            </VAlert>
            <p v-if="verifying" aria-live="polite">
              Verifying Shopify connection…
            </p>

            <VAlert
              v-if="confirmingDisconnect"
              type="warning"
              variant="tonal"
              class="mt-5"
            >
              Disconnecting removes the saved Shopify credentials from this
              deployment.
              <div class="mt-3">
                <VBtn
                  color="error"
                  variant="flat"
                  :loading="disconnecting"
                  @click="confirmDisconnect"
                >
                  Confirm disconnect
                </VBtn>
                <VBtn
                  class="ml-2"
                  variant="text"
                  @click="confirmingDisconnect = false"
                >
                  Cancel
                </VBtn>
              </div>
            </VAlert>
          </template>
        </VCardText>

        <VCardActions v-if="!dialogLoading">
          <VBtn variant="text" @click="closeDialog">Close</VBtn>
          <VSpacer />
          <template v-if="step === 1">
            <VBtn
              color="primary"
              variant="flat"
              :loading="saving"
              :disabled="saving"
              @click="saveConfiguration"
            >
              Save and continue
            </VBtn>
          </template>
          <template v-else>
            <VBtn variant="text" @click="editConfiguration">
              Edit configuration
            </VBtn>
            <VBtn
              v-if="shopify?.status !== 'not_configured'"
              color="error"
              variant="text"
              @click="confirmingDisconnect = true"
            >
              Disconnect
            </VBtn>
            <VBtn
              color="primary"
              variant="flat"
              :loading="verifying"
              :disabled="verifying"
              @click="verifyConnection"
            >
              {{
                shopify?.status === 'connected'
                  ? 'Verify again'
                  : 'Verify connection'
              }}
            </VBtn>
          </template>
        </VCardActions>
      </VCard>
    </VDialog>
  </section>
</template>
