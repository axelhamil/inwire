/**
 * Example 02 — Modular Testing
 *
 * Showcases: modules via spread, test overrides, reset, extend with transient.
 */
import { createContainer, transient } from "../src/index.js";

// ── Modules (plain objects of factories) ────────────────────────────────────
//
// Design trade-off: `c` is typed as `any` in every factory — TypeScript fully
// infers the *resolved* container type (what you get from `container.xyz`), but
// cannot circularly infer the container shape inside the factories that define it.
//
// This is deliberate: zero ceremony, no tokens, no decorators.
// In exchange, inwire provides a robust runtime safety net:
//   - ProviderNotFoundError with fuzzy suggestion ("Did you mean 'logger'?")
//   - Full resolution chain in every error (a -> b -> c (not found))
//   - Structured `hint` + `details` on all 7 error types
//   - Duplicate key detection internally via health().warnings
//   - health() warnings for scope mismatches (singleton depending on transient)

const shared = {
  config: () => ({ appName: "MyApp", version: "1.0.0" }),
  logger: () => ({
    log: (msg: string) => console.log(`[LOG] ${msg}`),
  }),
};

const auth = {
  tokenService: () => ({
    verify: (token: string) => token === "valid-token",
    sign: (userId: string) => `token-for-${userId}`,
  }),
  authMiddleware: (c: any) => ({
    authenticate: (token: string) => {
      const valid = c.tokenService.verify(token);
      c.logger.log(`auth ${valid ? "success" : "failure"}`);
      return valid;
    },
  }),
};

const user = {
  userRepo: () => ({
    users: [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ],
    findById(id: string) {
      return this.users.find((u) => u.id === id);
    },
  }),
  userService: (c: any) => ({
    getUser(id: string) {
      c.logger.log(`getUser(${id})`);
      return c.userRepo.findById(id);
    },
  }),
};

const notification = {
  emailService: () => ({
    sent: [] as string[],
    send(to: string, msg: string) {
      this.sent.push(`${to}: ${msg}`);
      console.log(`[Email] → ${to}: ${msg}`);
    },
  }),
};

// ── 1. Compose modules via spread ───────────────────────────────────────────

console.log("=== Compose modules ===");
const container = createContainer({
  ...shared,
  ...auth,
  ...user,
  ...notification,
});

const alice = container.userService.getUser("1");
console.log(`found: ${alice?.name}`);

container.authMiddleware.authenticate("valid-token");

// ── 2. Test overrides — new container with mocks ────────────────────────────

console.log("\n=== Test overrides ===");

function createTestContainer() {
  return createContainer({
    ...shared,
    ...auth,
    ...user,
    ...notification,
    // Override with mocks
    emailService: () => ({
      sent: [] as string[],
      send(to: string, msg: string) {
        this.sent.push(`${to}: ${msg}`);
        // no actual sending
      },
    }),
    userRepo: () => ({
      users: [{ id: "99", name: "TestUser" }],
      findById(id: string) {
        return this.users.find((u) => u.id === id);
      },
    }),
  });
}

// Test 1: isolated container
const test1 = createTestContainer();
const testUser = test1.userService.getUser("99");
console.log(`test1 found: ${testUser?.name}`);

// Test 2: reset for isolation within same container
const test2 = createTestContainer();
test2.userService.getUser("99");
test2.reset("userRepo", "userService"); // clear cache
console.log("test2 reset: singletons invalidated");

// ── 3. Extend with transient helpers ────────────────────────────────────────

console.log("\n=== Extend with transient ===");

const extended = container.extend({
  requestId: transient(() => crypto.randomUUID()),
  timestamp: transient(() => Date.now()),
});

const id1 = extended.requestId;
const id2 = extended.requestId;
console.log(`transient ids equal: ${id1 === id2}`); // false
console.log(
  `original logger still works: ${typeof extended.logger.log === "function"}`,
);

// ── 4. Health check ─────────────────────────────────────────────────────────

console.log("\n=== Health ===");
const health = container.health();
console.log(`total providers: ${health.totalProviders}`);
console.log(`resolved: ${health.resolved.length}`);
console.log(`warnings: ${health.warnings.length}`);

// ── 5. Runtime safety net (the trade-off for `c: any`) ─────────────────────
//
// Since separate modules use `c: any`, typos aren't caught at compile time.
// But inwire catches them at runtime with actionable diagnostics:

console.log("\n=== Runtime safety net ===");
try {
  // Simulates a typo in a module factory: 'loger' instead of 'logger'.
  // With `c: any` the compiler won't catch it, but inwire will — at runtime,
  // with a fuzzy suggestion pointing to the correct key.
  const withBug = container.extend({
    broken: (c: any) => c.loger.log("oops"),
  });
  withBug.broken;
} catch (e: any) {
  console.log(`caught: ${e.constructor.name}`);
  console.log(`message: ${e.message.split("\n")[0]}`);
  console.log(`hint: ${e.hint.split("\n")[0]}`);
  console.log(`suggestion: ${e.details.suggestion}`);
}
