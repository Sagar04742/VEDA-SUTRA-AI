import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // One shared in-memory MongoDB for the whole run (so the binary is downloaded only once).
    globalSetup: ['./tests/globalSetup.js'],
    hookTimeout: 120000,
    testTimeout: 30000, // some files parse large PDFs while others run in parallel
  },
});
