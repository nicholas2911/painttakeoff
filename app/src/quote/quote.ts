import type { Measurement, OpeningMeasurement } from '../measure/measureStore';
import type { PriceBook } from './priceBook';

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
  for (const m of items) {
    if (m.kind === 'length' && (m.purpose ?? 'wall') === 'wall') {
      wallsGrossM2 += m.totalMeters * (m.wallHeightM ?? defaultHeightM);
    } else if (m.kind === 'length' && m.purpose === 'trim') {
      trimM += m.totalMeters;
    } else if (m.kind === 'ceiling') {
      ceilingM2 += m.areaM2;
    } else if (m.kind === 'area') {
      wallsGrossM2 += m.perimeterM * m.wallHeightM;
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
    pricePerFloorSF: number | null;
    floorAssumption: string;
    labourShare: number | null;
    gallons: number;
  };
  warnings: string[];
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
  const gallons = (materialSF / pb.coverage[pb.coverageChoice]) * (1 + waste);
  // Application hours: first coat full rate, later coats at the time factor.
  const appHours = (netSF / productionPerHr) * (1 + (coats - 1) * pb.secondCoatFactor);
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

  const walls = paintMath(netWallSF, pb.production[pb.wallMethod], pb, pb.wallMethod === 'spray');
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
  // Floor area: measured rooms if any, else the wall÷3 assumption (spec).
  const floorSF = floorSFMeasured > 0 ? floorSFMeasured : netWallSF / 3;
  const pricePerFloorSF = floorSF > 0 ? totalPrice / floorSF : null;
  const labourShare = totalPrice > 0 ? totalLabourCost / totalPrice : null;

  const warnings: string[] = [];
  if (pricePerFloorSF !== null && (pricePerFloorSF < 2 || pricePerFloorSF > 6)) {
    warnings.push(
      `This works out to $${pricePerFloorSF.toFixed(2)} per sq ft of floor area — the usual Ontario band is $2–6. Check the scale and ceiling heights on this one.`,
    );
  }
  if (labourShare !== null && (labourShare < 0.5 || labourShare > 0.9)) {
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
      pricePerFloorSF,
      floorAssumption:
        floorSFMeasured > 0
          ? 'from your measured room floor areas'
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
  const walls = paintMathLinear(netWallSF, pb.production[pb.wallMethod], pb, pb.wallMethod === 'spray');
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
        netWallM2 = gross - openings;
      } else if (m.kind === 'area') {
        const gross = m.perimeterM * m.wallHeightM;
        const openings = pg.deduct
          ? pg.items
              .filter((o): o is OpeningMeasurement => o.kind === 'opening' && o.assignedTo === m.id)
              .reduce((s, o) => s + o.sfM2, 0)
          : 0;
        netWallM2 = gross - openings;
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
