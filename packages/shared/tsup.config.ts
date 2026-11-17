import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  // Tests live next to sources but are not part of the bundle.
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2023',
});
