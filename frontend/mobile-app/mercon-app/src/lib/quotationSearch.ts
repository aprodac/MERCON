/**
 * Pure quotation search & directional route parser for mobile app.
 */

export const CITY_ALIASES: Record<string, string[]> = {
  riyadh: ['ruh', 'ryd', 'riyad', 'الرياض', 'رياض'],
  dammam: ['dmm', 'damam', 'الدمام', 'دمام'],
  jeddah: ['jed', 'jdd', 'jiddah', 'جدة', 'جده'],
  jubail: ['jub', 'jbl', 'الجبيل', 'جبيل'],
  abha: ['abh', 'ahb', 'أبها', 'ابها'],
  khobar: ['khb', 'alkhobar', 'الخبر', 'خبر'],
  hufuf: ['huf', 'hofuf', 'al hasa', 'al-hasa', 'hasa', 'الهفوف', 'الأحساء', 'احساء'],
  medina: ['med', 'madinah', 'madina', 'المدينة', 'المدينة المنورة'],
  mecca: ['makkah', 'mecca', 'مكة', 'مكة المكرمة'],
  tabuk: ['tbk', 'tabouk', 'تبوك'],
  jizan: ['gzan', 'jizan', 'jazan', 'جيزان', 'جازان'],
  khamis: ['khamis mushait', 'khamis mushayt', 'خميس مشيط', 'خميس'],
  yanbu: ['yen', 'yanbo', 'ينبع'],
  buraidah: ['bur', 'qassim', 'القصيم', 'بريدة'],
  rabigh: ['rabigh', 'رابغ'],
  waad: ['waad al shamal', 'وعد الشمال'],
  ras: ['ras al khair', 'رأس الخير', 'راس الخير'],
};

export function expandSearchTerm(term: string): string[] {
  const normalized = term.toLowerCase().trim();
  if (!normalized) return [];

  const results = new Set<string>([normalized]);

  for (const [canonical, aliases] of Object.entries(CITY_ALIASES)) {
    if (
      canonical === normalized ||
      aliases.includes(normalized) ||
      canonical.includes(normalized)
    ) {
      results.add(canonical);
      aliases.forEach((a) => results.add(a));
    }
  }

  return Array.from(results);
}

export function matchesAnyTerm(targetText: string, searchTerms: string[]): boolean {
  if (!targetText || searchTerms.length === 0) return false;
  return searchTerms.some((term) => targetText.includes(term));
}

export function parseBudgetFilter(rawQuery: string): ((price: number) => boolean) | null {
  const rangeMatch = rawQuery.match(/^([<>]=?)\s*(\d+(?:\.\d+)?)$/);
  if (rangeMatch) {
    const op = rangeMatch[1];
    const val = parseFloat(rangeMatch[2]);
    if (op === '<') return (p) => p < val;
    if (op === '<=') return (p) => p <= val;
    if (op === '>') return (p) => p > val;
    if (op === '>=') return (p) => p >= val;
  }

  const bandMatch = rawQuery.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
  if (bandMatch) {
    const min = parseFloat(bandMatch[1]);
    const max = parseFloat(bandMatch[2]);
    return (p) => p >= min && p <= max;
  }

  return null;
}

export interface SearchableQuotation {
  id: string;
  name?: string | null;
  quotation_number?: string | number | null;
  origin_name?: string | null;
  destination_name?: string | null;
  origin_city?: string | null;
  destination_city?: string | null;
  origin?: string | null;
  destination?: string | null;
  vehicle_class?: string | null;
  vehicle_type?: string | null;
  line_type?: string | null;
  rate_category?: string | null;
  operation_type?: string | null;
  billing_type?: string | null;
  rate?: number | null;
  base_price?: number | null;
  stops?: any[] | null;
}

export function filterQuotationsBySearch<T extends SearchableQuotation>(
  cards: T[],
  searchQuery: string,
  lineTypeFilter?: string | null
): T[] {
  let filtered = cards;

  // Apply line type filter if set
  if (lineTypeFilter && lineTypeFilter !== 'ALL') {
    const targetCategory = lineTypeFilter.toUpperCase().replace(/_/g, ' ');
    filtered = filtered.filter((q) => {
      const qCategory = String(q.rate_category || q.line_type || '').toUpperCase().replace(/_/g, ' ');
      if (targetCategory.includes('10')) return qCategory.includes('10');
      if (targetCategory.includes('12')) return qCategory.includes('12');
      if (targetCategory.includes('ROUND')) return qCategory.includes('ROUND');
      if (targetCategory.includes('SINGLE')) return qCategory.includes('SINGLE');
      return qCategory === targetCategory;
    });
  }

  if (!searchQuery.trim()) return filtered;
  const rawQuery = searchQuery.toLowerCase().trim();

  // 1. Budget Filter Match (< 2000, > 1500, 1500-2500)
  const budgetEvaluator = parseBudgetFilter(rawQuery);

  // 2. Directional Route Query ("riyadh to hail", "ruh -> dmm", "riyadh - abha")
  const directionalRegex = /\s*(?:\bto\b|->|–|-|>)\s*/i;
  const isDirectional = directionalRegex.test(rawQuery);

  let originSubquery = '';
  let destSubquery = '';

  if (isDirectional) {
    const parts = rawQuery.split(directionalRegex);
    if (parts.length >= 2) {
      originSubquery = parts[0].trim();
      destSubquery = parts.slice(1).join(' ').trim();
    }
  }

  const expandedOrig = expandSearchTerm(originSubquery);
  const expandedDest = expandSearchTerm(destSubquery);
  const expandedSingleQuery = expandSearchTerm(rawQuery);
  const queryTokens = rawQuery.split(/\s+/).filter(Boolean);

  return filtered.filter((rc) => {
    const qNum = String(rc.quotation_number || rc.name || '').toLowerCase();
    const firstStop = rc.stops && rc.stops.length > 0 ? rc.stops[0] : null;
    const lastStop = rc.stops && rc.stops.length > 1 ? rc.stops[rc.stops.length - 1] : firstStop;

    const orig = String(
      firstStop?.source_label ||
      firstStop?.location_name ||
      firstStop?.location?.name ||
      rc.origin_name ||
      rc.origin_city ||
      rc.origin ||
      ''
    ).toLowerCase();

    const dest = String(
      lastStop?.source_label ||
      lastStop?.location_name ||
      lastStop?.location?.name ||
      rc.destination_name ||
      rc.destination_city ||
      rc.destination ||
      ''
    ).toLowerCase();

    const vClass = String(rc.vehicle_class || rc.vehicle_type || '').toLowerCase();
    const rCat = String(rc.rate_category || rc.line_type || '').toLowerCase();
    const numRate = Number(rc.rate ?? rc.base_price ?? 0);
    const rateStr = String(numRate).toLowerCase();

    const fullText = `${qNum} ${orig} ${dest} ${vClass} ${rCat} ${rateStr}`;

    // A) Price / Budget Evaluator
    if (budgetEvaluator) {
      return budgetEvaluator(numRate);
    }

    // B) Directional Lane & Return / Round-Trip Auto-Match
    if (isDirectional && (originSubquery || destSubquery)) {
      const forwardOrigMatch = !originSubquery || matchesAnyTerm(orig, expandedOrig);
      const forwardDestMatch = !destSubquery || matchesAnyTerm(dest, expandedDest);
      if (forwardOrigMatch && forwardDestMatch) return true;

      const isRoundTripCard = rCat.includes('round') || Boolean((rc as any).is_round_trip);
      const reverseOrigMatch = !destSubquery || matchesAnyTerm(orig, expandedDest);
      const reverseDestMatch = !originSubquery || matchesAnyTerm(dest, expandedOrig);
      if ((isRoundTripCard || reverseOrigMatch) && reverseOrigMatch && reverseDestMatch) return true;

      return false;
    }

    // C) City Aliases / Airport Codes / Arabic Name Matching
    if (matchesAnyTerm(orig, expandedSingleQuery) || matchesAnyTerm(dest, expandedSingleQuery)) {
      return true;
    }

    // D) Standard Substring Match across metadata
    if (qNum.includes(rawQuery) || orig.includes(rawQuery) || dest.includes(rawQuery) || vClass.includes(rawQuery) || rCat.includes(rawQuery) || rateStr.includes(rawQuery)) {
      return true;
    }

    // E) Multi-word token match
    if (queryTokens.length > 1) {
      return queryTokens.every((token) => {
        const expandedToken = expandSearchTerm(token);
        return matchesAnyTerm(fullText, expandedToken);
      });
    }

    return false;
  });
}
