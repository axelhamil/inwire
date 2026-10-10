import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as source from '../src/index.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_ENTRY = resolve(ROOT, 'dist/index.mjs');

/**
 * Constructor arguments of every exported error class. A minified build renames
 * classes, so a name that is only derived from the class reads `a` or `o` once
 * published: this script checks the built package, where the sources cannot.
 * An error class exported without an entry here fails the check.
 */
const ERROR_SAMPLES: Record<string, unknown[]> = {
  ContainerConfigError: ['key', 'string'],
  DuplicateKeyError: ['key'],
  ReservedKeyError: ['scope', ['scope']],
  ProviderNotFoundError: ['key', [], ['other']],
  CircularDependencyError: ['a', ['a', 'b']],
  UndefinedReturnError: ['key', []],
  FactoryError: ['key', [], new Error('boom')],
  ContainerDisposedError: ['key'],
  DisposeTimeoutError: ['key', 10],
  TopologicalSortError: [['a', 'b']],
};

type Class = new (...args: unknown[]) => unknown;

function isClass(value: unknown): value is Class {
  return typeof value === 'function' && /^class\b/.test(Function.prototype.toString.call(value));
}

function isErrorClass(value: Class): boolean {
  return value.prototype instanceof Error;
}

if (!existsSync(DIST_ENTRY)) {
  console.error('dist/index.mjs is missing: run `pnpm build` first');
  process.exit(1);
}

const dist: Record<string, unknown> = await import(pathToFileURL(DIST_ENTRY).href);
const failures: string[] = [];
let checked = 0;

for (const [exportName, sourceValue] of Object.entries(source)) {
  if (!isClass(sourceValue)) continue;
  checked++;

  const built = dist[exportName];
  if (!isClass(built)) {
    failures.push(`${exportName}: not exported as a class by the built package`);
    continue;
  }
  if (built.name !== exportName) {
    failures.push(`${exportName}: the built class is named '${built.name}'`);
  }

  if (!isErrorClass(built) || exportName === 'ContainerError') continue;

  const sample = ERROR_SAMPLES[exportName];
  if (!sample) {
    failures.push(`${exportName}: add its constructor arguments to ERROR_SAMPLES`);
    continue;
  }

  const error = new built(...sample) as Error;
  const stackHeader = error.stack?.split('\n')[0] ?? '';
  const containerError = dist.ContainerError as Class;

  if (error.name !== exportName) {
    failures.push(`${exportName}: error.name is '${error.name}'`);
  }
  if (!stackHeader.startsWith(`${exportName}: `)) {
    failures.push(`${exportName}: the stack starts with '${stackHeader}'`);
  }
  if (!(error instanceof built && error instanceof containerError && error instanceof Error)) {
    failures.push(`${exportName}: instanceof is broken in the built package`);
  }
}

console.log(`checked ${checked} classes of the built package`);
if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  console.error(`${failures.length} class name error(s) in dist/`);
  process.exit(1);
}
