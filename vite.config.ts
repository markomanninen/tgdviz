import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path' // Tarvitaan aliaksille

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'), // Määritellään @/* alias
    },
  },
  server: {
    port: 3000, // Oletusportti
    open: true    // Avaa selain automaattisesti
  }
})
