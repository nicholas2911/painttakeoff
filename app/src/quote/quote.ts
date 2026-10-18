import type { Measurement, OpeningMeasurement } from '../measure/measureStore';
import type { PriceBook } from './priceBook';

const OVERRIDES_PREFIX = 'pt:v1:quoteoverrides:';
const ADDONS_PREFIX = 'pt:v1:addons:';

/** Per-project override of select Price Book fields — "just this quote",
 *  never written back to the saved (global) Price Book. */
export function loadQuoteOverrides(projectId: string): Partial<PriceBook> {
  try {
    const raw = localStorage.getItem(`${OVERRIDES_PREFIX}${projectId}`);
    if (raw) return JSON.parse(raw) as Partial<PriceBook>;
  } catch {
    /* fall through to no overrides */
  }
  return {};
}

export function saveQuoteOverrides(projectId: string, overrides: Partial<PriceBook>): void {
  try {
    localStorage.setItem(`${OVERRIDES_PREFIX}${projectId}`, JSON.stringify(overrides));
  } catch {
    /* non-fatal */
  }
}

/**
 * Quote engine — implements ESTIMATING-SPEC.md's Core quantity model.
 * Quantities are stored in meters/m² internally; the rate tables are
 * imperial (SF/LF/gal), so conversion happens here at the boundary.
 */

const SQFT_PER_M2 = 10.7639;
const FT_PER_M = 3.28084;

export interface PageTotals {
  wallsGrossM2: number;
  openingsM2: number;
  netWallM2: number;
  trimM: number;
  ceilingM2: number;
  floorM2: number;
  /** Gross wall area of Quick Area rooms only (the walls that come with a
   *  measured floor). */
  roomWallsGrossM2: number;
}

/** Aggregate one page's measurements into quote quantities. */
export function pageTotals(
  items: Measurement[],
  defaultHeightM: number,
  deduct: boolean,
): PageTotals {
  let wallsGrossM2 = 0;
  let trimM = 0;
  let ceilingM2 = 0;
  let floorM2 = 0;
  let roomWallsGrossM2 = 0;
  for (const m of items) {
    if (m.kind === 'length' && (m.purpose ?? 'wall') === 'wall') {
      wallsGrossM2 += m.totalMeters * (m.wallHeightM ?? defaultHeightM);
    } else if (m.kind === 'length' && m.purpose === 'trim') {
      trimM += m.totalMeters;
    } else if (m.kind === 'ceiling') {
      ceilingM2 += m.areaM2;
    } else if (m.kind === 'area') {
      wallsGrossM2 += m.perimeterM * m.wallHeightM;
      roomWallsGrossM2 += m.perimeterM * m.wallHeightM;
      floorM2 += m.floorAreaM2;
    }
  }
  const openingsM2 = items
    .filter((m): m is OpeningMeasurement => m.kind === 'opening')
    .reduce((s, m) => s + m.sfM2, 0);
  return {
    wallsGrossM2,
    openingsM2,
    netWallM2: deduct ? Math.max(0, wallsGrossM2 - openingsM2) : wallsGrossM2,
    trimM,
    ceilingM2,
    floorM2,
    roomWallsGrossM2,
  };
}

export interface QuoteCategory {
  /** Net area being painted (SF), or LF for trim. */
  qty: number;
  gallons: number;
  hours: number;
  labourCost: number;
  materialCost: number;
  cost: number;
  price: number;
}

export interface Quote {
  walls: QuoteCategory;
  ceilings: QuoteCategory;
  trim: QuoteCategory;
  totalGallons: number;
  totalHours: number;
  totalLabourCost: number;
  totalMaterialCost: number;
  heavyPrepCost: number;
  totalCost: number;
  totalPrice: number;
  netWallSF: number;
  floorSFMeasured: number;
  cross: {
    pricePerWallSF: number | null;
    /** Price per SF of wall, per coat — null in Simple $/SF wall mode,
     *  where there's no discrete per-coat cost to isolate. */
    pricePerWallSFPerCoat: number | null;
    pricePerFloorSF: number | null;
    floorAssumption: string;
    labourShare: number | null;
    gallons: number;
  };
  warnings: string[];
}

/** Walls only: detailed labour+material buildup, or a flat all-in $/SF. */
function wallMathLinear(netSF: number, pb: PriceBook): QuoteCategory {
  if (netSF === 0) {
    return { qty: 0, gallons: 0, hours: 0, labourCost: 0, materialCost: 0, cost: 0, price: 0 };
  }
  if (pb.wallPricingMode === 'simple') {
    const price = netSF * pb.simpleWallRate;
    return { qty: netSF, gallons: 0, hours: 0, labourCost: 0, materialCost: 0, cost: price, price };
  }
  return paintMathLinear(netSF, pb.production[pb.wallMethod], pb, pb.wallMethod === 'spray');
}

function paintMath(
  netSF: number,
  productionPerHr: number,
  pb: PriceBook,
  sprayed: boolean,
): QuoteCategory {
  if (netSF <= 0) {
    return { qty: 0, gallons: 0, hours: 0, labourCost: 0, materialCost: 0, cost: 0, price: 0 };
  }
  return paintMathLinear(netSF, productionPerHr, pb, sprayed);
}

/** Same math as paintMath but linear through zero — used by grouped
 *  breakdowns where a group can hold a negative deduction bucket and the
 *  group prices must still sum exactly to the grand total. */
function paintMathLinear(
  netSF: number,
  productionPerHr: number,
  pb: PriceBook,
  sprayed: boolean,
): QuoteCategory {
  if (netSF === 0) {
    return { qty: 0, gallons: 0, hours: 0, labourCost: 0, materialCost: 0, cost: 0, price: 0 };
  }
  const coats = Math.max(1, Math.round(pb.coats));
  const materialSF = netSF * coats;
  const waste = sprayed ? pb.wasteSprayed : pb.wasteRolled;
  // A 0 coverage or production rate (typed into the Price Book) would divide
  // by zero and print $∞ — treat it as "not priced" instead.
  const coverage = pb.coverage[pb.coverageChoice];
  const gallons = coverage > 0 ? (materialSF / coverage) * (1 + waste) : 0;
  // Application hours: first coat full rate, later coats at the time factor.
  const appHours = productionPerHr > 0 ? (netSF / productionPerHr) * (1 + (coats - 1) * pb.secondCoatFactor) : 0;
  let hours = appHours * (1 + pb.prepShare);
  if (pb.highCeiling) hours *= 1 + pb.highCeilingAdder;
  const labourCost = hours * pb.labourRate;
  const materialCost = gallons * pb.paintPrice[pb.paintGrade];
  const cost = labourCost + materialCost;
  return {
    qty: netSF,
    gallons,
    hours,
    labourCost,
    materialCost,
    cost,
    price: cost * (1 + pb.margin),
  };
}

export function computeQuote(
  totals: PageTotals,
  pb: PriceBook,
): Quote {
  const netWallSF = totals.netWallM2 * SQFT_PER_M2;
  const ceilingSF = totals.ceilingM2 * SQFT_PER_M2;
  const trimLF = totals.trimM * FT_PER_M;
  const floorSFMeasured = totals.floorM2 * SQFT_PER_M2;

  const walls = wallMathLinear(netWallSF, pb);
  const ceilings = paintMath(ceilingSF, pb.production.rollOnly, pb, false);
  const trimCost = trimLF * pb.trimRate;
  const trim: QuoteCategory = {
    qty: trimLF,
    gallons: 0,
    hours: 0,
    labourCost: trimCost, // trim rate is bundled labour+material
    materialCost: 0,
    cost: trimCost,
    price: trimCost * (1 + pb.margin),
  };

  const heavyPrepCost = pb.heavyPrep ? netWallSF * pb.heavyPrepAdder : 0;
  const totalCost = walls.cost + ceilings.cost + trim.cost + heavyPrepCost;
  const totalPrice = walls.price + ceilings.price + trim.price + heavyPrepCost * (1 + pb.margin);
  const totalLabourCost = walls.labourCost + ceilings.labourCost + trim.labourCost;
  const totalMaterialCost = walls.materialCost + ceilings.materialCost;

  const pricePerWallSF = netWallSF > 0 ? totalPrice / netWallSF : null;
  const coats = Math.max(1, Math.round(pb.coats));
  // Wall-only price per coat — a standard painter sanity check, distinct
  // from pricePerWallSF above (which blends in ceilings/trim/heavy prep).
  // Not meaningful in Simple $/SF mode: that rate has no discrete coat cost.
  const pricePerWallSFPerCoat =
    pb.wallPricingMode === 'detailed' && netWallSF > 0 ? walls.price / (netWallSF * coats) : null;
  // Floor area: measured rooms if they cover (nearly) all the walls, else
  // the wall÷3 assumption (spec). With only SOME rooms drawn as areas, the
  // whole price over a partial floor inflated $/floor SF and raised a false
  // warning.
  const roomsCoverWalls = totals.wallsGrossM2 > 0 && totals.roomWallsGrossM2 >= 0.9 * totals.wallsGrossM2;
  const useMeasuredFloor = floorSFMeasured > 0 && roomsCoverWalls;
  const floorSF = useMeasuredFloor ? floorSFMeasured : netWallSF / 3;
  const pricePerFloorSF = floorSF > 0 ? totalPrice / floorSF : null;
  const labourShare = totalPrice > 0 ? totalLabourCost / totalPrice : null;

  const warnings: string[] = [];
  if (pricePerFloorSF !== null && (pricePerFloorSF < 2 || pricePerFloorSF > 6)) {
    warnings.push(
      `This works out to $${pricePerFloorSF.toFixed(2)} per sq ft of floor area — the usual Ontario band is $2–6. Check the scale and ceiling heights on this one.`,
    );
  }
  // Labour share isn't a meaningful signal when walls are priced as a flat
  // $/SF rate with no labour/material split to check.
  if (pb.wallPricingMode === 'detailed' && labourShare !== null && (labourShare < 0.5 || labourShare > 0.9)) {
    warnings.push(
      `Labour is ${(labourShare * 100).toFixed(0)}% of the price — normally 70–80%. Check the paint grade and labour rate in the Price Book.`,
    );
  }

  return {
    walls,
    ceilings,
    trim,
    totalGallons: walls.gallons + ceilings.gallons,
    totalHours: walls.hours + ceilings.hours,
    totalLabourCost,
    totalMaterialCost,
    heavyPrepCost,
    totalCost,
    totalPrice,
    netWallSF,
    floorSFMeasured,
    cross: {
      pricePerWallSF,
      pricePerWallSFPerCoat,
      pricePerFloorSF,
      floorAssumption: useMeasuredFloor
        ? 'from your measured room floor areas'
        : floorSFMeasured > 0
          ? 'estimated as wall area ÷ 3 (only some rooms measured)'
          : 'estimated as wall area ÷ 3 (no rooms measured)',
      labourShare,
      gallons: walls.gallons + ceilings.gallons,
    },
    warnings,
  };
}

export const fmtMoney = (x: number): string =>
  `${x < 0 ? '−' : ''}$${Math.abs(x).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---------- grouped breakdowns (per room / per page) ----------

export type QuoteGrouping = 'project' | 'room' | 'page';

export interface QuotePageInput {
  pageNum: number;
  items: Measurement[];
  defaultHeightM: number;
  deduct: boolean;
}

export interface QuoteGroup {
  id: string;
  /** Measurement label ("North wall"), "Page 5", or "Whole project". */
  title: string;
  /** Extra context, e.g. which page a room sits on. */
  detail?: string;
  walls: QuoteCategory;
  ceilings: QuoteCategory;
  trim: QuoteCategory;
  heavyPrepCost: number;
  totalCost: number;
  totalPrice: number;
}

/** Price a bundle of quantities. Linear in every input, so any exact
 *  partition of the project's quantities prices to exactly the grand total. */
function priceQuantities(
  netWallM2: number,
  ceilingM2: number,
  trimM: number,
  pb: PriceBook,
): Omit<QuoteGroup, 'id' | 'title' | 'detail'> {
  const netWallSF = netWallM2 * SQFT_PER_M2;
  const walls = wallMathLinear(netWallSF, pb);
  const ceilings = paintMathLinear(ceilingM2 * SQFT_PER_M2, pb.production.rollOnly, pb, false);
  const trimCost = trimM * FT_PER_M * pb.trimRate;
  const trim: QuoteCategory = {
    qty: trimM * FT_PER_M,
    gallons: 0,
    hours: 0,
    labourCost: trimCost,
    materialCost: 0,
    cost: trimCost,
    price: trimCost * (1 + pb.margin),
  };
  const heavyPrepCost = pb.heavyPrep ? netWallSF * pb.heavyPrepAdder : 0;
  return {
    walls,
    ceilings,
    trim,
    heavyPrepCost,
    totalCost: walls.cost + ceilings.cost + trim.cost + heavyPrepCost,
    totalPrice: walls.price + ceilings.price + trim.price + heavyPrepCost * (1 + pb.margin),
  };
}

const EPS = 1e-9;

/**
 * Break the quote into groups: one per page (sheet), or one per named
 * measurement/room. Openings stay where they were assigned — room-assigned
 * openings deduct inside that room's group; page-level openings land in the
 * page's group (per-page mode) or in a "not tied to a room" leftover group
 * (per-room mode), so group subtotals always sum exactly to the grand total.
 */
export function computeGroups(
  pages: QuotePageInput[],
  pb: PriceBook,
  grouping: QuoteGrouping,
  labelOfPage?: (pageNum: number) => string,
): QuoteGroup[] {
  const pageName = (n: number) => labelOfPage?.(n) ?? `Page ${n}`;
  if (grouping === 'project') {
    const t = pages.reduce(
      (acc, pg) => {
        const pt = pageTotals(pg.items, pg.defaultHeightM, pg.deduct);
        return {
          netWallM2: acc.netWallM2 + pt.netWallM2,
          ceilingM2: acc.ceilingM2 + pt.ceilingM2,
          trimM: acc.trimM + pt.trimM,
        };
      },
      { netWallM2: 0, ceilingM2: 0, trimM: 0 },
    );
    return [{ id: 'all', title: 'Whole project', ...priceQuantities(t.netWallM2, t.ceilingM2, t.trimM, pb) }];
  }

  const groups: QuoteGroup[] = [];
  for (const pg of pages) {
    if (grouping === 'page') {
      const t = pageTotals(pg.items, pg.defaultHeightM, pg.deduct);
      groups.push({
        id: `page-${pg.pageNum}`,
        title: pageName(pg.pageNum),
        ...priceQuantities(t.netWallM2, t.ceilingM2, t.trimM, pb),
      });
      continue;
    }

    // per-room: one group per wall / room / ceiling / trim measurement.
    let accountedNetWallM2 = 0;
    for (const m of pg.items) {
      if (m.kind === 'opening') continue;
      let netWallM2 = 0;
      let ceilingM2 = 0;
      let trimM = 0;
      if (m.kind === 'length' && (m.purpose ?? 'wall') === 'wall') {
        const gross = m.totalMeters * (m.wallHeightM ?? pg.defaultHeightM);
        const openings = pg.deduct
          ? pg.items
              .filter((o): o is OpeningMeasurement => o.kind === 'opening' && o.assignedTo === m.id)
              .reduce((s, o) => s + o.sfM2, 0)
          : 0;
        // Clamp per room, same as the page-level total: a room whose own
        // assigned openings outweigh its own gross area reads 0, not a
        // confusing negative SF/price. The leftover bucket below absorbs
        // the difference, so the page still sums to the exact same total.
        netWallM2 = Math.max(0, gross - openings);
      } else if (m.kind === 'area') {
        const gross = m.perimeterM * m.wallHeightM;
        const openings = pg.deduct
          ? pg.items
              .filter((o): o is OpeningMeasurement => o.kind === 'opening' && o.assignedTo === m.id)
              .reduce((s, o) => s + o.sfM2, 0)
          : 0;
        netWallM2 = Math.max(0, gross - openings);
      } else if (m.kind === 'ceiling') {
        ceilingM2 = m.areaM2;
      } else if (m.kind === 'length' && m.purpose === 'trim') {
        trimM = m.totalMeters;
      }
      accountedNetWallM2 += netWallM2;
      groups.push({
        id: m.id,
        title: m.label,
        detail: pageName(pg.pageNum),
        ...priceQuantities(netWallM2, ceilingM2, trimM, pb),
      });
    }
    // Whatever the named rows don't cover — page-level (unassigned) openings,
    // and the page-level clamp — goes in a leftover group so the sum holds.
    const pageNet = pageTotals(pg.items, pg.defaultHeightM, pg.deduct).netWallM2;
    const leftover = pageNet - accountedNetWallM2;
    if (Math.abs(leftover) > EPS) {
      groups.push({
        id: `page-${pg.pageNum}-rest`,
        title: 'Not tied to a room',
        detail: `${pageName(pg.pageNum)} — unassigned deductions`,
        ...priceQuantities(leftover, 0, 0, pb),
      });
    }
  }
  return groups;
}

// ---------- manual add-ons ----------
// Price-book-rate line items the user drops onto a quote directly (not
// derived from any plan measurement) — e.g. extra trim a GC asked for,
// a heavy-prep allowance, or a flat dollar adjustment. Per-project, not
// part of the plan's measured quantities, so they're priced here and
// folded into totals at the display/export layer rather than inside
// computeQuote/computeGroups.

export type AddOnSource =
  | 'paintContractor'
  | 'paintMid'
  | 'paintPremium'
  | 'trim'
  | 'heavyPrep'
  | 'labourHours'
  | 'flat';

export const ADD_ON_SOURCES: [AddOnSource, string, string][] = [
  ['paintContractor', 'Paint — contractor grade', 'gal'],
  ['paintMid', 'Paint — mid grade', 'gal'],
  ['paintPremium', 'Paint — premium', 'gal'],
  ['trim', 'Trim', 'LF'],
  ['heavyPrep', 'Heavy prep', 'SF'],
  ['labourHours', 'Labour', 'hr'],
  ['flat', 'Flat dollar amount', '$'],
];

export interface ManualAddOn {
  id: string;
  label: string;
  source: AddOnSource;
  /** Meaning depends on source: gallons / LF / SF / hours, or dollars for 'flat'. */
  qty: number;
}

export interface AddOnPriced extends ManualAddOn {
  cost: number;
  price: number;
}

export function loadAddOns(projectId: string): ManualAddOn[] {
  try {
    const raw = localStorage.getItem(`${ADDONS_PREFIX}${projectId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as ManualAddOn[];
    }
  } catch {
    /* fall through to none */
  }
  return [];
}

export function saveAddOns(projectId: string, items: ManualAddOn[]): void {
  try {
    localStorage.setItem(`${ADDONS_PREFIX}${projectId}`, JSON.stringify(items));
  } catch {
    /* non-fatal */
  }
}

export function priceAddOn(a: ManualAddOn, pb: PriceBook): AddOnPriced {
  let cost = 0;
  switch (a.source) {
    case 'paintContractor':
      cost = a.qty * pb.paintPrice.contractor;
      break;
    case 'paintMid':
      cost = a.qty * pb.paintPrice.mid;
      break;
    case 'paintPremium':
      cost = a.qty * pb.paintPrice.premium;
      break;
    case 'trim':
      cost = a.qty * pb.trimRate;
      break;
    case 'heavyPrep':
      cost = a.qty * pb.heavyPrepAdder;
      break;
    case 'labourHours':
      cost = a.qty * pb.labourRate;
      break;
    case 'flat':
      cost = a.qty;
      break;
  }
  // A flat dollar line is the user dialing in the exact price impact —
  // don't mark it up again.
  const price = a.source === 'flat' ? cost : cost * (1 + pb.margin);
  return { ...a, cost, price };
}

export function priceAddOns(
  addOns: ManualAddOn[],
  pb: PriceBook,
): { items: AddOnPriced[]; cost: number; price: number } {
  const items = addOns.map((a) => priceAddOn(a, pb));
  return {
    items,
    cost: items.reduce((s, i) => s + i.cost, 0),
    price: items.reduce((s, i) => s + i.price, 0),
  };
}

const unitOf = (source: AddOnSource): string => ADD_ON_SOURCES.find(([s]) => s === source)?.[2] ?? '';

export function explainAddOns(items: AddOnPriced[]): string[] {
  return items.map((a) =>
    a.source === 'flat'
      ? `${a.label}: ${fmtMoney(a.qty)} flat add-on.`
      : `${a.label}: ${a.qty} ${unitOf(a.source)} × price book rate = ${fmtMoney(a.cost)} cost × margin = ${fmtMoney(a.price)}.`,
  );
}

// ---------- pricing narrative ----------
// Plain-English derivation of the price from the price book's own numbers —
// "show your work" for the quote, so a painter (or their client) can see
// exactly which rate produced which dollar.

const WALL_METHOD_LABEL: Record<PriceBook['wallMethod'], string> = {
  cutRoll: 'cut & roll',
  rollOnly: 'roll only',
  spray: 'spray',
  textured: 'textured',
};

export function explainQuote(q: Quote, pb: PriceBook): string[] {
  const lines: string[] = [];
  const coats = Math.max(1, Math.round(pb.coats));

  if (q.walls.qty > 0) {
    if (pb.wallPricingMode === 'simple') {
      lines.push(
        `Walls: ${Math.round(q.walls.qty).toLocaleString('en-CA')} SF net × $${pb.simpleWallRate.toFixed(2)}/SF (your all-in wall rate) = ${fmtMoney(q.walls.price)}.`,
      );
    } else {
      const waste = pb.wallMethod === 'spray' ? pb.wasteSprayed : pb.wasteRolled;
      lines.push(
        `Walls: ${Math.round(q.walls.qty).toLocaleString('en-CA')} SF net × ${coats} coat${coats > 1 ? 's' : ''} ÷ ${pb.coverage[pb.coverageChoice]} SF/gal (${pb.coverageChoice}) × ${(1 + waste).toFixed(2)} waste factor = ${q.walls.gallons.toFixed(1)} gal of ${pb.paintGrade} paint @ $${pb.paintPrice[pb.paintGrade]}/gal = ${fmtMoney(q.walls.materialCost)} in materials.`,
      );
      lines.push(
        `At ${pb.production[pb.wallMethod]} SF/hr (${WALL_METHOD_LABEL[pb.wallMethod]})${pb.highCeiling ? `, +${(pb.highCeilingAdder * 100).toFixed(0)}% for the high-ceiling adder,` : ''} and a ${(pb.prepShare * 100).toFixed(0)}% prep share, that's ${q.walls.hours.toFixed(1)} labour hours @ $${pb.labourRate}/hr = ${fmtMoney(q.walls.labourCost)}.`,
      );
      lines.push(
        `Walls cost ${fmtMoney(q.walls.cost)} × ${(1 + pb.margin).toFixed(2)} margin = ${fmtMoney(q.walls.price)}.`,
      );
    }
  }

  if (q.ceilings.qty > 0) {
    lines.push(
      `Ceilings: ${Math.round(q.ceilings.qty).toLocaleString('en-CA')} SF × ${coats} coats ÷ ${pb.coverage[pb.coverageChoice]} SF/gal × ${(1 + pb.wasteRolled).toFixed(2)} waste factor = ${q.ceilings.gallons.toFixed(1)} gal; ${q.ceilings.hours.toFixed(1)} hr @ $${pb.labourRate}/hr. Cost ${fmtMoney(q.ceilings.cost)} × ${(1 + pb.margin).toFixed(2)} margin = ${fmtMoney(q.ceilings.price)}.`,
    );
  }

  if (q.trim.qty > 0) {
    lines.push(
      `Trim: ${Math.round(q.trim.qty).toLocaleString('en-CA')} LF × $${pb.trimRate}/LF = ${fmtMoney(q.trim.cost)} × ${(1 + pb.margin).toFixed(2)} margin = ${fmtMoney(q.trim.price)}.`,
    );
  }

  if (q.heavyPrepCost > 0) {
    lines.push(
      `Heavy prep: ${Math.round(q.netWallSF).toLocaleString('en-CA')} SF × $${pb.heavyPrepAdder}/SF adder = ${fmtMoney(q.heavyPrepCost)} × ${(1 + pb.margin).toFixed(2)} margin = ${fmtMoney(q.heavyPrepCost * (1 + pb.margin))}.`,
    );
  }

  return lines;
}
