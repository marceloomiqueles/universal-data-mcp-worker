<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAdminSession } from '../session'

const session = useAdminSession()
const route = useRoute()
const router = useRouter()
const username = ref('')
const password = ref('')
const passwordConfirmation = ref('')
const validationError = ref<string | null>(null)

const isSetup = computed(() => session.state.status === 'setup')

function destination(): string {
  const redirect = route.query.redirect
  return typeof redirect === 'string' &&
    redirect.startsWith('/') &&
    !redirect.startsWith('//')
    ? redirect
    : '/'
}

async function submit() {
  validationError.value = null

  if (
    !username.value ||
    !password.value ||
    (isSetup.value && !passwordConfirmation.value)
  ) {
    validationError.value = 'Complete all required fields.'
    return
  }
  if (isSetup.value && password.value !== passwordConfirmation.value) {
    validationError.value = 'Passwords do not match.'
    return
  }
  if (isSetup.value && password.value.length < 12) {
    validationError.value = 'Password must contain at least 12 characters.'
    return
  }

  const authenticated = isSetup.value
    ? await session.setup(username.value, password.value)
    : await session.login(username.value, password.value)

  password.value = ''
  passwordConfirmation.value = ''
  if (authenticated) await router.replace(destination())
}
</script>

<template>
  <section
    class="auth-card"
    :aria-labelledby="isSetup ? 'setup-heading' : 'login-heading'"
  >
    <VCard width="100%" max-width="440" variant="outlined">
      <VCardTitle :id="isSetup ? 'setup-heading' : 'login-heading'">
        {{ isSetup ? 'Set up your account' : 'Sign in' }}
      </VCardTitle>
      <VCardText>
        <p v-if="isSetup" class="text-body-1 text-medium-emphasis mb-5">
          Create the administrator account for this self-hosted deployment.
        </p>

        <VAlert
          v-if="isSetup && !session.state.bootstrapAvailable"
          type="warning"
          variant="tonal"
          class="mb-5"
        >
          Open the authorized setup link supplied for this deployment.
        </VAlert>
        <VAlert
          v-if="validationError || session.state.error"
          type="error"
          variant="tonal"
          class="mb-5"
          aria-live="polite"
        >
          {{ validationError ?? session.state.error }}
        </VAlert>

        <VForm @submit.prevent="submit">
          <VTextField
            v-model="username"
            label="Username"
            autocomplete="username"
            required
            :disabled="session.state.pending"
          />
          <VTextField
            v-model="password"
            label="Password"
            type="password"
            :autocomplete="isSetup ? 'new-password' : 'current-password'"
            required
            :disabled="session.state.pending"
          />
          <VTextField
            v-if="isSetup"
            v-model="passwordConfirmation"
            label="Confirm password"
            type="password"
            autocomplete="new-password"
            required
            :disabled="session.state.pending"
          />
          <VBtn
            color="primary"
            type="submit"
            block
            :loading="session.state.pending"
            :disabled="isSetup && !session.state.bootstrapAvailable"
          >
            {{ isSetup ? 'Create account' : 'Sign in' }}
          </VBtn>
        </VForm>
      </VCardText>
    </VCard>
  </section>
</template>
