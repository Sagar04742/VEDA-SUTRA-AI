import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The ports come from server/.env, the one place they are configured:
//   PORT       the API server (default 5000)
//   CLIENT_URL the web app's address; its port is used for this dev server (default 5173)
// In dev, /api is proxied to the API so cookies stay same-origin.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('../server', import.meta.url)), '');
  const apiPort = env.PORT || 5000;
  const clientPort = Number(new URL(env.CLIENT_URL || 'http://localhost:5173').port) || 5173;
  return {
    plugins: [react(), tailwindcss()],
    server: { port: clientPort, strictPort: true, proxy: { '/api': `http://localhost:${apiPort}` } },
  };
});
