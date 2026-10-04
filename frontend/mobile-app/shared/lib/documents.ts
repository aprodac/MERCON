/** Driver documents — GET /mobile/documents. */
import { useCallback, useEffect, useState } from 'react';
import { IdCard, Truck, ShieldCheck, ReceiptText, FileText, type LucideIcon } from 'lucide-react-native';
import { api, getApiErrorMessage } from './api';

export interface DriverDocument {
  id: string;
  doc_type: string;
  documentType?: { name: string } | null;
  status: string;
  file_url: string;
  mime_type: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  trip_ref_id?: string | null;
  createdAt?: string | null;
  ai_extracted_json?: {
    leg_index?: number;
    operation?: string;
    gps?: { latitude: number; longitude: number; captured_at?: string };
  } | null;
  ocr_raw_text?: string | null;
}

export function docTypeLabel(t: string): string {
  switch (t) {
    case 'DriverLicense': return 'Driving License';
    case 'VehicleRegistration': return 'Vehicle Registration';
    case 'Insurance': return 'Insurance';
    case 'POD': return 'Proof of Delivery (POD)';
    case 'CustomsClearance': return 'Customs Clearance';
    case 'Waybill': return 'Cargo Pickup Photo';
    case 'Contract': return 'Contract';
    case 'Invoice': return 'Invoice';
    default: return t;
  }
}

/**
 * Translation key for a document name the office uses (DocumentType.name, or
 * the doc type when there is none), so Urdu shows "پاسپورٹ" instead of
 * "Passport". Names the app doesn't know are shown as the office wrote them.
 */
const DOC_NAME_KEYS: Record<string, string> = {
  passport: 'doc_name_passport',
  iqama: 'doc_name_iqama',
  'resident id': 'doc_name_iqama',
  'driver license': 'doc_name_driving_licence',
  'driver licence': 'doc_name_driving_licence',
  'driving license': 'doc_name_driving_licence',
  'driving licence': 'doc_name_driving_licence',
  driverlicense: 'doc_name_driving_licence',
  'driver card': 'doc_name_driver_card',
  'vehicle registration': 'doc_name_vehicle_registration',
  vehicleregistration: 'doc_name_vehicle_registration',
  insurance: 'doc_name_insurance',
};

export function docNameKey(doc: Pick<DriverDocument, 'doc_type' | 'documentType'>): { key: string | null; name: string } {
  const name = doc.documentType?.name || docTypeLabel(doc.doc_type);
  const key = DOC_NAME_KEYS[name.trim().toLowerCase()] ?? DOC_NAME_KEYS[(doc.doc_type || '').toLowerCase()] ?? null;
  return { key, name };
}

export function docIcon(t: string): LucideIcon {
  switch (t) {
    case 'DriverLicense': return IdCard;
    case 'VehicleRegistration': return Truck;
    case 'Insurance': return ShieldCheck;
    case 'Invoice': return ReceiptText;
    default: return FileText;
  }
}

export type DocKind = 'valid' | 'expiring' | 'expired' | 'pending';

/** A document within this many days of its expiry date shows "Expires soon". */
export const DOC_EXPIRING_SOON_DAYS = 30;

/**
 * Whole days from today to the expiry date (negative once expired). The expiry
 * is a calendar date stored as midnight UTC, and a document is still valid on
 * its expiry day.
 */
export function daysUntilExpiry(expiry: string, now: Date = new Date()): number | null {
  const d = new Date(expiry);
  if (Number.isNaN(d.getTime())) return null;
  const expiryDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((expiryDay - today) / 86400000);
}

/**
 * What the driver sees on a document. Expiry wins: an expired document is
 * "Expired" whether or not the office has reviewed it (a pending review used
 * to hide an Iqama that had expired weeks before). `labelKey` is the
 * translation key for `label`.
 */
export function docStatus(doc: DriverDocument, now: Date = new Date()): { label: string; labelKey: string; kind: DocKind } {
  const days = doc.expiry_date ? daysUntilExpiry(doc.expiry_date, now) : null;
  if ((days !== null && days < 0) || doc.status === 'Expired') return { label: 'Expired', labelKey: 'status_expired', kind: 'expired' };
  if (days !== null && days <= DOC_EXPIRING_SOON_DAYS) return { label: 'Expires soon', labelKey: 'status_expires_soon', kind: 'expiring' };
  if (doc.status === 'Rejected') return { label: 'Rejected', labelKey: 'status_rejected', kind: 'expired' };
  if (doc.status === 'PendingReview') return { label: 'Pending Review', labelKey: 'status_pending_review', kind: 'pending' };
  return { label: 'Valid', labelKey: 'label_valid', kind: 'valid' };
}

export function useDocuments() {
  const [documents, setDocuments] = useState<DriverDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/mobile/documents');
      setDocuments((data.data ?? []) as DriverDocument[]);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { documents, loading, error, refetch };
}

export function useCargoPodPhotos() {
  const [photos, setPhotos] = useState<DriverDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/mobile/cargo-pod-photos');
      setPhotos((data.data ?? []) as DriverDocument[]);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { photos, loading, error, refetch };
}
