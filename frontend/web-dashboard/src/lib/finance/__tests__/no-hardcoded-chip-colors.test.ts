import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const PALETTE_REGEX =
  /\b(bg|text|border|ring)-(emerald|green|amber|yellow|rose|red|sky|blue|violet|purple|teal|orange|indigo|pink|slate|gray|zinc)-\d{2,3}\b/;

// Explicitly allowlisted non-chip component files (charts, status ribbons, step dots, warning modals, print layouts)
const ALLOWLIST: string[] = [
  'components/finance/kit/FilterBar.tsx',
  'components/finance/kit/InsightRail.tsx',
  'components/finance/kit/MoneyText.tsx',
  'components/finance/kit/StatementRow.tsx',
  'components/finance/kit/StatementRow.test.tsx',
  'components/finance/kit/StatusTabs.tsx',
  'components/finance/kit/ActivityTimeline.tsx',
  'components/finance/kit/DocStatusBar.tsx',
  'components/finance/kit/BalanceHeroCard.tsx',
  'components/finance/InvoicePrintModal.tsx',
  'components/finance/advances/AdvanceApplySheet.tsx',
  'components/finance/advances/AdvanceGroupRow.tsx',
  'components/finance/advances/AdvancePrintVoucher.tsx',
  'components/finance/advances/AdvanceReadinessRail.tsx',
  'components/finance/banking/TransferSheet.tsx',
  'components/finance/payables/PayRunSheet.tsx',
  'components/finance/periods/BulkGeneratePeriodsSheet.tsx',
  'components/finance/periods/CloseWarningModal.tsx',
  'components/finance/periods/GuidedFiscalYearCloseSheet.tsx',
  'components/finance/periods/HistoricalPeriodsTable.tsx',
  'components/finance/periods/MonthlyPeriodRibbon.tsx',
  'components/finance/periods/NewPeriodSheet.tsx',
  'components/finance/periods/PeriodChecklistCard.tsx',
  'components/finance/periods/PeriodControlBar.tsx',
  'components/finance/periods/PeriodDetailsCard.tsx',
  'components/finance/periods/ReopenPeriodSheet.tsx',
  'components/finance/periods/TypedLockPeriodModal.tsx',
];

function getAllTsxFiles(dirPath: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dirPath)) return files;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllTsxFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Finance Module Color Guardrail', () => {
  it('ensures no hardcoded Tailwind palette color classes exist for chips in pages/finance or components/finance', () => {
    const rootDir = path.resolve(__dirname, '../../../');
    const pagesDir = path.join(rootDir, 'pages/finance');
    const componentsDir = path.join(rootDir, 'components/finance');

    const allFiles = [...getAllTsxFiles(pagesDir), ...getAllTsxFiles(componentsDir)];
    expect(allFiles.length).toBeGreaterThan(0);

    const violations: { file: string; line: number; match: string }[] = [];

    for (const filePath of allFiles) {
      const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');
      if (ALLOWLIST.includes(relativePath)) continue;

      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        // Target lines that construct chip/badge/pill containers with hardcoded palette colors
        const isChipPattern =
          /\b(px-2|px-2\.5|px-3|py-0\.5|py-1|rounded-full|rounded-md)\b/.test(line) ||
          /\b(chip|badge|pill)\b/i.test(line);

        const hasTokenClasses = /bg-chip-|text-chip-|border-chip-/.test(line);

        if (isChipPattern && !hasTokenClasses) {
          const match = line.match(PALETTE_REGEX);
          if (match) {
            // Ignore standard buttons, links, inputs
            if (!/<(Button|Link|input|textarea|tr|td|th)\b/.test(line)) {
              violations.push({
                file: relativePath,
                line: index + 1,
                match: match[0],
              });
            }
          }
        }
      });
    }

    if (violations.length > 0) {
      const summary = violations
        .map((v) => `  - ${v.file}:${v.line} -> found '${v.match}'`)
        .join('\n');
      throw new Error(
        `Found ${violations.length} hardcoded Tailwind palette color chip violation(s) in Finance module:\n${summary}\n\nPlease migrate these to token-driven Chip system helpers or tokens from @/lib/finance/chips!`
      );
    }

    expect(violations).toHaveLength(0);
  });
});
