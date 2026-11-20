import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Dev proxy mirrors nginx.conf: REST and the socket.io namespace both go to the API.
const api = 'http://localhost:3000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': api,
      '/socket.io': { target: api, ws: true },
    },
  },
  test: { environment: 'node' },
})
