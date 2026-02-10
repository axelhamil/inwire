/**
 * Example 02 — Modular Testing
 *
 * Showcases: free mode builder, instance values, test overrides, reset,
 * extend with transient, runtime safety net.
 */
import { container, transient } from "../src/index.js";

// ── Build container with free-mode builder ──────────────────────────────────

const app = container()
  .add("config", { appName: "MyApp", version: "1.0.0" }) // instance (eager)
  .add("logger", () => ({
    log: (msg: string) => console.log(`[LOG] ${msg}`),
  }))
  .add("tokenService", () => ({
    verify: (token: string) => token === "valid-token",
    sign: (userId: string) => `token-for-${userId}`,
  }))
  .add("authMiddleware", (c) => ({
    authenticate: (token: string) => {
      const valid = c.tokenService.verify(token);
      c.logger.log(`auth ${valid ? "success" : "failure"}`);
      return valid;
    },
  }))
  .add("userRepo", () => ({
    users: [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ],
    findById(id: string) {
      return this.users.find((u) => u.id === id);
    },
  }))
  .add("userService", (c) => ({
    getUser(id: string) {
      c.logger.log(`getUser(${id})`);
      return c.userRepo.findById(id);
    },
  }))
  .add("emailService", () => ({
    sent: [] as string[],
    send(to: string, msg: string) {
      this.sent.push(`${to}: ${msg}`);
      console.log(`[Email] → ${to}: ${msg}`);
    },
  }))
  .build();

// ── 1. Use the container ────────────────────────────────────────────────────

console.log("=== Compose modules ===");
console.log(`app: ${app.config.appName} v${app.config.version}`);

const alice = app.userService.getUser("1");
console.log(`found: ${alice?.name}`);

app.authMiddleware.authenticate("valid-token");

// ── 2. Test overrides — new container with mocks ────────────────────────────

console.log("\n=== Test overrides ===");

function createTestContainer() {
  return container()
    .add("config", { appName: "TestApp", version: "0.0.1" })
    .add("logger", () => ({ log: (_: string) => {} })) // silent logger
    .add("tokenService", () => ({
      verify: (_t: string) => true,
      sign: (userId: string) => `test-token-${userId}`,
    }))
    .add("authMiddleware", (c) => ({
      authenticate: (token: string) => c.tokenService.verify(token),
    }))
    .add("userRepo", () => ({
      users: [{ id: "99", name: "TestUser" }],
      findById(id: string) {
        return this.users.find((u) => u.id === id);
      },
    }))
    .add("userService", (c) => ({
      getUser(id: string) {
        return c.userRepo.findById(id);
      },
    }))
    .add("emailService", () => ({
      sent: [] as string[],
      send(to: string, msg: string) {
        this.sent.push(`${to}: ${msg}`);
      },
    }))
    .build();
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

const extended = app.extend({
  requestId: transient(() => crypto.randomUUID()),
  timestamp: transient(() => Date.now()),
});

const id1 = extended.requestId;
const id2 = extended.requestId;
console.log(`transient ids equal: ${id1 === id2}`); // false
console.log(
  `original logger still works: ${typeof extended.logger.log === "function"}`,
);

// ── 4. Introspection ────────────────────────────────────────────────────────

console.log("\n=== Graph ===");
console.log(String(app));
console.log(JSON.stringify(app.inspect(), null, 2));

console.log("\n=== Health ===");
const health = app.health();
console.log(`total providers: ${health.totalProviders}`);
console.log(`resolved: ${health.resolved.length}`);
console.log(`warnings: ${health.warnings.length}`);

// ── 5. Runtime safety net ───────────────────────────────────────────────────

console.log("\n=== Runtime safety net ===");
try {
  const withBug = app.extend({
    broken: (c: any) => c.loger.log("oops"),
  });
  withBug.broken;
} catch (e: any) {
  console.log(`caught: ${e.constructor.name}`);
  console.log(`message: ${e.message.split("\n")[0]}`);
  console.log(`hint: ${e.hint.split("\n")[0]}`);
  console.log(`suggestion: ${e.details.suggestion}`);
}
