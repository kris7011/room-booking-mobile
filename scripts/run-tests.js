// `npm test`: compiles tests/ (and the logic it imports from src/) with
// tsconfig.test.json, then runs them with Node's built-in test runner.
//
// Node exits 0 when a glob matches no files, so a broken build could make CI
// pass without running anything. This script fails instead when the compiled
// test files do not match the sources in tests/.
const { spawnSync } = require('node:child_process');
const { globSync, rmSync } = require('node:fs');

const OUT_DIR = '.test-build';

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

rmSync(OUT_DIR, { recursive: true, force: true });
run([require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.test.json']);

const sources = globSync('tests/**/*.test.ts');
const compiled = globSync(`${OUT_DIR}/tests/**/*.test.js`);

if (sources.length === 0 || compiled.length !== sources.length) {
  console.error(
    `Expected ${sources.length} compiled test file(s) in ${OUT_DIR}/tests, found ${compiled.length}. ` +
      'Check "include"/"exclude" in tsconfig.test.json.',
  );
  process.exit(1);
}

// One test file at a time keeps peak memory low (see metro.config.js).
run(['--enable-source-maps', '--test', '--test-concurrency=1', ...compiled]);
