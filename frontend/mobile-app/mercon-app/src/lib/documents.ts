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

/** Display status derived from expiry (<=30d = expiring), with backend status overrides. */
export function docStatus(doc: DriverDocument): { label: string; kind: DocKind } {
  if (doc.status === 'Rejected') return { label: 'Rejected', kind: 'expired' };
  if (doc.status === 'PendingReview') return { label: 'Pending Review', kind: 'pending' };
  if (doc.expiry_date) {
    const days = Math.floor((new Date(doc.expiry_date).getTime() - Date.now()) / 86400000);
    if (days < 0) return { label: 'Expired', kind: 'expired' };
    if (days <= 30) return { label: 'Expiring Soon', kind: 'expiring' };
  }
  return { label: 'Valid', kind: 'valid' };
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
