<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'

import { useAdminSession } from './session'

const navigation = [
  { title: 'Overview', to: '/' },
  { title: 'Status', to: '/status' },
]

const { mobile } = useDisplay()
const drawerOpen = ref(false)
const session = useAdminSession()
const router = useRouter()

async function signOut() {
  if (await session.logout()) await router.replace('/login')
}

watch(
  mobile,
  (isMobile) => {
    drawerOpen.value = !isMobile
  },
  { immediate: true },
)
</script>

<template>
  <VApp>
    <div
      v-if="session.state.status === 'loading'"
      class="d-flex align-center justify-center min-height-screen"
      aria-live="polite"
      aria-label="Loading administration session"
    >
      <div class="text-center">
        <VProgressCircular indeterminate color="primary" class="mb-4" />
        <p class="text-body-1">Loading administration session…</p>
      </div>
    </div>

    <template v-else-if="session.state.status === 'authenticated'">
      <VAppBar color="primary" flat>
        <VAppBarNavIcon
          v-if="mobile"
          aria-label="Toggle navigation"
          @click="drawerOpen = !drawerOpen"
        />
        <VAppBarTitle>Universal Data MCP Worker</VAppBarTitle>
        <span class="text-body-2 mr-3">{{
          session.state.owner?.username
        }}</span>
        <VBtn variant="text" :loading="session.state.pending" @click="signOut">
          Sign out
        </VBtn>
      </VAppBar>

      <VNavigationDrawer v-model="drawerOpen" :permanent="!mobile">
        <VList nav aria-label="Main navigation">
          <VListItem
            v-for="item in navigation"
            :key="item.to"
            :title="item.title"
            :to="item.to"
            rounded="lg"
          />
        </VList>
      </VNavigationDrawer>

      <VMain>
        <VContainer class="py-8" fluid>
          <VAlert
            v-if="session.state.error"
            type="error"
            variant="tonal"
            class="mb-5"
          >
            {{ session.state.error }}
          </VAlert>
          <RouterView />
        </VContainer>
      </VMain>
    </template>

    <VMain v-else>
      <VContainer
        class="d-flex align-center justify-center min-height-screen py-8"
      >
        <RouterView />
      </VContainer>
    </VMain>
  </VApp>
</template>
