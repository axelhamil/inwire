import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  sourcemap: true,
  clean: true,
  minify: { mangle: { keepNames: { class: true, function: false } } },
  treeshake: true,
  target: 'es2022',
  publint: true,
});
