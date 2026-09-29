export interface CategoryTheme {
  bg: string;
  text: string;
  border: string;
  dot: string;
  darkBg: string;
  darkText: string;
  darkBorder: string;
  badgeClass: string;
}

export const CATEGORY_COLOR_MAP: Record<string, CategoryTheme> = {
  Salary: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200/80',
    dot: 'bg-purple-500',
    darkBg: 'dark:bg-purple-950/40',
    darkText: 'dark:text-purple-300',
    darkBorder: 'dark:border-purple-800/50',
    badgeClass:
      'bg-purple-50 text-purple-700 border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/50',
  },
  'Salary Advance': {
    bg: 'bg-fuchsia-50',
    text: 'text-fuchsia-700',
    border: 'border-fuchsia-200/80',
    dot: 'bg-fuchsia-500',
    darkBg: 'dark:bg-fuchsia-950/40',
    darkText: 'dark:text-fuchsia-300',
    darkBorder: 'dark:border-fuchsia-800/50',
    badgeClass:
      'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200/80 dark:bg-fuchsia-950/40 dark:text-fuchsia-300 dark:border-fuchsia-800/50',
  },
  Fuel: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200/80',
    dot: 'bg-amber-500',
    darkBg: 'dark:bg-amber-950/40',
    darkText: 'dark:text-amber-300',
    darkBorder: 'dark:border-amber-800/50',
    badgeClass:
      'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50',
  },
  'Toll & Parking': {
    bg: 'bg-cyan-50',
    text: 'text-cyan-700',
    border: 'border-cyan-200/80',
    dot: 'bg-cyan-500',
    darkBg: 'dark:bg-cyan-950/40',
    darkText: 'dark:text-cyan-300',
    darkBorder: 'dark:border-cyan-800/50',
    badgeClass:
      'bg-cyan-50 text-cyan-700 border-cyan-200/80 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800/50',
  },
  Rent: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200/80',
    dot: 'bg-blue-500',
    darkBg: 'dark:bg-blue-950/40',
    darkText: 'dark:text-blue-300',
    darkBorder: 'dark:border-blue-800/50',
    badgeClass:
      'bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/50',
  },
  Utilities: {
    bg: 'bg-yellow-50',
    text: 'text-yellow-800',
    border: 'border-yellow-200/80',
    dot: 'bg-yellow-500',
    darkBg: 'dark:bg-yellow-950/40',
    darkText: 'dark:text-yellow-300',
    darkBorder: 'dark:border-yellow-800/50',
    badgeClass:
      'bg-yellow-50 text-yellow-800 border-yellow-200/80 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800/50',
  },
  'Office Supplies': {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200/80',
    dot: 'bg-emerald-500',
    darkBg: 'dark:bg-emerald-950/40',
    darkText: 'dark:text-emerald-300',
    darkBorder: 'dark:border-emerald-800/50',
    badgeClass:
      'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50',
  },
  Insurance: {
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    border: 'border-teal-200/80',
    dot: 'bg-teal-500',
    darkBg: 'dark:bg-teal-950/40',
    darkText: 'dark:text-teal-300',
    darkBorder: 'dark:border-teal-800/50',
    badgeClass:
      'bg-teal-50 text-teal-700 border-teal-200/80 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800/50',
  },
  'Vehicle Maintenance': {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200/80',
    dot: 'bg-rose-500',
    darkBg: 'dark:bg-rose-950/40',
    darkText: 'dark:text-rose-300',
    darkBorder: 'dark:border-rose-800/50',
    badgeClass:
      'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/50',
  },
  Tyres: {
    bg: 'bg-stone-50',
    text: 'text-stone-700',
    border: 'border-stone-200/80',
    dot: 'bg-stone-500',
    darkBg: 'dark:bg-stone-950/40',
    darkText: 'dark:text-stone-300',
    darkBorder: 'dark:border-stone-800/50',
    badgeClass:
      'bg-stone-50 text-stone-700 border-stone-200/80 dark:bg-stone-950/40 dark:text-stone-300 dark:border-stone-800/50',
  },
  'Government Fees': {
    bg: 'bg-violet-50',
    text: 'text-violet-700',
    border: 'border-violet-200/80',
    dot: 'bg-violet-500',
    darkBg: 'dark:bg-violet-950/40',
    darkText: 'dark:text-violet-300',
    darkBorder: 'dark:border-violet-800/50',
    badgeClass:
      'bg-violet-50 text-violet-700 border-violet-200/80 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800/50',
  },
  Other: {
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-200/80',
    dot: 'bg-slate-400',
    darkBg: 'dark:bg-slate-800/60',
    darkText: 'dark:text-slate-300',
    darkBorder: 'dark:border-slate-700',
    badgeClass:
      'bg-slate-100 text-slate-700 border-slate-200/80 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700',
  },
};

const FALLBACK_PALETTES = [
  {
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200/80',
    dot: 'bg-indigo-500',
    darkBg: 'dark:bg-indigo-950/40',
    darkText: 'dark:text-indigo-300',
    darkBorder: 'dark:border-indigo-800/50',
  },
  {
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-200/80',
    dot: 'bg-sky-500',
    darkBg: 'dark:bg-sky-950/40',
    darkText: 'dark:text-sky-300',
    darkBorder: 'dark:border-sky-800/50',
  },
  {
    bg: 'bg-pink-50',
    text: 'text-pink-700',
    border: 'border-pink-200/80',
    dot: 'bg-pink-500',
    darkBg: 'dark:bg-pink-950/40',
    darkText: 'dark:text-pink-300',
    darkBorder: 'dark:border-pink-800/50',
  },
  {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200/80',
    dot: 'bg-orange-500',
    darkBg: 'dark:bg-orange-950/40',
    darkText: 'dark:text-orange-300',
    darkBorder: 'dark:border-orange-800/50',
  },
];

export function getCategoryTheme(category: string): CategoryTheme {
  if (!category) {
    return CATEGORY_COLOR_MAP['Other'];
  }
  const match = Object.keys(CATEGORY_COLOR_MAP).find(
    (k) => k.toLowerCase() === category.trim().toLowerCase()
  );
  if (match) {
    return CATEGORY_COLOR_MAP[match];
  }

  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % FALLBACK_PALETTES.length;
  const palette = FALLBACK_PALETTES[index];

  return {
    ...palette,
    badgeClass: `${palette.bg} ${palette.text} ${palette.border} ${palette.darkBg} ${palette.darkText} ${palette.darkBorder}`,
  };
}
