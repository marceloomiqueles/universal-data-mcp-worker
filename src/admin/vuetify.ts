import 'vuetify/styles'
import { createVuetify } from 'vuetify'

export const vuetify = createVuetify({
  theme: {
    defaultTheme: 'projectLight',
    themes: {
      projectLight: {
        dark: false,
        colors: {
          primary: '#176b5b',
          secondary: '#52635f',
        },
      },
    },
  },
})
