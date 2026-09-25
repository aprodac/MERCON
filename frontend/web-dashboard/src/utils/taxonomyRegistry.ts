import { Truck, Scale, Box, Container, Repeat, Clock, Calendar, Zap, Tag } from 'lucide-react';

export type TaxonomyCategory = 'VEHICLE_CLASS' | 'LINE_TYPE' | 'BILLING_TYPE' | 'OPERATION_TYPE';

export interface ColorTheme {
  id: string;
  name: string;
  bg: string;
  text: string;
  border: string;
  hex: string;
  darkBg?: string;
  darkText?: string;
}

export interface TaxonomyOption {
  id: string;
  code: string;
  label: string;
  category: TaxonomyCategory;
  colorTheme: ColorTheme;
  iconName?: string;
  isCustom?: boolean;
  isActive?: boolean;
}

// Preset Universal Color Swatches
export const COLOR_PALETTES: ColorTheme[] = [
  { id: 'amber', name: 'Amber Tonnage', bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-amber-300', hex: '#F59E0B', darkBg: 'dark:bg-amber-950/40', darkText: 'dark:text-amber-300' },
  { id: 'coral', name: 'Coral / Brand', bg: 'bg-brand-light', text: 'text-brand', border: 'border-[#FFD4C4]', hex: '#FA634E', darkBg: 'dark:bg-red-950/40', darkText: 'dark:text-red-300' },
  { id: 'cyan', name: 'Cyan Light Tonnage', bg: 'bg-cyan-50', text: 'text-cyan-800', border: 'border-cyan-200', hex: '#06B6D4', darkBg: 'dark:bg-cyan-950/40', darkText: 'dark:text-cyan-300' },
  { id: 'sky', name: 'Sky Single Trip', bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-300', hex: '#0284C7', darkBg: 'dark:bg-sky-950/40', darkText: 'dark:text-sky-300' },
  { id: 'indigo', name: 'Indigo Round Trip', bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-300', hex: '#6366F1', darkBg: 'dark:bg-indigo-950/40', darkText: 'dark:text-indigo-300' },
  { id: 'blue', name: 'Blue Shift Duty', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-300', hex: '#3B82F6', darkBg: 'dark:bg-blue-950/40', darkText: 'dark:text-blue-300' },
  { id: 'royal', name: 'Royal Duty', bg: 'bg-blue-100', text: 'text-blue-950', border: 'border-blue-400', hex: '#1D4ED8', darkBg: 'dark:bg-blue-950/60', darkText: 'dark:text-blue-200' },
  { id: 'emerald', name: 'Emerald Monthly', bg: 'bg-emerald-100', text: 'text-emerald-950', border: 'border-emerald-300', hex: '#10B981', darkBg: 'dark:bg-emerald-950/60', darkText: 'dark:text-emerald-200' },
  { id: 'teal', name: 'Teal Extra Duty', bg: 'bg-teal-50', text: 'text-teal-800', border: 'border-teal-200', hex: '#14B8A6', darkBg: 'dark:bg-teal-950/40', darkText: 'dark:text-teal-300' },
  { id: 'purple', name: 'Purple Container', bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200', hex: '#A855F7', darkBg: 'dark:bg-purple-950/40', darkText: 'dark:text-purple-300' },
  { id: 'slate', name: 'Heavy Duty Slate', bg: 'bg-charcoal', text: 'text-white', border: 'border-slate-800', hex: '#0F172A', darkBg: 'dark:bg-slate-900', darkText: 'dark:text-slate-100' },
  { id: 'rose', name: 'Rose Express', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200', hex: '#F43F5E', darkBg: 'dark:bg-rose-950/40', darkText: 'dark:text-rose-300' },
];

// Default Canonical Options
const DEFAULT_TAXONOMY_OPTIONS: TaxonomyOption[] = [
  // --- VEHICLE CLASSES ---
  {
    id: 'vc_3_4_ton',
    code: '3-4 TON',
    label: '3-4 TON',
    category: 'VEHICLE_CLASS',
    colorTheme: COLOR_PALETTES[2], // Cyan
    iconName: 'Box',
    isActive: true,
  },
  {
    id: 'vc_5_ton',
    code: '5 TON',
    label: '5 TON',
    category: 'VEHICLE_CLASS',
    colorTheme: COLOR_PALETTES[1], // Coral
    iconName: 'Truck',
    isActive: true,
  },
  {
    id: 'vc_8_ton',
    code: '8 TON',
    label: '8 TON',
    category: 'VEHICLE_CLASS',
    colorTheme: COLOR_PALETTES[8], // Teal
    iconName: 'Truck',
    isActive: true,
  },
  {
    id: 'vc_10_ton',
    code: '10 TON',
    label: '10 TON',
    category: 'VEHICLE_CLASS',
    colorTheme: COLOR_PALETTES[0], // Amber (Orange Universal Signature)
    iconName: 'Scale',
    isActive: true,
  },
  {
    id: 'vc_20_ton',
    code: '20 TON',
    label: '20 TON',
    category: 'VEHICLE_CLASS',
    colorTheme: COLOR_PALETTES[10], // Dark Slate
    iconName: 'Container',
    isActive: true,
  },
  {
    id: 'vc_40_feet',
    code: '40 FEET',
    label: '40 FEET',
    category: 'VEHICLE_CLASS',
    colorTheme: COLOR_PALETTES[9], // Purple
    iconName: 'Container',
    isActive: true,
  },

  // --- LINE TYPES ---
  {
    id: 'lt_single_trip',
    code: 'SINGLE_TRIP',
    label: 'Single Trip',
    category: 'LINE_TYPE',
    colorTheme: COLOR_PALETTES[3], // Sky
    iconName: 'Zap',
    isActive: true,
  },
  {
    id: 'lt_round_trip',
    code: 'ROUND_TRIP',
    label: 'Round Trip',
    category: 'LINE_TYPE',
    colorTheme: COLOR_PALETTES[4], // Indigo
    iconName: 'Repeat',
    isActive: true,
  },
  {
    id: 'lt_10_hrs',
    code: '10_HRS',
    label: '10 Hours Duty',
    category: 'LINE_TYPE',
    colorTheme: COLOR_PALETTES[5], // Blue
    iconName: 'Clock',
    isActive: true,
  },
  {
    id: 'lt_12_hrs',
    code: '12_HRS',
    label: '12 Hours Duty',
    category: 'LINE_TYPE',
    colorTheme: COLOR_PALETTES[6], // Royal
    iconName: 'Clock',
    isActive: true,
  },

  // --- BILLING TYPES ---
  {
    id: 'op_monthly',
    code: 'MONTHLY',
    label: 'Monthly',
    category: 'BILLING_TYPE',
    colorTheme: COLOR_PALETTES[7], // Emerald
    iconName: 'Calendar',
    isActive: true,
  },
  {
    id: 'op_extra',
    code: 'EXTRA',
    label: 'Extra',
    category: 'BILLING_TYPE',
    colorTheme: COLOR_PALETTES[8], // Teal
    iconName: 'Tag',
    isActive: true,
  },
];

const STORAGE_KEY = 'mercon_taxonomy_registry_v1';
export const TAXONOMY_UPDATED_EVENT = 'mercon-taxonomy-updated';

/**
 * Normalizes input value for robust lookup
 */
export function normalizeCode(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  
  const upper = trimmed.toUpperCase();
  if (upper === 'SINGLE TRIP' || upper === 'SINGLE_TRIP') return 'SINGLE_TRIP';
  if (upper === 'ROUND TRIP' || upper === 'ROUND_TRIP') return 'ROUND_TRIP';
  if (upper === '10 HRS' || upper === '10_HRS' || upper === '10 HOURS SHIFT' || upper === '10 HRS DUTY' || upper === '10 HOURS DUTY') return '10_HRS';
  if (upper === '12 HRS' || upper === '12_HRS' || upper === '12 HOURS SHIFT' || upper === '12 HRS DUTY' || upper === '12 HOURS DUTY') return '12_HRS';
  if (upper === 'MONTHLY') return 'MONTHLY';
  if (upper === 'EXTRA') return 'EXTRA';
  if (upper === '3TON/4TON' || upper === '3-4 TON' || upper === '3 TON') return '3-4 TON';
  if (upper === '5 TON' || upper === '5M-5TON') return '5 TON';
  if (upper === '8 TON' || upper === '8TON' || upper === '8-TON') return '8 TON';
  if (upper === '10 TON' || upper === '6.5M-10TON') return '10 TON';
  if (upper === '20 TON' || upper === '13.5M-20TON' || upper === '20/24 TON' || upper === '24 TON') return '20 TON';
  if (upper === '40 FEET' || upper === '40FT') return '40 FEET';

  return upper;
}

/**
 * Fetches stored custom/overridden options from localStorage.
 */
export function getCustomTaxonomyOptions(): TaxonomyOption[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function matchCategory(catA: TaxonomyCategory, catB: TaxonomyCategory): boolean {
  if (catA === catB) return true;
  if ((catA === 'BILLING_TYPE' || catA === 'OPERATION_TYPE') && (catB === 'BILLING_TYPE' || catB === 'OPERATION_TYPE')) return true;
  return false;
}

/**
 * Returns all active taxonomy options (Default Canonical + User Custom).
 */
export function getAllTaxonomyOptions(category?: TaxonomyCategory): TaxonomyOption[] {
  const custom = getCustomTaxonomyOptions();
  
  const map = new Map<string, TaxonomyOption>();
  
  DEFAULT_TAXONOMY_OPTIONS.forEach(opt => {
    map.set(`${opt.category}::${normalizeCode(opt.code)}`, opt);
  });
  
  custom.forEach(opt => {
    map.set(`${opt.category}::${normalizeCode(opt.code)}`, opt);
  });

  const all = Array.from(map.values()).map(o => ({
    ...o,
    isActive: o.isActive !== false,
  }));

  if (category) {
    return all.filter(item => matchCategory(item.category, category));
  }
  return all;
}

/**
 * Resolves full taxonomy option details for a given category & value string.
 */
export function resolveTaxonomyOption(category: TaxonomyCategory, value: string | null | undefined): TaxonomyOption | null {
  if (!value) return null;
  const norm = normalizeCode(value);
  const options = getAllTaxonomyOptions(category);
  
  const exact = options.find(o => normalizeCode(o.code) === norm || normalizeCode(o.label) === norm);
  if (exact) return exact;

  const partial = options.find(o => norm.includes(normalizeCode(o.code)) || normalizeCode(o.code).includes(norm));
  if (partial) return partial;

  let defaultTheme = COLOR_PALETTES[11];
  if (category === 'VEHICLE_CLASS') defaultTheme = COLOR_PALETTES[0];
  if (category === 'LINE_TYPE') defaultTheme = COLOR_PALETTES[3];
  if (category === 'BILLING_TYPE' || category === 'OPERATION_TYPE') defaultTheme = COLOR_PALETTES[8];

  return {
    id: `auto_${category}_${norm}`,
    code: value,
    label: value,
    category,
    colorTheme: defaultTheme,
    isCustom: false,
    isActive: true,
  };
}

/**
 * Adds or updates a taxonomy option.
 */
export function saveCustomTaxonomyOption(newOpt: {
  id?: string;
  label: string;
  category: TaxonomyCategory;
  colorThemeId?: string;
  code?: string;
  isActive?: boolean;
}): TaxonomyOption {
  const label = newOpt.label.trim();
  if (!label) throw new Error('Option label cannot be empty');

  const code = newOpt.code?.trim().toUpperCase() || label.toUpperCase().replace(/\s+/g, '_');
  const category = newOpt.category === 'OPERATION_TYPE' ? 'BILLING_TYPE' : newOpt.category;
  
  const theme = COLOR_PALETTES.find(p => p.id === newOpt.colorThemeId) || COLOR_PALETTES[Math.floor(Math.random() * COLOR_PALETTES.length)];

  // Check if option is canonical
  const canonical = DEFAULT_TAXONOMY_OPTIONS.find(c => matchCategory(c.category, category) && normalizeCode(c.code) === normalizeCode(code));

  const option: TaxonomyOption = {
    id: newOpt.id || (canonical ? canonical.id : `custom_${category.toLowerCase()}_${Date.now()}`),
    code: canonical ? canonical.code : code,
    label,
    category,
    colorTheme: theme,
    isCustom: !canonical,
    isActive: newOpt.isActive !== false,
  };

  const currentCustom = getCustomTaxonomyOptions();
  const filtered = currentCustom.filter(c => !(matchCategory(c.category, category) && normalizeCode(c.code) === normalizeCode(code)));
  const updated = [...filtered, option];

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(TAXONOMY_UPDATED_EVENT, { detail: option }));
  } catch (e) {
    console.error('Failed to save taxonomy option to localStorage', e);
  }

  return option;
}

/**
 * Toggles active status of an option.
 */
export function toggleTaxonomyOptionActiveStatus(id: string, code: string, category: TaxonomyCategory, currentStatus: boolean): void {
  const allCustom = getCustomTaxonomyOptions();
  const canonical = DEFAULT_TAXONOMY_OPTIONS.find(c => c.id === id || normalizeCode(c.code) === normalizeCode(code));
  
  const existingIndex = allCustom.findIndex(c => c.id === id || (matchCategory(c.category, category) && normalizeCode(c.code) === normalizeCode(code)));
  
  let targetOption: TaxonomyOption;
  if (existingIndex >= 0) {
    targetOption = { ...allCustom[existingIndex], isActive: !currentStatus };
  } else if (canonical) {
    targetOption = { ...canonical, isActive: !currentStatus };
  } else {
    return;
  }

  const filtered = allCustom.filter((_, idx) => idx !== existingIndex);
  const updated = [...filtered, targetOption];

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(TAXONOMY_UPDATED_EVENT, { detail: targetOption }));
  } catch (e) {
    console.error('Failed to update status', e);
  }
}

/**
 * Deletes a custom option.
 */
export function deleteCustomTaxonomyOption(id: string): void {
  const allCustom = getCustomTaxonomyOptions();
  const updated = allCustom.filter(c => c.id !== id);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(TAXONOMY_UPDATED_EVENT, { detail: { id, deleted: true } }));
  } catch (e) {
    console.error('Failed to delete taxonomy option', e);
  }
}

export function getTaxonomyIconComponent(iconName?: string) {
  switch (iconName) {
    case 'Truck': return Truck;
    case 'Scale': return Scale;
    case 'Box': return Box;
    case 'Container': return Container;
    case 'Repeat': return Repeat;
    case 'Clock': return Clock;
    case 'Calendar': return Calendar;
    case 'Zap': return Zap;
    default: return Tag;
  }
}

/**
 * Strict Billing Type Normalizer.
 * Replaces risky substring matching with word-boundary token regex.
 */
export function normalizeBillingType(val?: string | null): string {
  if (!val) return 'Monthly';
  const s = String(val).toUpperCase().trim();
  if (/\b(EXTRA|SPOT|ADHOC)\b/i.test(s)) return 'Extra';
  return 'Monthly';
}

/**
 * Strict Rate Category Normalizer.
 * Replaces fuzzy substring matching with precise line type regex.
 */
export function normalizeRateCategory(val?: string | null): string {
  if (!val) return 'Single Trip';
  const s = String(val).toUpperCase().replace(/_/g, ' ').trim();
  if (/\bROUND(\s*TRIP)?\b/i.test(s)) return 'Round Trip';
  if (/\b10\s*(HRS|HOURS)(\s*DUTY|\s*SHIFT)?\b/i.test(s)) return '10 Hours Duty';
  if (/\b12\s*(HRS|HOURS)(\s*DUTY|\s*SHIFT)?\b/i.test(s)) return '12 Hours Duty';
  return 'Single Trip';
}

/**
 * Strict Vehicle Class Normalizer.
 * Evaluated in strict order (e.g. 40 FEET before 3-4 TON) to prevent '4' in 40 FEET from matching 3-4 TON.
 */
export function normalizeVehicleClass(val?: string | null): string {
  if (!val) return '10 TON';
  const s = String(val).toUpperCase().replace(/_/g, ' ').trim();
  
  if (/\b(40\s*FEET|40\s*FT|CONTAINER)\b/i.test(s)) return '40 FEET';
  if (/\b(20\s*TON|24\s*TON|13\.5M[-_]20TON)\b/i.test(s)) return '20 TON';
  if (/\b(10\s*TON|6\.5M[-_]10TON)\b/i.test(s)) return '10 TON';
  if (/\b(8\s*TON)\b/i.test(s)) return '8 TON';
  if (/\b(5\s*TON|5M[-_]5TON)\b/i.test(s)) return '5 TON';
  if (/\b(3[-–]?4\s*TON|3TON\/4TON|3\s*TON|4\s*TON)\b/i.test(s)) return '3-4 TON';

  return '10 TON';
}

