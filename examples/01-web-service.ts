/**
 * Example 01 — Web Service (Contract Mode)
 *
 * Showcases: contract-first builder, lifecycle (OnInit/OnDestroy),
 * dependency inversion, scope, introspection, fuzzy error.
 */
import { container, ProviderNotFoundError } from '../src/index.js';

// ── Domain interfaces (the contract) ────────────────────────────────────────

interface ILogger {
  log(msg: string): void;
}

interface IDatabase {
  connected: boolean;
  query(sql: string): string;
}

interface IUserRepository {
  findById(id: string): string;
}

interface IUserService {
  getUser(id: string): string;
}

// ── Concrete implementations ────────────────────────────────────────────────

class ConsoleLogger implements ILogger {
  onInit() { console.log('[Logger] initialized'); }
  onDestroy() { console.log('[Logger] shut down'); }
  log(msg: string) { console.log(`[Logger] ${msg}`); }
}

class PgDatabase implements IDatabase {
  connected = false;
  onInit() { this.connected = true; console.log('[Database] connected'); }
  onDestroy() { this.connected = false; console.log('[Database] disconnected'); }
  query(sql: string) { return `result of: ${sql}`; }
}

class PgUserRepository implements IUserRepository {
  constructor(private db: IDatabase) {}
  findById(id: string) {
    return this.db.query(`SELECT * FROM users WHERE id = '${id}'`);
  }
}

class UserService implements IUserService {
  constructor(private repo: IUserRepository, private logger: ILogger) {}
  getUser(id: string) {
    this.logger.log(`fetching user ${id}`);
    return this.repo.findById(id);
  }
}

// ── Contract-first container ────────────────────────────────────────────────

interface AppDeps {
  ILogger: ILogger;
  IDatabase: IDatabase;
  IUserRepo: IUserRepository;
  IUserService: IUserService;
}

const app = container<AppDeps>()
  .add('ILogger', () => new ConsoleLogger())
  .add('IDatabase', () => new PgDatabase())
  .add('IUserRepo', (c) => new PgUserRepository(c.IDatabase))
  .add('IUserService', (c) => new UserService(c.IUserRepo, c.ILogger))
  .build();

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Preload — eagerly resolves db and triggers onInit()
  console.log('=== Preload ===');
  await app.preload('IDatabase');
  console.log(`db connected: ${app.IDatabase.connected}`);

  // 2. Use the service
  console.log('\n=== Service call ===');
  const result = app.IUserService.getUser('42');
  console.log(result);

  // 3. Scope — per-request child container
  console.log('\n=== Scoped request ===');
  const request = app.scope(
    { requestId: () => crypto.randomUUID() },
    { name: 'http-request' },
  );
  console.log(`requestId: ${request.requestId}`);
  console.log(`same requestId: ${request.requestId}`); // singleton within scope
  console.log(`parent logger accessible: ${request.ILogger instanceof ConsoleLogger}`);

  // 4. Introspection
  console.log('\n=== Introspection ===');
  const graph = app.inspect();
  console.log(JSON.stringify(graph, null, 2));

  const info = app.describe('IUserService');
  console.log('IUserService deps:', info.deps);

  const status = app.health();
  console.log(`health: ${status.resolved.length}/${status.totalProviders} resolved`);

  console.log('\n=== toString ===');
  console.log(String(app));

  // 5. Fuzzy error — access a typo key
  console.log('\n=== Fuzzy suggestion ===');
  try {
    // @ts-expect-error intentional typo
    app.IUserServce;
  } catch (e) {
    if (e instanceof ProviderNotFoundError) {
      console.log(`error: ${e.message.split('\n')[0]}`);
      console.log(`hint: ${e.hint.split('\n')[0]}`);
    }
  }

  // 6. Dispose — calls onDestroy in reverse order
  console.log('\n=== Dispose ===');
  await app.dispose();
}

main().catch(console.error);
