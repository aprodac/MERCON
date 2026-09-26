/**
 * Notification shape + display helpers shared by both apps. The driver API
 * (GET /mobile/notifications) and the operator API (GET /notifications)
 * return the same fields.
 */
import { TriangleAlert, Truck, FileText, Settings, Bell, type LucideIcon } from 'lucide-react-native';
import type { LanguageMode } from './language-context';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: string; // "Emergency" | "Trip" | "Document" | "System"
  is_read: boolean;
  entity_type?: string | null;
  entity_id?: string | null;
  createdAt: string;
}

/** lucide icon component for a notification type. */
export function notificationIcon(type: string): LucideIcon {
  switch (type.toLowerCase()) {
    case 'emergency': return TriangleAlert;
    case 'trip':
    case 'tripassigned':
    case 'tripstartingsoon':
    case 'tripcancelled':
    case 'tripreassigned':
    case 'tripdelayprompt':
      return Truck;
    case 'document': return FileText;
    case 'system': return Settings;
    default: return Bell;
  }
}

/** Relative "time ago" label from an ISO timestamp. */
export function timeAgo(iso: string, lang: LanguageMode = 'en'): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return lang === 'ur' ? 'ابھی ابھی' : 'Just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return lang === 'ur' ? `${mins} منٹ پہلے` : `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return lang === 'ur' ? `${hrs} گھنٹے پہلے` : `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return lang === 'ur' ? 'کل' : 'Yesterday';
  return lang === 'ur' ? `${days} دن پہلے` : `${days} days ago`;
}
