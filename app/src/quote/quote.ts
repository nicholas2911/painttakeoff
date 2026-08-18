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
  `$${x.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
