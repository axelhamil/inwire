/**
 * Example 05 — Zod-style type inference
 *
 * Pattern: `type Di = typeof di` — one source of truth, derived from the
 * container itself. No interface to keep in sync, no `declare module`
 * augmentation. Exactly like `z.infer<typeof schema>`.
 *
 * Each module declares ONLY the contracts (interfaces) it consumes via
 * `defineModule<TDeps>()`. In a Clean Architecture / DDD codebase those
 * interfaces already exist in `domain/` or `contracts/` — you reuse them
 * instead of inventing a parallel container-shape interface.
 *
 * Adding a new binding anywhere → `Di` grows automatically. Removing one
 * → `Di` shrinks. The compiler does the bookkeeping.
 */
import { container, defineModule } from '../src/index.js';

// ── contracts/ ── interfaces that already exist in your domain layer ────────
// In a real codebase each lives in its own file (e.g. contracts/IUserRepository.ts).

interface IUserRepository {
  findById(id: string): Promise<{ id: string; name: string } | null>;
}

interface IAuthProvider {
  signIn(email: string, password: string): Promise<{ token: string }>;
}

interface IPaymentGateway {
  charge(amount: number, customerId: string): Promise<{ chargeId: string }>;
}

// ── infrastructure/ ── concrete implementations ────────────────────────────

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

class StripeGateway implements IPaymentGateway {
  async charge(amount: number, customerId: string) {
    return { chargeId: `ch_${customerId}_${amount}` };
  }
}

// ── application/ ── use cases depend on contracts only ─────────────────────

class SignInUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly auth: IAuthProvider,
  ) {}

  async execute(email: string, password: string) {
    await this.users.findById(email); // touch users so it's not unused
    const session = await this.auth.signIn(email, password);
    return { ...session, email };
  }
}

class ChargeCustomerUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly gateway: IPaymentGateway,
  ) {}

  async execute(userId: string, amount: number) {
    const user = await this.users.findById(userId);
    if (!user) throw new Error(`unknown user ${userId}`);
    return this.gateway.charge(amount, user.id);
  }
}

// ── modules/persistence.module.ts ──────────────────────────────────────────
// Provides IUserRepository. No prerequisites, no <TDeps>.

const persistenceModule = defineModule()((b) =>
  b.add('IUserRepository', (): IUserRepository => new DrizzleUserRepository()),
);

// ── modules/auth.module.ts ─────────────────────────────────────────────────
// Consumes IUserRepository, provides IAuthProvider + SignInUseCase.
// `<TDeps>` lists only what THIS module needs — local, explicit, minimal.

const authModule = defineModule<{
  IUserRepository: IUserRepository;
}>()((b) =>
  b
    .add('IAuthProvider', (): IAuthProvider => new BetterAuthProvider())
    .add('SignInUseCase', (c) => new SignInUseCase(c.IUserRepository, c.IAuthProvider)),
);

// ── modules/billing.module.ts ──────────────────────────────────────────────

const billingModule = defineModule<{
  IUserRepository: IUserRepository;
}>()((b) =>
  b
    .add('IPaymentGateway', (): IPaymentGateway => new StripeGateway())
    .add(
      'ChargeCustomerUseCase',
      (c) => new ChargeCustomerUseCase(c.IUserRepository, c.IPaymentGateway),
    ),
);

// ── container.ts ── single source of truth ─────────────────────────────────

const di = container()
  .addModule(persistenceModule)
  .addModule(authModule)
  .addModule(billingModule)
  .build();

// Derive Di from the container — exactly like z.infer<typeof schema>.
// No interface to maintain. Add a binding → Di grows. Remove one → it shrinks.
export type Di = typeof di;

// ── consumers can type against Di ─────────────────────────────────────
// Useful for handlers, controllers, route definitions, etc.

async function getUser(deps: Di, id: string) {
  return deps.IUserRepository.findById(id);
}

async function main() {
  console.log('=== Zod-style typing ===');

  const session = await di.SignInUseCase.execute('alice@example.com', 'pwd');
  console.log(`  signed in: ${session.token}`);

  const charge = await di.ChargeCustomerUseCase.execute('user-42', 1999);
  console.log(`  charge: ${charge.chargeId}`);

  const user = await getUser(di, 'user-7');
  console.log(`  user: ${user?.name}`);

  console.log('\n=== Inferred Di keys ===');
  console.log(`  ${Object.keys(di).join(', ')}`);
}

main();
