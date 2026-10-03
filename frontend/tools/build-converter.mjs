import { build } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await build({
  root, configFile: false, publicDir: false,
  build: {
    target: 'node22', outDir: 'dist-tools', emptyOutDir: true, minify: false,
    lib: { entry: 'tools/convert-rviz.ts', formats: ['es'], fileName: () => 'convert-rviz.mjs' },
    rollupOptions: { external: id => id.startsWith('node:') },
  },
});
