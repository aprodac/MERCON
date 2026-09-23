import React from 'react';
import { Link } from 'react-router-dom';
import {
  PenLine,
  ReceiptText,
  BadgeDollarSign,
  FileText,
  CreditCard,
  Wallet,
  HandCoins,
  ArrowRightLeft,
  Building2,
  Truck,
  Lock,
  Upload,
  HelpCircle,
} from 'lucide-react';

export interface SourceTypeConfig {
  icon: React.ElementType;
  label: string;
  dotClass: string;
  link?: (id?: string | null) => string;
}

export const SOURCE_CONFIG: Record<string, SourceTypeConfig> = {
  Manual: { icon: PenLine, label: 'Manual', dotClass: 'bg-amber-500' },
  Invoice: { icon: ReceiptText, label: 'Invoice', dotClass: 'bg-sky-500', link: () => `/finance/invoices` },
  InvoicePayment: { icon: BadgeDollarSign, label: 'Invoice payment', dotClass: 'bg-emerald-500', link: () => `/finance/invoices` },
  Bill: { icon: FileText, label: 'Bill', dotClass: 'bg-purple-500', link: () => `/finance/bills` },
  BillPayment: { icon: CreditCard, label: 'Bill payment', dotClass: 'bg-indigo-500', link: () => `/finance/bills` },
  Expense: { icon: Wallet, label: 'Expense', dotClass: 'bg-rose-500', link: () => `/finance/expenses` },
  Advance: { icon: HandCoins, label: 'Advance', dotClass: 'bg-[#FA634E]', link: () => `/finance/advances` },
  AdvanceApplication: { icon: ArrowRightLeft, label: 'Advance applied', dotClass: 'bg-teal-500', link: () => `/finance/advances` },
  BankTransfer: { icon: Building2, label: 'Bank transfer', dotClass: 'bg-blue-600', link: () => `/finance/bank-accounts` },
  TripSubcontract: { icon: Truck, label: 'Trip subcontract', dotClass: 'bg-orange-500' },
  FiscalYearClosing: { icon: Lock, label: 'Year-end closing', dotClass: 'bg-slate-600' },
  IMPORT: { icon: Upload, label: 'Import', dotClass: 'bg-violet-500' },
};

export function renderSourceBadge(sourceType?: string, sourceId?: string | null) {
  const config = SOURCE_CONFIG[sourceType || ''] || {
    icon: HelpCircle,
    label: sourceType || 'System',
    dotClass: 'bg-slate-400',
  };
  const Icon = config.icon;
  const link = config.link?.(sourceId);

  const badgeContent = (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/90 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/80 transition-all shrink-0 shadow-2xs">
      <span className={`w-2 h-2 rounded-full shrink-0 ${config.dotClass}`} />
      <Icon className="w-3 h-3 text-slate-500 dark:text-slate-400" />
      {config.label}
    </span>
  );

  if (link) {
    return (
      <Link to={link} onClick={(e) => e.stopPropagation()}>
        {badgeContent}
      </Link>
    );
  }

  return badgeContent;
}
