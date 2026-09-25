import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  ReceiptText,
  BadgeDollarSign,
  CreditCard,
  Wallet,
  HandCoins,
  ArrowRightLeft,
  Building2,
  Truck,
  Lock,
  Upload,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  Check,
  XCircle,
  LucideIcon,
} from 'lucide-react';
import { Chip, type ChipTone } from '@/components/ui/chip';
import { formatDate } from './format';
import { FinKind, StatusDocParams, getDisplayStatus } from './status';

export interface RegistryItem {
  label: string;
  tone: ChipTone;
  icon?: LucideIcon;
  variant?: 'soft' | 'solid' | 'outline';
}

// ── 1. FIN_STATUS REGISTRY ──────────────────────────────────────────────────
export const FIN_STATUS_REGISTRY: Record<string, RegistryItem> = {
  // General & Journal Entry Statuses
  Draft: { label: 'Draft', tone: 'warning', icon: AlertCircle },
  Posted: { label: 'Posted', tone: 'positive', icon: CheckCircle2 },
  Voided: { label: 'Voided', tone: 'negative', icon: XCircle },
  Void: { label: 'Void', tone: 'negative', icon: XCircle },

  // Invoice & Bill Statuses
  Issued: { label: 'Issued', tone: 'info', icon: FileText },
  Approved: { label: 'Approved', tone: 'info', icon: CheckCircle2 },
  PartiallyPaid: { label: 'Partially Paid', tone: 'warning', icon: Clock },
  Paid: { label: 'Paid', tone: 'positive', icon: CheckCircle2 },

  // Advance Statuses
  Open: { label: 'Open', tone: 'info', icon: Clock },
  PartiallyApplied: { label: 'Partially Applied', tone: 'warning', icon: Clock },
  FullyApplied: { label: 'Fully Applied', tone: 'positive', icon: CheckCircle2 },

  // Account & Period Statuses
  Active: { label: 'Active', tone: 'positive', icon: CheckCircle2 },
  Inactive: { label: 'Inactive', tone: 'neutral', icon: XCircle },
  Closed: { label: 'Closed', tone: 'neutral', icon: Lock },
};

export function StatusChip({
  kind,
  status,
  doc,
  today,
  className,
}: {
  kind?: FinKind | string;
  status?: string | null;
  doc?: StatusDocParams;
  today?: Date;
  className?: string;
}) {
  let effectiveStatus = status;
  if (kind && doc && (kind === 'invoice' || kind === 'bill' || kind === 'journal' || kind === 'period' || kind === 'advance' || kind === 'reconciliation')) {
    effectiveStatus = getDisplayStatus(kind as FinKind, doc, today);
  } else if (!effectiveStatus && doc?.status) {
    effectiveStatus = doc.status;
  }
  if (!effectiveStatus) return null;
  const config = FIN_STATUS_REGISTRY[effectiveStatus] || { label: effectiveStatus, tone: 'neutral' as ChipTone };
  return (
    <Chip tone={config.tone} icon={config.icon} variant={config.variant || 'soft'} className={className}>
      {config.label}
    </Chip>
  );
}

// ── 2. SOURCE_TYPES REGISTRY ────────────────────────────────────────────────
export const SOURCE_TYPES_REGISTRY: Record<string, RegistryItem> = {
  Manual: { label: 'Manual Journal', tone: 'warning', icon: FileText },
  Invoice: { label: 'Customer Invoice', tone: 'info', icon: ReceiptText },
  InvoicePayment: { label: 'Invoice Payment', tone: 'positive', icon: BadgeDollarSign },
  Bill: { label: 'Vendor Bill', tone: 'violet', icon: CreditCard },
  BillPayment: { label: 'Bill Payment', tone: 'violet', icon: Wallet },
  Expense: { label: 'Expense Claim', tone: 'negative', icon: HandCoins },
  Advance: { label: 'Advance', tone: 'brand', icon: ArrowRightLeft },
  AdvanceApplication: { label: 'Advance Application', tone: 'teal', icon: ArrowRightLeft },
  BankTransfer: { label: 'Bank Transfer', tone: 'info', icon: Building2 },
  TripSubcontract: { label: 'Trip Subcontract', tone: 'orange', icon: Truck },
  FiscalYearClosing: { label: 'Year Closing', tone: 'neutral', icon: Lock },
  IMPORT: { label: 'Import', tone: 'violet', icon: Upload },
};

export function SourceChip({
  type,
  link,
  className,
}: {
  type?: string | null;
  link?: string;
  className?: string;
}) {
  if (!type) return null;
  const config = SOURCE_TYPES_REGISTRY[type] || { label: type, tone: 'neutral' as ChipTone };
  const chip = (
    <Chip tone={config.tone} icon={config.icon} className={className} asChild={Boolean(link)}>
      {link ? <Link to={link}>{config.label}</Link> : config.label}
    </Chip>
  );
  return chip;
}

// ── 3. PARTY_TYPES REGISTRY ─────────────────────────────────────────────────
export const PARTY_TYPES_REGISTRY: Record<string, RegistryItem> = {
  Customer: { label: 'Customer', tone: 'info', icon: User },
  Provider: { label: 'Supplier / Provider', tone: 'violet', icon: Building2 },
  Employee: { label: 'Employee', tone: 'teal', icon: User },
};

export function PartyChip({
  type,
  name,
  className,
}: {
  type: 'Customer' | 'Provider' | 'Employee' | string;
  name?: string;
  className?: string;
}) {
  const config = PARTY_TYPES_REGISTRY[type] || { label: type, tone: 'neutral' as ChipTone };
  const labelText = name ? `${name} (${config.label})` : config.label;
  return (
    <Chip tone={config.tone} icon={config.icon} className={className} truncate={220}>
      {labelText}
    </Chip>
  );
}

// ── 4. DIRECTIONS REGISTRY ──────────────────────────────────────────────────
export const DIRECTIONS_REGISTRY: Record<string, RegistryItem> = {
  Received: { label: 'Received (In)', tone: 'positive', icon: ArrowDownLeft },
  In: { label: 'Money In', tone: 'positive', icon: ArrowDownLeft },
  Paid: { label: 'Paid (Out)', tone: 'orange', icon: ArrowUpRight },
  Out: { label: 'Money Out', tone: 'orange', icon: ArrowUpRight },
};

export function DirectionChip({
  direction,
  className,
}: {
  direction?: string | null;
  className?: string;
}) {
  if (!direction) return null;
  const config = DIRECTIONS_REGISTRY[direction] || { label: direction, tone: 'neutral' as ChipTone };
  return (
    <Chip tone={config.tone} icon={config.icon} className={className}>
      {config.label}
    </Chip>
  );
}

// ── 5. AGEING_BUCKETS REGISTRY ──────────────────────────────────────────────
export const AGEING_BUCKETS_REGISTRY: Record<string, RegistryItem> = {
  current: { label: 'Current', tone: 'positive' },
  '1-30': { label: '1–30 days', tone: 'warning' },
  '31-60': { label: '31–60 days', tone: 'orange' },
  '61-90': { label: '61–90 days', tone: 'negative' },
  '90+': { label: '>90 days', tone: 'negative', variant: 'solid' },
};

export function BucketChip({
  bucket,
  className,
}: {
  bucket: 'current' | '1-30' | '31-60' | '61-90' | '90+' | string;
  className?: string;
}) {
  const config = AGEING_BUCKETS_REGISTRY[bucket] || { label: bucket, tone: 'neutral' as ChipTone };
  return (
    <Chip tone={config.tone} variant={config.variant || 'soft'} className={className}>
      {config.label}
    </Chip>
  );
}

// ── 6. ENTRY_SIDE (AccountChip) ──────────────────────────────────────────────
export function AccountChip({
  side,
  name,
  code,
  truncate,
  className,
}: {
  side: 'debit' | 'credit';
  name: string;
  code?: string;
  truncate?: number;
  className?: string;
}) {
  const isDebit = side === 'debit';
  const tone: ChipTone = isDebit ? 'positive' : 'warning';
  const prefix = isDebit ? 'Dr' : 'Cr';
  const displayText = code ? `${prefix} · ${code} ${name}` : `${prefix} · ${name}`;

  return (
    <Chip tone={tone} className={className} truncate={truncate}>
      {displayText}
    </Chip>
  );
}

// ── 7. RECON_STATE REGISTRY ──────────────────────────────────────────────────
export function ReconChip({
  lastDate,
  className,
}: {
  lastDate?: string | null;
  className?: string;
}) {
  if (!lastDate) {
    return (
      <Chip tone="neutral" icon={Clock} className={className}>
        Never reconciled
      </Chip>
    );
  }

  const recDate = new Date(lastDate);
  const diffDays = Math.floor((new Date().getTime() - recDate.getTime()) / (1000 * 60 * 60 * 24));
  const tone: ChipTone = diffDays <= 30 ? 'positive' : 'warning';

  return (
    <Chip tone={tone} icon={CheckCircle2} className={className}>
      Reconciled to {formatDate(lastDate)}
    </Chip>
  );
}
