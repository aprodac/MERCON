/** Local YYYY-MM-DD — never toISOString(), which shifts the date across UTC. */
export const toDayKey = (d: Date | string | null | undefined): string => {
  if (!d) return '1970-01-01';
  const dateObj = d instanceof Date ? d : new Date(d);
  if (isNaN(dateObj.getTime())) return '1970-01-01';
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
};

/**
 * The month the board is showing. Accepts `YYYY-MM`; anything else (including
 * a missing param) falls back to the current month rather than erroring, since
 * the page opens with no month chosen.
 */
export function resolveMonth(raw: unknown): { month: string; start: Date; end: Date } {
  const now = new Date();
  let year = now.getFullYear();
  let monthIndex = now.getMonth();

  if (typeof raw === 'string') {
    const match = /^(\d{4})-(\d{2})$/.exec(raw.trim());
    if (match) {
      const parsedYear = Number(match[1]);
      const parsedMonth = Number(match[2]);
      if (parsedYear >= 2000 && parsedYear <= 2100 && parsedMonth >= 1 && parsedMonth <= 12) {
        year = parsedYear;
        monthIndex = parsedMonth - 1;
      }
    }
  }

  return {
    month: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
    start: new Date(year, monthIndex, 1, 0, 0, 0, 0),
    end: new Date(year, monthIndex + 1, 0, 23, 59, 59, 999),
  };
}
