export type PeriodPreset =
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_year'
  | 'last_year'
  | 'ytd'
  | 'custom';

export type CompareOption =
  | 'none'
  | 'previous_period'
  | 'same_period_last_year'
  | 'monthly'
  | 'quarterly';

function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function resolvePeriodPreset(preset: PeriodPreset, today = new Date()): { from: string; to: string } {
  const y = today.getFullYear();
  const m = today.getMonth(); // 0-indexed

  switch (preset) {
    case 'this_month': {
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);
      return { from: toIsoDate(start), to: toIsoDate(end) };
    }
    case 'last_month': {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      return { from: toIsoDate(start), to: toIsoDate(end) };
    }
    case 'this_quarter': {
      const qStartMonth = Math.floor(m / 3) * 3;
      const start = new Date(y, qStartMonth, 1);
      const end = new Date(y, qStartMonth + 3, 0);
      return { from: toIsoDate(start), to: toIsoDate(end) };
    }
    case 'last_quarter': {
      const qStartMonth = Math.floor(m / 3) * 3 - 3;
      const start = new Date(y, qStartMonth, 1);
      const end = new Date(y, qStartMonth + 3, 0);
      return { from: toIsoDate(start), to: toIsoDate(end) };
    }
    case 'this_year': {
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
    case 'last_year': {
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    }
    case 'ytd': {
      return { from: `${y}-01-01`, to: toIsoDate(today) };
    }
    case 'custom':
    default: {
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);
      return { from: toIsoDate(start), to: toIsoDate(end) };
    }
  }
}

export interface CompareColumnMeta {
  key: string;
  label: string;
  from: string;
  to: string;
}

export function resolveCompareColumns(
  fromStr: string,
  toStr: string,
  compareOpt: CompareOption,
): CompareColumnMeta[] {
  if (compareOpt === 'none' || !fromStr || !toStr) return [];

  const from = new Date(`${fromStr}T00:00:00Z`);
  const to = new Date(`${toStr}T23:59:59Z`);

  if (compareOpt === 'previous_period') {
    const diffMs = to.getTime() - from.getTime();
    const prevToMs = from.getTime() - 86400000;
    const prevFromMs = prevToMs - diffMs;

    const prevFrom = new Date(prevFromMs);
    const prevTo = new Date(prevToMs);

    return [
      {
        key: 'previous',
        label: 'Previous Period',
        from: toIsoDate(prevFrom),
        to: toIsoDate(prevTo),
      },
    ];
  }

  if (compareOpt === 'same_period_last_year') {
    const prevFrom = new Date(from);
    prevFrom.setFullYear(prevFrom.getFullYear() - 1);
    const prevTo = new Date(to);
    prevTo.setFullYear(prevTo.getFullYear() - 1);

    return [
      {
        key: 'last_year',
        label: 'Same Period Last Year',
        from: toIsoDate(prevFrom),
        to: toIsoDate(prevTo),
      },
    ];
  }

  if (compareOpt === 'monthly') {
    const cols: CompareColumnMeta[] = [];
    let cur = new Date(from.getFullYear(), from.getMonth(), 1);
    const endLimit = new Date(to.getFullYear(), to.getMonth() + 1, 0);

    let count = 0;
    while (cur <= endLimit && count < 12) {
      const monthStart = new Date(cur.getFullYear(), cur.getMonth(), 1);
      const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);

      // Clamp to report boundaries
      const f = monthStart < from ? from : monthStart;
      const t = monthEnd > to ? to : monthEnd;

      const label = cur.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      cols.push({
        key: `month_${cur.getFullYear()}_${cur.getMonth() + 1}`,
        label,
        from: toIsoDate(f),
        to: toIsoDate(t),
      });

      cur.setMonth(cur.getMonth() + 1);
      count++;
    }
    return cols;
  }

  if (compareOpt === 'quarterly') {
    const cols: CompareColumnMeta[] = [];
    let curYear = from.getFullYear();
    let curQ = Math.floor(from.getMonth() / 3);
    const endYear = to.getFullYear();
    const endQ = Math.floor(to.getMonth() / 3);

    let count = 0;
    while ((curYear < endYear || (curYear === endYear && curQ <= endQ)) && count < 8) {
      const qStart = new Date(curYear, curQ * 3, 1);
      const qEnd = new Date(curYear, curQ * 3 + 3, 0);

      const f = qStart < from ? from : qStart;
      const t = qEnd > to ? to : qEnd;

      cols.push({
        key: `q_${curYear}_q${curQ + 1}`,
        label: `Q${curQ + 1} ${curYear}`,
        from: toIsoDate(f),
        to: toIsoDate(t),
      });

      curQ++;
      if (curQ > 3) {
        curQ = 0;
        curYear++;
      }
      count++;
    }
    return cols;
  }

  return [];
}
