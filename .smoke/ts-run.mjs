/* Bundle a .ts test file that imports app/src modules (with the app's own
 * esbuild) and run it in node. Usage: node ts-run.mjs <file.ts> */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export async function runTs(tsFile) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const esbuild = path.join(here, '../app/node_modules/esbuild/bin/esbuild');
  const out = path.join(here, `.${path.basename(tsFile, '.ts')}.bundle.mjs`);
  execFileSync(process.execPath, [
    esbuild,
    path.resolve(here, tsFile),
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--log-level=warning',
    '--loader:.json=json',
    `--outfile=${out}`,
  ], { stdio: 'inherit' });
  await import(`file://${out.replace(/\\/g, '/')}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await runTs(process.argv[2]);
}
