import { defineConfig } from 'vite';
import { driftPlugin } from 'driftjs-vite-plugin';

export default defineConfig({
  plugins: [driftPlugin()],
});
