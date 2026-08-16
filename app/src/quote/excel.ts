import * as XLSX from 'xlsx';
import type { Measurement, OpeningMeasurement } from '../measure/measureStore';
import type { PriceBook } from './priceBook';
import type { Quote } from './quote';
import { pageTotals, fmtMoney } from './quote';

const SQFT_PER_M2 = 10.7639;
const FT_PER_M = 3.28084;

interface PageInput {
  pageNum: number;
  items: Measurement[];
  defaultHeightM: number;
  deduct: boolean;
}

function measurementRows(pages: PageInput[]): (string | number)[][] {
  const rows: (string | number)[][] = [
    ['PaintTakeoff quote — measurements'],
    [],
    ['Page', 'Label', 'Kind', 'Length LF', 'Height ft', 'Gross SF', 'Deductions SF', 'Net SF', 'Ceiling SF', 'Trim LF'],
  ];
  for (const page of pages) {
    for (const m of page.items) {
      if (m.kind === 'length') {
        const purpose = m.purpose ?? 'wall';
        const heightM = m.wallHeightM ?? page.defaultHeightM;
        const gross = m.totalMeters * heightM * SQFT_PER_M2;
        const openings = page.items
          .filter((o): o is OpeningMeasurement => o.kind === 'opening' && o.assignedTo === m.id)
          .reduce((s, o) => s + o.sfM2, 0);
        const deductM2 = page.deduct ? openings : 0;
        rows.push([
          page.pageNum,
          m.label,
          purpose,
          purpose === 'wall' || purpose === 'trim' ? +(m.totalMeters * FT_PER_M).toFixed(1) : '',
          purpose === 'wall' ? +(heightM * FT_PER_M).toFixed(1) : '',
          purpose === 'wall' ? +gross.toFixed(1) : '',
          purpose === 'wall' ? +(deductM2 * SQFT_PER_M2).toFixed(1) : '',
          purpose === 'wall' ? +((gross - deductM2 * SQFT_PER_M2)).toFixed(1) : '',
          '',
          purpose === 'trim' ? +(m.totalMeters * FT_PER_M).toFixed(1) : '',
        ]);
      } else if (m.kind === 'ceiling') {
        rows.push([page.pageNum, m.label, 'ceiling', '', '', '', '', '', +(m.areaM2 * SQFT_PER_M2).toFixed(1), '']);
      } else if (m.kind === 'area') {
        const gross = m.perimeterM * m.wallHeightM * SQFT_PER_M2;
        const openings = page.items
          .filter((o): o is OpeningMeasurement => o.kind === 'opening' && o.assignedTo === m.id)
          .reduce((s, o) => s + o.sfM2, 0);
        const deductM2 = page.deduct ? openings : 0;
        rows.push([
          page.pageNum,
          m.label,
          'room (quick area)',
          '',
          +(m.wallHeightM * FT_PER_M).toFixed(1),
          +gross.toFixed(1),
          +(deductM2 * SQFT_PER_M2).toFixed(1),
          +(gross - deductM2 * SQFT_PER_M2).toFixed(1),
          '',
          '',
        ]);
      } else if (m.kind === 'opening') {
        rows.push([
          page.pageNum,
          m.label,
          `opening (${m.openType})`,
          '',
          '',
          '',
          +(m.sfM2 * SQFT_PER_M2).toFixed(1),
          '',
          '',
          '',
        ]);
      }
    }
    const t = pageTotals(page.items, page.defaultHeightM, page.deduct);
    rows.push([
      page.pageNum,
      `PAGE ${page.pageNum} TOTAL`,
      '',
      '',
      '',
      +(t.wallsGrossM2 * SQFT_PER_M2).toFixed(1),
      +((page.deduct ? t.openingsM2 : 0) * SQFT_PER_M2).toFixed(1),
      +(t.netWallM2 * SQFT_PER_M2).toFixed(1),
      +(t.ceilingM2 * SQFT_PER_M2).toFixed(1),
      +(t.trimM * FT_PER_M).toFixed(1),
    ]);
    rows.push([]);
  }
  return rows;
}

function quoteRows(quote: Quote, pb: PriceBook): (string | number)[][] {
  const cat = (name: string, unit: string, c: Quote['walls']) => [
    [name, +c.qty.toFixed(1), unit, `${c.hours.toFixed(2)} hr`, `${c.gallons.toFixed(2)} gal`, fmtMoney(c.cost), fmtMoney(c.price)],
  ];
  return [
    ['PaintTakeoff quote'],
    [],
    ['Line item', 'Qty', 'Unit', 'Labour hours', 'Gallons', 'Cost', 'Price'],
    ...cat('Walls (net)', 'SF', quote.walls),
    ...cat('Ceilings', 'SF', quote.ceilings),
    ...cat('Trim', 'LF', quote.trim),
    ...(quote.heavyPrepCost > 0
      ? [['Heavy prep adder', '', '', '', '', fmtMoney(quote.heavyPrepCost), fmtMoney(quote.heavyPrepCost * (1 + pb.margin))]]
      : []),
    [],
    ['TOTAL', '', '', `${quote.totalHours.toFixed(2)} hr`, `${quote.totalGallons.toFixed(2)} gal`, fmtMoney(quote.totalCost), fmtMoney(quote.totalPrice)],
    [],
    ['Cross-metrics'],
    ['Price per SF wall', quote.cross.pricePerWallSF !== null ? fmtMoney(quote.cross.pricePerWallSF) : '—'],
    ['Price per SF floor', quote.cross.pricePerFloorSF !== null ? fmtMoney(quote.cross.pricePerFloorSF) : '—', quote.cross.floorAssumption],
    ['Labour share', quote.cross.labourShare !== null ? `${(quote.cross.labourShare * 100).toFixed(0)}%` : '—'],
    ['Gallons total', `${quote.cross.gallons.toFixed(2)} gal`],
    ...(quote.warnings.length ? [[], ['WARNINGS'], ...quote.warnings.map((w) => [w])] : []),
    [],
    ['Price book snapshot'],
    ['Labour rate', `$${pb.labourRate}/hr`],
    ['Wall method', `${pb.wallMethod} (${pb.production[pb.wallMethod]} SF/hr)`],
    ['Coats', pb.coats],
    ['Second-coat factor', pb.secondCoatFactor],
    ['Prep share', pb.prepShare],
    ['Coverage', `${pb.coverageChoice} (${pb.coverage[pb.coverageChoice]} SF/gal)`],
    ['Paint grade', `${pb.paintGrade} ($${pb.paintPrice[pb.paintGrade]}/gal)`],
    ['Waste', pb.wallMethod === 'spray' ? pb.wasteSprayed : pb.wasteRolled],
    ['Trim rate', `$${pb.trimRate}/LF`],
    ['Margin', pb.margin],
    ['Heavy prep', pb.heavyPrep ? `$${pb.heavyPrepAdder}/SF` : 'off'],
    ['High ceiling', pb.highCeiling ? `+${pb.highCeilingAdder * 100}% labour` : 'off'],
  ];
}

/** Builds the workbook and triggers a browser download. */
export function exportQuoteXlsx(opts: {
  fileName: string;
  pages: PageInput[];
  quote: Quote;
  priceBook: PriceBook;
}): void {
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(measurementRows(opts.pages));
  ws1['!cols'] = [{ wch: 6 }, { wch: 22 }, { wch: 16 }, ...Array(7).fill({ wch: 12 })];
  XLSX.utils.book_append_sheet(wb, ws1, 'Measurements');
  const ws2 = XLSX.utils.aoa_to_sheet(quoteRows(opts.quote, opts.priceBook));
  ws2['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 34 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Quote');
  XLSX.writeFile(wb, opts.fileName);
}
