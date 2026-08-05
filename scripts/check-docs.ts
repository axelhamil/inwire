import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOC_FILES = ['README.md', 'llms-full.txt'];

/**
 * Diagnostics that a partial snippet legitimately produces: documentation code
 * references types and modules it does not define (`new Repo(...)`,
 * `from '../contracts/IUserRepository'`). Anything else is a real API mismatch.
 */
const PARTIAL_SNIPPET_CODES = new Set([
  2304, // Cannot find name
  2307, // Cannot find module
  2391, // Function implementation is missing — reference blocks list signatures only
  2503, // Cannot find namespace
  2552, // Cannot find name, did you mean
  7016, // Could not find a declaration file
]);

/**
 * A snippet augmenting `AppDeps` demonstrates cross-module forward references:
 * the keys it consumes are declared by a *sibling* file, so resolving them in
 * isolation is impossible by construction.
 */
const AUGMENTATION_CODES = new Set([
  2339, // Property does not exist — provided by another module's augmentation
  2664, // Invalid module name in augmentation — 'inwire' resolves via paths, not node_modules
]);

interface Snippet {
  file: string;
  line: number;
  code: string;
}

function extractSnippets(file: string): Snippet[] {
  const lines = readFileSync(resolve(ROOT, file), 'utf8').split('\n');
  const snippets: Snippet[] = [];
  let open = false;
  let start = 0;
  let buf: string[] = [];

  for (const [i, line] of lines.entries()) {
    if (!open && line.trim() === '```typescript') {
      open = true;
      start = i + 2;
      buf = [];
    } else if (open && line.trim() === '```') {
      open = false;
      snippets.push({ file, line: start, code: buf.join('\n') });
    } else if (open) {
      buf.push(line);
    }
  }
  return snippets;
}

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.es2022.d.ts', 'lib.esnext.disposable.d.ts', 'lib.dom.d.ts'],
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  noImplicitAny: false,
  paths: { inwire: [resolve(ROOT, 'src/index.ts')] },
  baseUrl: ROOT,
};

function checkSnippet(snippet: Snippet): ts.Diagnostic[] {
  const name = resolve(
    ROOT,
    `__doc_snippet_${snippet.file.replace(/\W/g, '_')}_${snippet.line}.ts`,
  );
  // Snippets without a top-level import/export share the global scope, which
  // yields bogus redeclaration errors. `export {}` makes each one a module.
  const needsModuleMarker = !/^\s*(import|export)\s/m.test(snippet.code);
  const source = needsModuleMarker ? `${snippet.code}\n export {};` : snippet.code;

  const host = ts.createCompilerHost(COMPILER_OPTIONS, true);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) =>
    fileName === name
      ? ts.createSourceFile(fileName, source, languageVersion, true)
      : original(fileName, languageVersion, onError, shouldCreate);
  host.fileExists = ((f: string) => f === name || ts.sys.fileExists(f)) as typeof host.fileExists;
  host.readFile = ((f: string) =>
    f === name ? source : ts.sys.readFile(f)) as typeof host.readFile;

  const program = ts.createProgram([name], COMPILER_OPTIONS, host);
  const file = program.getSourceFile(name);
  if (!file) return [];

  // Reference blocks document type signatures rather than runnable code, so they
  // never parse. Skip them instead of reporting noise.
  if (program.getSyntacticDiagnostics(file).length > 0) return [];

  const augments = /declare\s+module\s+['"]inwire['"]/.test(snippet.code);

  return program
    .getSemanticDiagnostics(file)
    .filter((d) => !PARTIAL_SNIPPET_CODES.has(d.code))
    .filter((d) => !(augments && AUGMENTATION_CODES.has(d.code)));
}

const snippets = DOC_FILES.flatMap(extractSnippets);
let failures = 0;

for (const snippet of snippets) {
  for (const diagnostic of checkSnippet(snippet)) {
    failures++;
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
    console.error(`${snippet.file}:${snippet.line} — TS${diagnostic.code}: ${message}`);
  }
}

console.log(`checked ${snippets.length} documentation snippets`);
if (failures > 0) {
  console.error(`${failures} documentation snippet error(s)`);
  process.exit(1);
}
