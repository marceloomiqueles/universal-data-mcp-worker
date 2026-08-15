<script setup lang="ts">
const navigation = [
  { title: 'Overview', to: '/' },
  { title: 'Status', to: '/status' },
  { title: 'Sign in', to: '/login' },
]
</script>

<template>
  <VApp>
    <VAppBar color="primary" flat>
      <VAppBarTitle>Universal Data MCP Worker</VAppBarTitle>
    </VAppBar>

    <VNavigationDrawer permanent>
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
