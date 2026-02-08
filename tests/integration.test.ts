import { describe, it, expect } from 'vitest';
import { createContainer, transient, detectDuplicateKeys } from '../src/index.js';
import type { DepsDefinition } from '../src/index.js';

// === Domain interfaces ===
interface UserRepository {
  findById(id: string): { id: string; name: string };
}

interface Logger {
  log(message: string): void;
  messages: string[];
}

interface AuthService {
  authenticate(token: string): { userId: string };
}

// === Infrastructure implementations ===
class InMemoryUserRepo implements UserRepository {
  private users = new Map([
    ['1', { id: '1', name: 'Alice' }],
    ['2', { id: '2', name: 'Bob' }],
  ]);

  findById(id: string) {
    const user = this.users.get(id);
    if (!user) throw new Error(`User ${id} not found`);
    return user;
  }
}

class ConsoleLogger implements Logger {
  messages: string[] = [];
  log(message: string) {
    this.messages.push(message);
  }
}

class SimpleAuthService implements AuthService {
  constructor(private logger: Logger) {}
  authenticate(token: string) {
    this.logger.log(`Auth: ${token}`);
    return { userId: '1' };
  }
}

// === Modules ===
const userDeps = {
  userRepo: (): UserRepository => new InMemoryUserRepo(),
  userService: (c: any) => ({
    getUser(id: string) {
      c.logger.log(`Getting user ${id}`);
      return c.userRepo.findById(id);
    },
  }),
} satisfies DepsDefinition;

const authDeps = {
  authService: (c: any): AuthService => new SimpleAuthService(c.logger),
} satisfies DepsDefinition;

describe('integration: DDD scenario', () => {
  it('composes modules with spread', () => {
    const container = createContainer({
      logger: (): Logger => new ConsoleLogger(),
      ...userDeps,
      ...authDeps,
    });

    const user = container.userService.getUser('1');
    expect(user).toEqual({ id: '1', name: 'Alice' });

    const auth = container.authService.authenticate('token-123');
    expect(auth).toEqual({ userId: '1' });

    // Logger was shared
    expect(container.logger.messages).toContain('Getting user 1');
    expect(container.logger.messages).toContain('Auth: token-123');
  });

  it('overrides for testing', () => {
    class StubUserRepo implements UserRepository {
      findById() { return { id: 'test', name: 'Test User' }; }
    }

    const testContainer = createContainer({
      logger: (): Logger => new ConsoleLogger(),
      ...userDeps,
      ...authDeps,
      userRepo: (): UserRepository => new StubUserRepo(),
    });

    const user = testContainer.userService.getUser('any');
    expect(user).toEqual({ id: 'test', name: 'Test User' });
  });

  it('detects duplicate keys across modules', () => {
    const moduleA = { logger: () => 'a-logger', db: () => 'a-db' };
    const moduleB = { logger: () => 'b-logger', cache: () => 'b-cache' };

    const dupes = detectDuplicateKeys(moduleA, moduleB);
    expect(dupes).toEqual(['logger']);
  });

  it('scope for request-level isolation', () => {
    const app = createContainer({
      logger: (): Logger => new ConsoleLogger(),
      ...userDeps,
    });

    const request1 = app.scope({
      requestId: () => 'req-001',
      currentUser: () => ({ id: '1', name: 'Alice' }),
    });

    const request2 = app.scope({
      requestId: () => 'req-002',
      currentUser: () => ({ id: '2', name: 'Bob' }),
    });

    expect(request1.requestId).toBe('req-001');
    expect(request2.requestId).toBe('req-002');

    // Both share the same logger singleton
    expect(request1.logger).toBe(request2.logger);
  });

  it('extend to add modules lazily', () => {
    const base = createContainer({
      logger: (): Logger => new ConsoleLogger(),
      ...userDeps,
    });

    // Resolve something first
    base.logger;

    // Extend with auth
    const full = base.extend(authDeps);

    const auth = full.authService.authenticate('late-token');
    expect(auth).toEqual({ userId: '1' });
    expect(full.logger.messages).toContain('Auth: late-token');
  });

  it('full introspection after resolution', () => {
    const container = createContainer({
      logger: (): Logger => new ConsoleLogger(),
      ...userDeps,
      ...authDeps,
    });

    // Resolve everything
    container.userService.getUser('1');
    container.authService;

    const graph = container.inspect();
    expect(Object.keys(graph.providers)).toContain('logger');
    expect(Object.keys(graph.providers)).toContain('userRepo');
    expect(Object.keys(graph.providers)).toContain('userService');
    expect(Object.keys(graph.providers)).toContain('authService');

    expect(graph.providers.userService.deps).toContain('logger');
    expect(graph.providers.userService.deps).toContain('userRepo');

    const health = container.health();
    expect(health.totalProviders).toBe(4);
    expect(health.resolved.length).toBe(4);
    expect(health.unresolved).toEqual([]);
  });

  it('transient in real scenario', () => {
    const container = createContainer({
      logger: (): Logger => new ConsoleLogger(),
      correlationId: transient(() => `cid-${Math.random().toString(36).slice(2)}`),
    });

    const id1 = container.correlationId;
    const id2 = container.correlationId;

    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^cid-/);
  });

  it('full lifecycle: init, use, dispose', async () => {
    const events: string[] = [];

    const container = createContainer({
      db: () => ({
        query: (q: string) => `result:${q}`,
        onInit() { events.push('db:init'); },
        onDestroy() { events.push('db:destroy'); },
      }),
      cache: () => ({
        get: (k: string) => k,
        onInit() { events.push('cache:init'); },
        onDestroy() { events.push('cache:destroy'); },
      }),
    });

    // Lazy init
    expect(events).toEqual([]);

    // First access triggers onInit
    container.db.query('SELECT 1');
    expect(events).toEqual(['db:init']);

    container.cache.get('key');
    expect(events).toEqual(['db:init', 'cache:init']);

    // Dispose
    await container.dispose();
    expect(events).toEqual(['db:init', 'cache:init', 'cache:destroy', 'db:destroy']);
  });
});
