<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { fetchIntegrations, type IntegrationDescriptor } from '../integrations'

const integrations = ref<IntegrationDescriptor[]>([])
const loading = ref(true)
const failed = ref(false)

function statusLabel(status: IntegrationDescriptor['status']): string {
  return status === 'not_configured' ? 'Not configured' : status
}

async function loadIntegrations(): Promise<void> {
  loading.value = true
  failed.value = false

  try {
    integrations.value = await fetchIntegrations()
  } catch {
    integrations.value = []
    failed.value = true
  } finally {
    loading.value = false
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
            <VChip color="warning" variant="tonal">
              {{ statusLabel(integration.status) }}
            </VChip>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>
  </section>
</template>
