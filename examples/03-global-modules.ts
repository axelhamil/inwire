/**
 * Global-mode modules, the alternative to checked prerequisites. Run: pnpm example:global-modules
 *
 * Prefer `defineModule<{ ...prereqs }>()` (see app/): `.addModule()` then checks every
 * prerequisite at compile time. Use global mode only when modules reference each
 * other in both directions: each file augments `AppDeps` with what it provides, `c`
 * is typed against the merged interface, and the order of `.addModule()` calls no
 * longer matters. The price: prerequisites are unchecked, a missing one is a
 * ProviderNotFoundError on first access.
 */
import { container, defineModule } from '../src/index.js';

interface Mailer {
  send(to: string, text: string): string;
}

interface Billing {
  footer: string;
  invoice(customer: string): string;
}

declare module '../src/index.js' {
  interface AppDeps {
    globalExampleMailer: Mailer;
    globalExampleBilling: Billing;
  }
}

// Billing sends mail, and the mailer signs with the billing footer: a two-way reference.
const billingModule = defineModule()((b) =>
  b.add(
    'globalExampleBilling',
    (c): Billing => ({
      footer: 'Billing team',
      invoice: (customer) => c.globalExampleMailer.send(customer, 'your invoice'),
    }),
  ),
);

const mailerModule = defineModule()((b) =>
  b.add(
    'globalExampleMailer',
    (c): Mailer => ({
      send: (to, text) => `to ${to}: ${text}, ${c.globalExampleBilling.footer}`,
    }),
  ),
);

const app = container().addModule(billingModule).addModule(mailerModule).build();

console.log(app.globalExampleBilling.invoice('ada@example.com'));
