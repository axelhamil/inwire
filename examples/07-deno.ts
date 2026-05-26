// Deno usage: deno run --allow-env examples/07-deno.ts
// In Deno, replace the import below with: import { container, transient } from 'npm:inwire@^3';
/**
 * Example 07 — Deno runtime
 *
 * Showcases: container(), .add(), transient(), .build(), OnInit/OnDestroy lifecycle.
 * Run locally in Node/Bun for type-checking; swap the specifier to `npm:inwire@^3` for Deno.
 */
import { container, transient } from '../src/index.js';

// ── Services ────────────────────────────────────────────────────────────────

interface ICache {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}

class InMemoryCache implements ICache {
  private store = new Map<string, string>();

  onInit() {
    console.log('[Cache] ready');
  }

  onDestroy() {
    this.store.clear();
    console.log('[Cache] cleared');
  }

  get(key: string) {
    return this.store.get(key);
  }

  set(key: string, value: string) {
    this.store.set(key, value);
  }
}

// ── Container ────────────────────────────────────────────────────────────────

const app = container()
  .add('config', { env: 'deno', version: '1.0.0' })
  .add('cache', (): ICache => new InMemoryCache())
  // transient: a new request context is created on each access
  .addTransient(
    'requestId',
    transient(() => crypto.randomUUID()),
  )
  .build();

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`env: ${app.config.env}`);

  // OnInit triggered on first access
  app.cache.set('greeting', 'hello from Deno');
  console.log(`cache hit: ${app.cache.get('greeting')}`);

  // transient: each access returns a fresh value
  const id1 = app.requestId;
  const id2 = app.requestId;
  console.log(`transient ids differ: ${id1 !== id2}`);

  await app.dispose();
}

main().catch(console.error);
