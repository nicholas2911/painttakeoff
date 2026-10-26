/* Scale-note reader (app/src/pdf/scaleNotes.ts): which written scale the
 * app offers for a sheet. Run: node scale-notes-unit.mjs */
import { scaleFromLines, paperOf } from '../app/src/pdf/scaleNotes';

const errors: string[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) errors.push(name);
};
const line = (str: string, y = 100) => ({ str, x: 50, y, w: str.length * 5, h: 8 });
const A1 = [2384, 1684] as const;
const A3 = [1191, 842] as const;
const ARCH_D = [2592, 1728] as const;
const pick = (strs: string[], [w, h]: readonly [number, number] = ARCH_D) =>
  scaleFromLines(strs.map((s, i) => line(s, 100 + i * 40)), w, h);

check('1/4" = 1\'-0" → 1:48', pick(['FLOOR PLAN', `SCALE: 1/4" = 1'-0"`])?.ratio === 48);
check('3/16" = 1\'-0" → 1:64', pick([`3/16" = 1'-0"`])?.ratio === 64);
check('1/8"=1\' (no inches part) → 1:96', pick([`1/8"=1'`])?.ratio === 96);
check('curly quotes 1/4” = 1’-0” → 1:48', pick(['1/4” = 1’-0”'])?.ratio === 48);
check('detail scale 1-1/2" ignored, plan scale wins', pick([`1/8" = 1'-0"`, `1/8" = 1'-0"`, `1 1/2" = 1'-0"`])?.ratio === 96);
check('only a detail scale → nothing offered', pick([`3" = 1'-0"`]) === null);
check('most common plan scale wins', pick([`1/4" = 1'-0"`, `1/8" = 1'-0"`, `1/4" = 1'-0"`])?.ratio === 48);
check('SCALE 1:100 → 1:100', pick(['SCALE 1:100'], A1)?.ratio === 100);
check('1:50 → 1:50', pick(['GROUND FLOOR PLAN 1:50'], A3)?.ratio === 50);
const a1onA3 = pick(['Scale 1:100 @ A1'], A3);
check('1:100 @ A1 on an A3 PDF → really 1:200', a1onA3?.ratio === 200 && a1onA3?.paper?.noted === 'A1' && a1onA3?.paper?.actual === 'A3', JSON.stringify(a1onA3));
check('1:50 @ A3 on an A3 PDF → 1:50, no correction', (() => { const r = pick(['1:50 @ A3'], A3); return r?.ratio === 50 && !r.paper; })());
check('1:100 @ A1 on an unknown paper size → 1:100 as written', pick(['1:100 @ A1'], [2000, 1400])?.ratio === 100);
check('"AT A1" counts like "@ A1"', pick(['1:100 AT A1'], A3)?.ratio === 200);
check('note naming THIS paper beats repeated per-drawing labels', pick(['Scale 1:100', 'Scale 1:100', 'Scale 1:100', 'GROUND FLOOR PLAN - 1:200@A3'], A3)?.ratio === 200);
check('no scale note → nothing', pick(['FLOOR PLAN', 'NOT TO SCALE']) === null);
check('ratios like 1:2 (slopes) ignored', pick(['SLOPE 1:2']) === null);
check('paperOf: A3 landscape', paperOf(1191, 842) === 'A3');
check('paperOf: A1 portrait', paperOf(1684, 2384) === 'A1');
check('paperOf: ARCH D', paperOf(2592, 1728) === 'ARCH D');
check('paperOf: odd size → null', paperOf(1000, 1000) === null);

console.log('errors:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
