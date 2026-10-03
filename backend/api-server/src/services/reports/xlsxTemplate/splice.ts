import { unzipSync, zipSync } from 'fflate';
import type { ReportFieldKey, TemplateLayout } from '@mercon/shared-types';
import { REPORT_FIELDS_BY_SOURCE } from '@mercon/shared-types';
import {
  ParsedCell,
  ParsedRow,
  colNumberToLetter,
  effectiveFormula,
  parseSharedFormulas,
  parseSheetDataRows,
  rewriteRowNumber,
  shiftRowRefs,
  shiftRowRefsAtOrAfter,
  xmlEscapeText,
} from './xmlRowSplice';

type SharedFormulaMap = Map<string, { row: number; text: string }>;

// Every source's fields; a key shared by two sources has the same type in both.
const FIELD_TYPE: Record<string, string> = Object.fromEntries(
  Object.values(REPORT_FIELDS_BY_SOURCE).flatMap((fields) => fields.map((f) => [f.key, f.type]))
);

/** One generated row: field key → value. */
export type ReportRow = Partial<Record<ReportFieldKey, unknown>>;

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

function toExcelSerial(value: unknown): number {
  const d = value instanceof Date ? value : new Date(String(value));
  return (d.getTime() - EXCEL_EPOCH_MS) / 86400000;
}

function cellStyleAttr(s: string | null): string {
  return s !== null ? ` s="${s}"` : '';
}

/**
 * Builds one `<c>` element for a generated data row, reusing the source band
 * cell's style index and column reference so fonts/fills/borders/number
 * formats carry over exactly — we never touch `styles.xml`, only pick which
 * `s="…"` index an existing style-defining cell already has.
 */
function buildCell(
  ref: string,
  sourceCell: ParsedCell,
  column: TemplateLayout['columns'][number] | undefined,
  record: ReportRow | null,
  rowDelta: number,
  sourceRow: number,
  shared: SharedFormulaMap
): string {
  const s = cellStyleAttr(sourceCell.s);
  const source = column?.source ?? { kind: 'blank' as const };

  if (source.kind === 'blank' || !record) {
    return `<c r="${ref}"${s}/>`;
  }

  if (source.kind === 'const') {
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEscapeText(source.value)}</t></is></c>`;
  }

  if (source.kind === 'formula') {
    // Resolved against the shared-formula master when this cell is a
    // follower, then emitted standalone — a cloned `<f t="shared" si="N"/>`
    // would otherwise carry no formula at all.
    const formula = effectiveFormula(sourceCell.xml, sourceRow, shared);
    if (!formula) return `<c r="${ref}"${s}/>`;
    return `<c r="${ref}"${s}><f>${shiftRowRefs(formula, rowDelta)}</f></c>`;
  }

  // source.kind === 'field'
  const fieldKey = source.key;
  const value = record[fieldKey];
  if (value === null || value === undefined || value === '') {
    return `<c r="${ref}"${s}/>`;
  }

  const fieldType = FIELD_TYPE[fieldKey];
  if (fieldType === 'number' || fieldType === 'money') {
    const num = Number(value);
    if (Number.isNaN(num)) return `<c r="${ref}"${s}/>`;
    return `<c r="${ref}"${s}><v>${num}</v></c>`;
  }
  if (fieldType === 'date') {
    const serial = toExcelSerial(value);
    if (Number.isNaN(serial)) return `<c r="${ref}"${s}/>`;
    return `<c r="${ref}"${s}><v>${serial}</v></c>`;
  }
  // string
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEscapeText(String(value))}</t></is></c>`;
}

function buildDataRow(
  rowNum: number,
  bandRow: ParsedRow,
  layout: TemplateLayout,
  record: ReportRow,
  bandRowNum: number,
  shared: SharedFormulaMap
): string {
  const columnsByIndex = new Map(layout.columns.map((c) => [c.colIndex, c]));
  const rowDelta = rowNum - bandRowNum;
  const cellsXml = bandRow.cells
    .map((cell) => {
      const ref = `${colNumberToLetter(cell.col)}${rowNum}`;
      return buildCell(ref, cell, columnsByIndex.get(cell.col), record, rowDelta, bandRowNum, shared);
    })
    .join('');
  return `<row r="${rowNum}" spans="${bandRow.cells[0]?.col ?? 1}:${bandRow.cells[bandRow.cells.length - 1]?.col ?? 1}">${cellsXml}</row>`;
}

/** Style signature used only to find where the sample band ends in the uploaded file. */
function rowStyleSignature(row: ParsedRow | undefined): string {
  if (!row) return '';
  return row.cells.map((c) => `${c.col}:${c.s ?? ''}`).join('|');
}

function resolveSheetPath(files: Record<string, Uint8Array>, sheetName: string): string {
  const decoder = new TextDecoder();
  const workbookXml = decoder.decode(files['xl/workbook.xml']);
  const sheetTagMatch = new RegExp(`<sheet\\b[^>]*name="${escapeRegExp(sheetName)}"[^>]*/>`).exec(workbookXml);
  if (!sheetTagMatch) throw new Error(`Sheet "${sheetName}" not found in workbook.xml`);
  const ridMatch = /r:id="([^"]+)"/.exec(sheetTagMatch[0]);
  if (!ridMatch) throw new Error(`Sheet "${sheetName}" has no relationship id`);

  const relsXml = decoder.decode(files['xl/_rels/workbook.xml.rels']);
  const relTagMatch = new RegExp(`<Relationship\\b[^>]*Id="${ridMatch[1]}"[^>]*/>`).exec(relsXml);
  if (!relTagMatch) throw new Error(`Relationship "${ridMatch[1]}" not found`);
  const targetMatch = /Target="([^"]+)"/.exec(relTagMatch[0]);
  if (!targetMatch) throw new Error('Relationship has no Target');

  const target = targetMatch[1];
  return target.startsWith('/') ? target.slice(1) : `xl/${target}`;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface GenerateOptions {
  tokens?: Record<string, string>;
}

/**
 * Regenerates the data rows of an uploaded template with real records while
 * leaving every other byte of the workbook untouched. Never round-trips
 * through a spreadsheet library — the ZIP is unpacked, exactly one
 * worksheet's `<sheetData>` is rewritten, and everything else (styles,
 * theme, drawings, charts, media) is re-zipped verbatim.
 */
export function generateFromTemplate(
  fileBuf: Buffer,
  layout: TemplateLayout,
  rows: ReportRow[],
  options: GenerateOptions = {}
): Buffer {
  const files = unzipSync(new Uint8Array(fileBuf));
  const sheetPath = resolveSheetPath(files, layout.sheetName);
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let sheetXml = decoder.decode(files[sheetPath]);

  const sheetDataMatch = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>|<sheetData\b[^>]*\/>/.exec(sheetXml);
  if (!sheetDataMatch) throw new Error(`Sheet "${layout.sheetName}" has no <sheetData>`);

  const sheetDataInner = sheetDataMatch[1] ?? '';
  const shared = parseSharedFormulas(sheetDataInner);
  const allRows = parseSheetDataRows(sheetDataInner);
  const beforeRows = allRows.filter((r) => r.r < layout.dataStartRow);
  const bandRows: ParsedRow[] = [];
  for (let i = 0; i < layout.bandSize; i++) {
    const found = allRows.find((r) => r.r === layout.dataStartRow + i);
    if (found) bandRows.push(found);
  }
  if (bandRows.length === 0) {
    throw new Error(`No band rows found at row ${layout.dataStartRow} in sheet "${layout.sheetName}"`);
  }

  // The whole sample data block is replaced. dataEndRow is authoritative
  // (confirmed by a human in the mapping editor); the style-signature scan is
  // only a fallback for a layout saved before dataEndRow existed. Without a
  // correct end row the customer's own sample rows survive underneath the
  // generated data in the finished report.
  let consumedThrough = layout.dataEndRow ?? 0;
  if (!consumedThrough || consumedThrough < layout.dataStartRow) {
    consumedThrough = layout.dataStartRow + bandRows.length - 1;
    for (const row of allRows) {
      if (row.r <= consumedThrough) continue;
      const expectedBandRow = bandRows[(row.r - layout.dataStartRow) % layout.bandSize];
      if (rowStyleSignature(row) === rowStyleSignature(expectedBandRow) && row.r === consumedThrough + 1) {
        consumedThrough = row.r;
      } else {
        break;
      }
    }
  }
  const afterRows = allRows.filter((r) => r.r > consumedThrough);

  const delta = rows.length - (consumedThrough - layout.dataStartRow + 1);

  const generatedRowsXml = rows
    .map((record, i) => {
      const bandRow = bandRows[i % bandRows.length];
      const newR = layout.dataStartRow + i;
      return buildDataRow(newR, bandRow, layout, record, bandRow.r, shared);
    })
    .join('');

  const shiftedAfterRowsXml = afterRows
    .map((row) => {
      const newR = row.r + delta;
      const shifted = rewriteRowNumber(row, newR);
      const cellsXml = shifted.cells
        .map((c, i) => {
          const original = row.cells[i];
          const formula = effectiveFormula(original.xml, row.r, shared);
          if (!formula) return c.xml;
          // Rebuild formula cells standalone: a totals row's `SUM(M4:M53)`
          // has to follow the block that moved, and any shared-formula
          // pointer here could reference a master inside the replaced range.
          // Row-insert semantics, so a `SUM(M1:M37)` anchored in the header
          // keeps its M1 start and only its end follows the block.
          // The cached <v> is dropped so Excel recomputes on open.
          const shiftedFormula = shiftRowRefsAtOrAfter(formula, layout.dataStartRow, delta);
          return `<c r="${c.ref}"${cellStyleAttr(c.s)}><f>${shiftedFormula}</f></c>`;
        })
        .join('');
      return `<row r="${newR}" spans="${shifted.cells[0]?.col ?? 1}:${shifted.cells[shifted.cells.length - 1]?.col ?? 1}">${cellsXml}</row>`;
    })
    .join('');

  const beforeRowsXml = beforeRows.map((r) => r.xml).join('');
  const newSheetDataInner = beforeRowsXml + generatedRowsXml + shiftedAfterRowsXml;

  sheetXml = sheetXml.replace(sheetDataMatch[0], `<sheetData>${newSheetDataInner}</sheetData>`);

  // Row-position-dependent refs living outside <sheetData> in the same part.
  sheetXml = sheetXml.replace(/(<dimension\b[^>]*ref=")([^"]+)(")/, (_m, pre, ref, post) => {
    const [start, end] = ref.split(':');
    if (!end) return `${pre}${ref}${post}`;
    return `${pre}${start}:${shiftRowRefsAtOrAfter(end, layout.dataStartRow, delta)}${post}`;
  });
  sheetXml = sheetXml.replace(/<mergeCell\b[^>]*ref="([^"]+)"[^>]*\/>/g, (whole, ref) => {
    return whole.replace(ref, shiftRowRefsAtOrAfter(ref, layout.dataStartRow, delta));
  });
  sheetXml = sheetXml.replace(/(<autoFilter\b[^>]*ref=")([^"]+)(")/, (_m, pre, ref, post) => {
    return `${pre}${shiftRowRefsAtOrAfter(ref, layout.dataStartRow, delta)}${post}`;
  });
  sheetXml = sheetXml.replace(/(<conditionalFormatting\b[^>]*sqref=")([^"]+)(")/g, (_m, pre, ref, post) => {
    return `${pre}${shiftRowRefsAtOrAfter(ref, layout.dataStartRow, delta)}${post}`;
  });
  sheetXml = sheetXml.replace(/(<dataValidation\b[^>]*sqref=")([^"]+)(")/g, (_m, pre, ref, post) => {
    return `${pre}${shiftRowRefsAtOrAfter(ref, layout.dataStartRow, delta)}${post}`;
  });

  files[sheetPath] = encoder.encode(sheetXml);

  // Token substitution for banner cells ("Period: {{period}}"). These must be
  // applied to sharedStrings.xml as well as the sheet: Excel stores ordinary
  // text cells as shared strings (t="s" + an index), so a token typed into a
  // template lives there and not inline in the worksheet. Replacing the text
  // in place leaves the cell's style index untouched.
  if (options.tokens && Object.keys(options.tokens).length > 0) {
    const applyTokens = (xml: string): string => {
      let result = xml;
      for (const [token, value] of Object.entries(options.tokens!)) {
        result = result.split(`{{${token}}}`).join(xmlEscapeText(value));
      }
      return result;
    };

    for (const part of [sheetPath, 'xl/sharedStrings.xml']) {
      if (!files[part]) continue;
      const before = decoder.decode(files[part]);
      const after = applyTokens(before);
      if (after !== before) files[part] = encoder.encode(after);
    }
  }

  // Force Excel to recalculate formulas on open, since cached <v> values for
  // shifted/cloned formulas were dropped.
  if (files['xl/workbook.xml']) {
    let workbookXml = decoder.decode(files['xl/workbook.xml']);
    if (/<calcPr\b/.test(workbookXml)) {
      workbookXml = workbookXml.replace(/<calcPr\b([^>]*)\/>/, (m, attrs) => {
        return /fullCalcOnLoad=/.test(attrs)
          ? m.replace(/fullCalcOnLoad="[^"]*"/, 'fullCalcOnLoad="1"')
          : `<calcPr${attrs} fullCalcOnLoad="1"/>`;
      });
    } else {
      workbookXml = workbookXml.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
    }
    files['xl/workbook.xml'] = encoder.encode(workbookXml);
  }

  // calcChain.xml caches formula evaluation order by cell reference. Once rows
  // move it points at cells that no longer hold formulas, which is what makes
  // Excel show "we found a problem with some content". It is a pure cache, so
  // dropping it (part + content-type override + relationship) is safe — Excel
  // rebuilds it on open, helped by the fullCalcOnLoad flag set above.
  if (files['xl/calcChain.xml']) {
    delete files['xl/calcChain.xml'];

    const contentTypesPath = '[Content_Types].xml';
    if (files[contentTypesPath]) {
      const ct = decoder
        .decode(files[contentTypesPath])
        .replace(/<Override[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/, '');
      files[contentTypesPath] = encoder.encode(ct);
    }

    const relsPath = 'xl/_rels/workbook.xml.rels';
    if (files[relsPath]) {
      const rels = decoder
        .decode(files[relsPath])
        .replace(/<Relationship[^>]*Target="calcChain\.xml"[^>]*\/>/, '');
      files[relsPath] = encoder.encode(rels);
    }
  }

  return Buffer.from(zipSync(files, { level: 6 }));
}
