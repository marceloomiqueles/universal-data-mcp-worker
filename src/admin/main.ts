import { createApp } from 'vue'

import App from './App.vue'
import { router } from './router'
import { adminSession, provideAdminSession } from './session'
import { vuetify } from './vuetify'
import './styles.css'

const app = createApp(App)
provideAdminSession(app, adminSession)
app.use(router).use(vuetify).mount('#app')
