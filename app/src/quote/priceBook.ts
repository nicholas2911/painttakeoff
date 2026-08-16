/**
 * Price Book — the quoting rates, all user-editable, persisted to
 * localStorage (pt:v1:pricebook). Defaults are the Ontario research values
 * from ESTIMATING-SPEC.md. Money is CAD; production/coverage are per SF.
 */

export interface PriceBook {
  /** Loaded labour rate, $/hr. */
  labourRate: number;
  /** Production rates, SF/hr. */
  production: {
    cutRoll: number;
    rollOnly: number;
    spray: number;
    textured: number;
  };
  /** Which production method walls use. */
  wallMethod: 'cutRoll' | 'rollOnly' | 'spray' | 'textured';
  /** Second+ coats take this fraction of first-coat time. */
  secondCoatFactor: number;
  /** Prep share of application hours. */
  prepShare: number;
  /** Coverage, SF/gal. */
  coverage: { smooth: number; textured: number; primer: number };
  coverageChoice: 'smooth' | 'textured' | 'primer';
  /** Paint price per gallon by grade, CAD. */
  paintPrice: { contractor: number; mid: number; premium: number };
  paintGrade: 'contractor' | 'mid' | 'premium';
  coats: number;
  wasteRolled: number;
  wasteSprayed: number;
  /** Optional adders. */
  heavyPrep: boolean;
  heavyPrepAdder: number; // $/SF
  highCeiling: boolean;
  highCeilingAdder: number; // +labour fraction
  /** Trim $ per LF. */
  trimRate: number;
  /** Margin applied on top of cost. */
  margin: number;
}

export const ONTARIO_DEFAULTS: PriceBook = {
  labourRate: 55,
  production: { cutRoll: 200, rollOnly: 350, spray: 900, textured: 110 },
  wallMethod: 'cutRoll',
  secondCoatFactor: 0.7,
  prepShare: 0.3,
  coverage: { smooth: 375, textured: 275, primer: 325 },
  coverageChoice: 'smooth',
  paintPrice: { contractor: 32, mid: 60, premium: 100 },
  paintGrade: 'contractor',
  coats: 2,
  wasteRolled: 0.1,
  wasteSprayed: 0.2,
  heavyPrep: false,
  heavyPrepAdder: 1.5,
  highCeiling: false,
  highCeilingAdder: 0.3,
  trimRate: 2.5,
  margin: 0.3,
};

const KEY = 'pt:v1:pricebook';

export function loadPriceBook(): PriceBook {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PriceBook>;
      return {
        ...ONTARIO_DEFAULTS,
        ...parsed,
        production: { ...ONTARIO_DEFAULTS.production, ...parsed.production },
        coverage: { ...ONTARIO_DEFAULTS.coverage, ...parsed.coverage },
        paintPrice: { ...ONTARIO_DEFAULTS.paintPrice, ...parsed.paintPrice },
      };
    }
  } catch {
    /* fall through to defaults */
  }
  return structuredClone(ONTARIO_DEFAULTS);
}

export function savePriceBook(book: PriceBook): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(book));
  } catch {
    /* non-fatal */
  }
}
