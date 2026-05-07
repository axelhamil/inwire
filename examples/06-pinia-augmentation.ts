/**
 * Example 06 — Pinia-style augmentation ★ RECOMMENDED MODULAR PATTERN ★
 *
 * `defineModule()` (no `<TDeps>` generic) types `c` as the global `AppDeps`
 * interface. Each module file augments `AppDeps` with the bindings it provides
 * via `declare module 'inwire' { interface AppDeps { … } }`. TypeScript merges
 * the declarations, so `c.X` resolves even when `X` is added by another module
 * loaded in any order.
 *
 * Why this is the default for multi-module apps:
 * - Each module file declares what it PROVIDES, in its own file. No shared shape interface.
 * - Cross-module forward references work without ordering constraints.
 * - Mirrors Pinia (`PiniaCustomProperties`) and Vue (`ComponentCustomProperties`).
 * - Zero runtime cost — augmentations are erased after type-check.
 *
 * Trade-off vs `defineModule<TDeps>()` (see example 04):
 * - Pinia-style → declare what a module ADDS, get cross-ref for free.
 * - `<TDeps>` → declare what a module CONSUMES, no cross-ref but no augmentation.
 *
 * Both modes coexist. Pick the one that feels lighter for the file you're writing.
 */
import { container, defineModule } from '../src/index.js';

// ── contracts/ ── interfaces (already in your domain layer) ────────────────

interface IUserRepository {
  findById(id: string): Promise<{ id: string; name: string } | null>;
}

interface IAuthProvider {
  signIn(email: string, password: string): Promise<{ token: string }>;
}

// ── infrastructure/ ─────────────────────────────────────────────────────────

class DrizzleUserRepository implements IUserRepository {
  async findById(id: string) {
    return { id, name: `user-${id}` };
  }
}

class BetterAuthProvider implements IAuthProvider {
  async signIn(email: string, _password: string) {
    return { token: `tok-${email}` };
  }
}

// ── application/ ────────────────────────────────────────────────────────────

class SignInUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly auth: IAuthProvider,
  ) {}

  async execute(email: string, password: string) {
    await this.users.findById(email);
    return this.auth.signIn(email, password);
  }
}

// ── modules/persistence.module.ts ──────────────────────────────────────────
// Augments AppDeps with what THIS module provides.

declare module '../src/index.js' {
  interface AppDeps {
    IUserRepository: IUserRepository;
  }
}

const persistenceModule = defineModule()((b) =>
  b.add('IUserRepository', (): IUserRepository => new DrizzleUserRepository()),
);

// ── modules/auth.module.ts ─────────────────────────────────────────────────
// Adds IAuthProvider. Consumes IUserRepository (provided by persistenceModule).
// `c.IUserRepository` is typed because AppDeps is augmented globally.

declare module '../src/index.js' {
  interface AppDeps {
    IAuthProvider: IAuthProvider;
    SignInUseCase: SignInUseCase;
  }
}

const authModule = defineModule()((b) =>
  b
    .add('IAuthProvider', (): IAuthProvider => new BetterAuthProvider())
    .add(
      'SignInUseCase',
      (c) => new SignInUseCase(c.IUserRepository, c.IAuthProvider),
      //                       ^^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^
      //                       cross-ref to persistenceModule, type-safe
    ),
);

// ── container.ts ────────────────────────────────────────────────────────────
// Order doesn't matter for typing — both modules see the full AppDeps union.

const di = container().addModule(persistenceModule).addModule(authModule).build();

// ── usage ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Pinia-style augmentation ===');

  const session = await di.SignInUseCase.execute('alice@example.com', 'pwd');
  console.log(`  signed in: ${session.token}`);

  const user = await di.IUserRepository.findById('user-7');
  console.log(`  user: ${user?.name}`);

  console.log('\n=== Inferred container keys ===');
  console.log(`  ${Object.keys(di).join(', ')}`);
}

main();
