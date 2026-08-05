import { describe, expect, it } from 'vitest';
import { container } from '../src/index.js';

/**
 * Integration tests covering the full dispose lifecycle across scoped and
 * extended containers. Each scenario verifies that onDestroy() fires exactly
 * once per instance regardless of how many containers hold a reference to it.
 */
describe('dispose lifecycle — scope()', () => {
  it('child dispose does not call onDestroy on parent singletons', async () => {
    let destroyed = 0;
    const root = container()
      .add('svc', () => ({
        onDestroy() {
          destroyed++;
        },
      }))
      .build();
    root.svc; // cache it in root
    const child = root.scope({ childOnly: () => 1 });
    await child.dispose();
    expect(destroyed).toBe(0); // parent singleton untouched — still in parent cache
    await root.dispose();
    expect(destroyed).toBe(1); // destroyed exactly once by root
  });

  it('child-only instances are destroyed when child is disposed', async () => {
    let parentDestroyed = 0;
    let childDestroyed = 0;
    const root = container()
      .add('parent', () => ({
        onDestroy() {
          parentDestroyed++;
        },
      }))
      .build();
    root.parent;
    const child = root.scope({
      childSvc: () => ({
        onDestroy() {
          childDestroyed++;
        },
      }),
    });
    child.childSvc;
    await child.dispose();
    expect(childDestroyed).toBe(1);
    expect(parentDestroyed).toBe(0);
    await root.dispose();
    expect(parentDestroyed).toBe(1);
  });

  it('parent resolved via scope chain lives in parent cache — not destroyed by child', async () => {
    let destroyed = 0;
    const root = container()
      .add('shared', () => ({
        onDestroy() {
          destroyed++;
        },
      }))
      .build();
    const child = root.scope({ extra: () => 42 });
    child.shared; // resolved through parent chain — cached in ROOT, not child
    await child.dispose();
    expect(destroyed).toBe(0);
    await root.dispose();
    expect(destroyed).toBe(1);
  });
});

describe('dispose lifecycle — error resilience', () => {
  it('collects errors across siblings and still calls onDestroy on non-failing instances', async () => {
    let okDestroyed = 0;
    const root = container()
      .add('failing', () => ({
        onDestroy() {
          throw new Error('boom');
        },
      }))
      .add('ok', () => ({
        onDestroy() {
          okDestroyed++;
        },
      }))
      .build();
    root.failing;
    root.ok;
    const ext = root.extend({ extra: () => 1 });
    await expect(ext.dispose()).rejects.toThrow(); // failing throws
    // ok instance was marked destroyed by ext's disposer
    await root.dispose(); // root dispose: ok already destroyed, failing already destroyed
    expect(okDestroyed).toBe(1);
  });
});
