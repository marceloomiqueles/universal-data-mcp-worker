<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDisplay } from 'vuetify'

const navigation = [
  { title: 'Overview', to: '/' },
  { title: 'Status', to: '/status' },
  { title: 'Sign in', to: '/login' },
]

const { mobile } = useDisplay()
const drawerOpen = ref(false)

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
    <VAppBar color="primary" flat>
      <VAppBarNavIcon
        v-if="mobile"
        aria-label="Toggle navigation"
        @click="drawerOpen = !drawerOpen"
      />
      <VAppBarTitle>Universal Data MCP Worker</VAppBarTitle>
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
        <RouterView />
      </VContainer>
    </VMain>
  </VApp>
</template>
