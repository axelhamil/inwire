// Deno: deno run examples/04-deno.ts, after replacing the import with 'npm:inwire@^4'.
// Bun and Node run every example as is: bun examples/app/api.ts
/**
 * inwire is plain ES2022 with no runtime dependency, so the only change across
 * runtimes is the import specifier.
 */
import { container } from '../src/index.js';

const app = container()
  .add('config', { runtime: 'deno' })
  .add('cache', () => new Map<string, string>(), { dispose: (cache) => cache.clear() })
  .build();

app.cache.set('greeting', `hello from ${app.config.runtime}`);
console.log(app.cache.get('greeting'));

await app.dispose();
