import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const setupFilePath = fileURLToPath(
  new URL('./vitest.setup.ts', import.meta.url),
);

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [setupFilePath],
  },
});
