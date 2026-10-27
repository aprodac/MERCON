#!/usr/bin/env node
/**
 * Runs every `test:*` npm script of the API, one after another, and fails if
 * any fails — so CI picks up new test scripts without a list to keep in sync.
 *
 * Scripts that need a seeded database are skipped (CI has none); run them
 * locally against a database with `npm run test:<name>`.
 */
const { spawnSync } = require('child_process');
const pkg = require('../package.json');

const NEEDS_DATABASE = new Set(['test:quotation-number', 'test:expense-ledger', 'test:repeat-trips-db']);

const scripts = Object.keys(pkg.scripts).filter((k) => k.startsWith('test:') && k !== 'test:unit' && !NEEDS_DATABASE.has(k));
const failed = [];
for (const name of scripts) {
  process.stdout.write(`\n▶ ${name}\n`);
  const r = spawnSync('npm', ['run', '-s', name], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) failed.push(name);
}
console.log(`\n${scripts.length - failed.length}/${scripts.length} test scripts passed (skipped, need a database: ${[...NEEDS_DATABASE].join(', ')})`);
if (failed.length) {
  console.error(`Failed: ${failed.join(', ')}`);
  process.exit(1);
}
