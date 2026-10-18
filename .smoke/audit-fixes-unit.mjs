/* Builds audit-fixes-unit.ts with the app's esbuild and runs it in node. */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const esbuild = path.join(here, '../app/node_modules/esbuild/bin/esbuild');
const out = path.join(here, '.audit-fixes-unit.bundle.mjs');
execFileSync(process.execPath, [
  esbuild,
  path.join(here, 'audit-fixes-unit.ts'),
  '--bundle',
  '--platform=node',
  '--format=esm',
  '--log-level=warning',
  '--loader:.json=json',
  `--outfile=${out}`,
], { stdio: 'inherit' });
await import(`file://${out.replace(/\\/g, '/')}`);
