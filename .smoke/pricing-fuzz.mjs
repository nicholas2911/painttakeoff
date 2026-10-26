/* Randomized pricing-math checks (see pricing-fuzz.ts). */
import { runTs } from './ts-run.mjs';

await runTs('pricing-fuzz.ts');
