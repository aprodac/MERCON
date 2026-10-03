import type { DocType } from '@/services/documentService';

/** Human-friendly label for each DocType enum value. */
const DOC_TYPE_LABELS: Record<DocType, string> = {
  DriverLicense:       'Driver License',
  VehicleRegistration: 'Vehicle Registration',
  Insurance:           'Insurance Policy',
  POD:                 'Proof of Delivery',
  CustomsClearance:    'Customs Clearance',
  Waybill:             'Waybill',
  Contract:            'Contract Agreement',
  Invoice:             'Commercial Invoice',
  Emergency:           'Emergency Incident File',
  Passport:            'Passport',
};

export function docTypeLabel(t: string): string {
  return DOC_TYPE_LABELS[t as DocType] ?? t;
}

/**
 * The label to actually show for a document. Every document still carries the
 * legacy `doc_type` enum (kept for back-compat readers), but its configured
 * `documentType` — e.g. "Isthimara" instead of the legacy "Vehicle
 * Registration" — is the real, owner-facing name once one is linked. Falls
 * back to the legacy label only for documents that predate DocumentType
 * linking (should be none after the seed backfill, but stay defensive).
 */
export function documentDisplayName(doc?: { doc_type?: string; documentType?: { name: string } | null } | null): string {
  if (!doc) return 'Document';
  return doc.documentType?.name || (doc.doc_type ? docTypeLabel(doc.doc_type) : 'Document');
}

export type DocCategory = 'Drivers' | 'Vehicles' | 'Company' | 'Operations';

/** Map a document's owning entity_type to a UI category. */
export function categoryForEntity(entityType: string): DocCategory {
  switch (entityType) {
    case 'Driver': return 'Drivers';
    case 'Vehicle':
    case 'MaintenanceRecord': return 'Vehicles';
    case 'Trip': return 'Operations';
    default: return 'Company';
  }
}

/** Map a DocType to a UI category (each doc type belongs to exactly one). */
export function categoryForDocType(t: string): DocCategory {
  switch (t as DocType) {
    case 'DriverLicense':
    case 'Passport': return 'Drivers';
    case 'VehicleRegistration':
    case 'Insurance': return 'Vehicles';
    case 'POD':
    case 'Waybill':
    case 'CustomsClearance':
    case 'Emergency': return 'Operations';
    case 'Contract':
    case 'Invoice': return 'Company';
    default: return 'Company';
  }
}

/** 
 * Whole calendar days from today until the given date (negative = already past).
 * Extracts exact year, month, and day to prevent timezone day shifts.
 */
export function daysUntil(iso: string | Date | null | undefined): number | null {
  if (!iso) return null;
  let targetYear: number, targetMonth: number, targetDay: number;
  if (typeof iso === 'string') {
    const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      targetYear = Number(match[1]);
      targetMonth = Number(match[2]) - 1;
      targetDay = Number(match[3]);
    } else {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return null;
      targetYear = d.getUTCFullYear();
      targetMonth = d.getUTCMonth();
      targetDay = d.getUTCDate();
    }
  } else if (iso instanceof Date) {
    if (Number.isNaN(iso.getTime())) return null;
    targetYear = iso.getUTCFullYear();
    targetMonth = iso.getUTCMonth();
    targetDay = iso.getUTCDate();
  } else {
    return null;
  }

  const today = new Date();
  const todayReset = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const targetReset = new Date(targetYear, targetMonth, targetDay);

  const diffMs = targetReset.getTime() - todayReset.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/** Formats a date string (YYYY-MM-DD or ISO) into DD/MM/YYYY cleanly without timezone day shifts. */
export function formatDocDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  if (typeof iso === 'string') {
    const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, y, m, d] = match;
      return `${d}/${m}/${y}`;
    }
  }
  const dateObj = new Date(iso);
  if (Number.isNaN(dateObj.getTime())) return '—';
  const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getUTCDate()).padStart(2, '0');
  const y = dateObj.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

export type ExpiryStatus = 'expired' | 'critical' | 'warning' | 'valid' | 'none';

/**
 * Standard classification for expiry dates across the entire application:
 * - null/undefined: 'none'
 * - <= 0 days: 'expired'
 * - 1 to 7 days: 'critical' (renewal required this week)
 * - 8 to 30 days: 'warning' (due soon in 30d window)
 * - > 30 days: 'valid'
 */
export function getExpiryStatus(iso: string | Date | null | undefined): ExpiryStatus {
  const days = daysUntil(iso);
  if (days === null) return 'none';
  if (days <= 0) return 'expired';
  if (days <= 7) return 'critical';
  if (days <= 30) return 'warning';
  return 'valid';
}

export type SlotStatusCode = 'MISSING' | 'EXPIRED' | 'CRITICAL' | 'EXPIRING_SOON' | 'VALID' | 'NO_EXPIRY';

export interface SlotStatusInfo {
  code: SlotStatusCode;
  label: string;
  className: string;
  isAttention: boolean;
}

export const CENTRAL_SLOT_STATUS: Record<SlotStatusCode, SlotStatusInfo> = {
  MISSING: {
    code: 'MISSING',
    label: 'Missing',
    className: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    isAttention: true,
  },
  EXPIRED: {
    code: 'EXPIRED',
    label: 'Expired',
    className: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/50',
    isAttention: true,
  },
  CRITICAL: {
    code: 'CRITICAL',
    label: 'Critical <7d',
    className: 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800/40',
    isAttention: true,
  },
  EXPIRING_SOON: {
    code: 'EXPIRING_SOON',
    label: 'Due Soon',
    className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/50',
    isAttention: true,
  },
  VALID: {
    code: 'VALID',
    label: 'Valid',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/50',
    isAttention: false,
  },
  NO_EXPIRY: {
    code: 'NO_EXPIRY',
    label: 'No Expiry',
    className: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    isAttention: false,
  },
};

export function getSlotStatusFromDoc(doc: { expiry_date?: string | Date | null } | null | undefined): SlotStatusCode {
  if (!doc) return 'MISSING';
  const days = daysUntil(doc.expiry_date);
  if (days === null) return 'NO_EXPIRY';
  if (days <= 0) return 'EXPIRED';
  if (days <= 7) return 'CRITICAL';
  if (days <= 30) return 'EXPIRING_SOON';
  return 'VALID';
}

export function getOwnerCardSummary(slots: Array<{ status?: string; document?: any }>): {
  label: string;
  isCompliant: boolean;
  issuesCount: number;
  className: string;
} {
  if (!slots || slots.length === 0) {
    return {
      label: 'No Slots',
      isCompliant: true,
      issuesCount: 0,
      className: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
    };
  }

  let issuesCount = 0;
  for (const s of slots) {
    const code = (s.status as SlotStatusCode) || getSlotStatusFromDoc(s.document);
    if (code === 'MISSING' || code === 'EXPIRED' || code === 'CRITICAL' || code === 'EXPIRING_SOON') {
      issuesCount++;
    }
  }

  if (issuesCount === 0) {
    return {
      label: 'Compliant',
      isCompliant: true,
      issuesCount: 0,
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/50',
    };
  }

  return {
    label: `${issuesCount} Issue${issuesCount > 1 ? 's' : ''}`,
    isCompliant: false,
    issuesCount,
    className: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/50',
  };
}

/** Formats days remaining into human friendly badge text */
export function formatExpiryText(days: number | null): string {
  if (days === null) return 'No Expiry';
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  if (days <= 7) return `Critical: ${days}d left`;
  if (days <= 30) return `Due in ${days}d`;
  return `${days}d left`;
}

/**
 * Resolves a file_url to a valid browser URL regardless of environment or hardcoded localhost ports.
 */
/** A driver's profile photo URL, or undefined when none is on file (callers show initials). */
export function driverPhotoUrl(src: string | null | undefined): string | undefined {
  return resolveFileUrl(src) || undefined;
}

export function resolveFileUrl(fileUrl: string | null | undefined): string {
  if (!fileUrl) return '';

  const rawUrl = fileUrl.trim();

  // If stored file_url is legacy 'http://localhost:3000/uploads/xyz.jpg' or 'http://localhost:4000/uploads/xyz.jpg',
  // strip hardcoded origin so browser resolves it via current API origin/relative path!
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(rawUrl)) {
    try {
      const parsed = new URL(rawUrl);
      const apiBase = import.meta.env.VITE_API_URL || '';
      if (apiBase.startsWith('http')) {
        const apiOrigin = new URL(apiBase).origin;
        return `${apiOrigin}${parsed.pathname}`;
      }
      return parsed.pathname;
    } catch {
      // fallback
    }
  }

  // If relative path like '/uploads/file-123.jpg', attach API origin if VITE_API_URL is an absolute HTTP url
  if (rawUrl.startsWith('/')) {
    const apiBase = import.meta.env.VITE_API_URL || '';
    if (apiBase.startsWith('http')) {
      try {
        const apiOrigin = new URL(apiBase).origin;
        return `${apiOrigin}${rawUrl}`;
      } catch {
        // fallback
      }
    }
  }

  return rawUrl;
}

/**
 * Formats Issuing Authority to ensure both English and Arabic names are displayed.
 * e.g., "شركة ملاذ للتأمين" -> "Malath Insurance (شركة ملاذ للتأمين)"
 */
export function formatBilingualAuthority(raw: string | null | undefined): string {
  if (!raw) return 'Saudi Regulatory Authority';
  const text = raw.trim();
  const lower = text.toLowerCase();

  // Standard Saudi Transport Authorities Mappings
  if (text.includes('المرور') || lower.includes('traffic')) return 'Saudi Traffic Dept (المرور)';
  if (text.includes('الهيئة العامة للنقل') || lower.includes('transport general authority') || text.includes('TGA')) return 'Transport General Authority (الهيئة العامة للنقل)';
  if (text.includes('مركز سلامة المركبات') || lower.includes('vehicles safety center')) return 'Vehicles Safety Center (مركز سلامة المركبات)';
  if (text.includes('ملاذ') || lower.includes('malath')) return 'Malath Insurance (شركة ملاذ للتأمين)';
  if (text.includes('التعاونية') || lower.includes('tawuniya')) return 'Tawuniya Insurance (شركة التعاونية للتأمين)';
  if (text.includes('تكافل الراجحي') || lower.includes('rajhi')) return 'Al Rajhi Takaful (شركة تكافل الراجحي)';
  if (text.includes('ولاء') || lower.includes('walaa')) return 'Wala\'a Insurance (شركة ولاء للتأمين)';
  if (text.includes('ميدغلف') || lower.includes('medgulf')) return 'Medgulf Insurance (شركة ميدغلف للتأمين)';
  if (text.includes('رمز العاصمة') || lower.includes('capital symbol')) return 'Capital Symbol Motors (معرض رمز العاصمة للسيارات)';
  if (text.includes('حواجز القوة') || lower.includes('power barriers')) return 'Power Barriers Factory (مصنع حواجز القوة للصناعة)';

  const hasArabic = /[\u0600-\u06FF]/.test(text);
  const hasEnglish = /[a-zA-Z]/.test(text);

  // If text already has both Arabic and English script
  if (hasArabic && hasEnglish) {
    return text;
  }

  // If pure Arabic without English, provide smart category descriptor + Arabic
  if (hasArabic && !hasEnglish) {
    if (text.includes('تأمين')) return `Insurance Co. (${text})`;
    if (text.includes('معرض') || text.includes('سيارات')) return `Motors / Showroom (${text})`;
    if (text.includes('مصنع') || text.includes('صناعة')) return `Factory / Manufacturing (${text})`;
    if (text.includes('مركز') || text.includes('سلامة')) return `Safety Center (${text})`;
    if (text.includes('هيئة') || text.includes('وزارة')) return `Saudi Authority (${text})`;
    return `Authority (${text})`;
  }

  return text;
}

/**
 * Sorts folder summary rows so that folders needing attention
 * (EXPIRED slots first, EXPIRING_SOON slots second, MISSING slots third)
 * appear at the top of the list by default!
 */
export function sortFoldersByAttentionFirst<T extends { slots: Array<{ status: string }>; ownerName: string }>(folders: T[]): T[] {
  return [...folders].sort((a, b) => {
    const getScore = (row: T) => {
      let expiredCount = 0;
      let expiringCount = 0;
      let missingCount = 0;

      row.slots.forEach((s) => {
        if (s.status === 'EXPIRED') expiredCount++;
        else if (s.status === 'EXPIRING_SOON') expiringCount++;
        else if (s.status === 'MISSING') missingCount++;
      });

      if (expiredCount > 0) return 3000 + expiredCount;
      if (expiringCount > 0) return 2000 + expiringCount;
      if (missingCount > 0) return 1000 + missingCount;
      return 0;
    };

    const scoreA = getScore(a);
    const scoreB = getScore(b);

    if (scoreA !== scoreB) {
      return scoreB - scoreA; // Higher urgency score first
    }

    return a.ownerName.localeCompare(b.ownerName);
  });
}


