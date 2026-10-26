/* Builds audit-fixes-unit.ts with the app's esbuild and runs it in node. */
import { runTs } from './ts-run.mjs';

await runTs('audit-fixes-unit.ts');
