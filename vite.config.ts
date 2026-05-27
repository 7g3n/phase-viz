import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // NOTE: Removed Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy
  // headers in dev to allow loading `ffmpeg-core.js` from CDN. If you need
  // COOP/COEP for SharedArrayBuffer/WebCodecs, host ffmpeg assets on the same
  // origin or configure a proxy that sets the required CORP headers.
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            const parts = id.split('node_modules/')[1].split('/');
            const pkg = parts[0].startsWith('@') ? parts.slice(0,2).join('/') : parts[0];
            return `vendor-${pkg.replace('@', '').replace('/', '-')}`;
          }
        },
      },
    },
  },
})
