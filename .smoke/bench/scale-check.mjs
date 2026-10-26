/* Scale-note suggestions vs true page scale (see scale-check.ts). */
import { runTs } from '../ts-run.mjs';

await runTs('bench/scale-check.ts');
