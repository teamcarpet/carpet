import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
    }),
  ],
  define: {
    'process.env': {},
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      // `/` is the marketing landing, `/app/` is the trading terminal.
      input: {
        landing: fileURLToPath(new URL('./index.html', import.meta.url)),
        app: fileURLToPath(new URL('./app/index.html', import.meta.url)),
      },
      output: {
        manualChunks: {
          solana: ['@solana/web3.js', '@solana/spl-token'],
          livekit: ['livekit-client'],
        },
      },
    },
  },
  server: {
    // server/index.js runs the same handlers Vercel serves from api/.
    proxy: { '/api': 'http://localhost:3002' },
  },
  preview: {
    proxy: { '/api': 'http://localhost:3002' },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
  },
});
