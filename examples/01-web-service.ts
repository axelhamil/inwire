/**
 * Example 01 — Web Service
 *
 * Showcases: lifecycle (OnInit/OnDestroy), scope, introspection, fuzzy error.
 */
import { createContainer, ProviderNotFoundError } from '../src/index.js';

// ── Services ────────────────────────────────────────────────────────────────

class Logger {
  onInit() {
    console.log('[Logger] initialized');
  }
  onDestroy() {
    console.log('[Logger] shut down');
  }
  log(msg: string) {
    console.log(`[Logger] ${msg}`);
  }
}

class Database {
  connected = false;

  onInit() {
    this.connected = true;
    console.log('[Database] connected');
  }

  onDestroy() {
    this.connected = false;
    console.log('[Database] disconnected');
  }

  query(sql: string) {
    return `result of: ${sql}`;
  }
}

class UserRepository {
  constructor(private db: Database) {}
  findById(id: string) {
    return this.db.query(`SELECT * FROM users WHERE id = '${id}'`);
  }
}

class UserService {
  constructor(
    private repo: UserRepository,
    private logger: Logger,
  ) {}
  getUser(id: string) {
    this.logger.log(`fetching user ${id}`);
    return this.repo.findById(id);
  }
}

// ── Container setup ─────────────────────────────────────────────────────────

const container = createContainer({
  logger: () => new Logger(),
  db: () => new Database(),
  userRepo: (c) => new UserRepository(c.db),
  userService: (c) => new UserService(c.userRepo, c.logger),
});

async function main() {
  // 1. Preload — eagerly resolves db and triggers onInit()
  console.log('=== Preload ===');
  await container.preload('db');
  console.log(`db connected: ${container.db.connected}`);

  // 2. Use the service
  console.log('\n=== Service call ===');
  const result = container.userService.getUser('42');
  console.log(result);

  // 3. Scope — per-request child container
  console.log('\n=== Scoped request ===');
  const request = container.scope(
    {
      requestId: () => crypto.randomUUID(),
    },
    { name: 'http-request' },
  );
  console.log(`requestId: ${request.requestId}`);
  console.log(`same requestId: ${request.requestId}`); // singleton within scope
  console.log(`parent logger accessible: ${request.logger instanceof Logger}`);

  // 4. Introspection
  console.log('\n=== Introspection ===');
  const graph = container.inspect();
  console.log('providers:', Object.keys(graph.providers));

  const info = container.describe('userService');
  console.log('userService deps:', info.deps);

  const status = container.health();
  console.log(`health: ${status.resolved.length}/${status.totalProviders} resolved`);

  // 5. Fuzzy error — access a typo key
  console.log('\n=== Fuzzy suggestion ===');
  try {
    // @ts-expect-error intentional typo
    container.userServce;
  } catch (e) {
    if (e instanceof ProviderNotFoundError) {
      console.log(`error: ${e.message.split('\n')[0]}`);
      console.log(`hint: ${e.hint.split('\n')[0]}`);
    }
  }

  // 6. Dispose — calls onDestroy in reverse order
  console.log('\n=== Dispose ===');
  await container.dispose();
}

main().catch(console.error);
