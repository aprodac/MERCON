import React from 'react';
import { SourceChip, SOURCE_TYPES_REGISTRY } from './chips';

export const SOURCE_CONFIG = SOURCE_TYPES_REGISTRY;

export function renderSourceBadge(sourceType?: string, sourceId?: string | null) {
  const links: Record<string, string> = {
    Invoice: '/finance/invoices',
    InvoicePayment: '/finance/invoices',
    Bill: '/finance/bills',
    BillPayment: '/finance/bills',
    Expense: '/finance/expenses',
    Advance: '/finance/advances',
    AdvanceApplication: '/finance/advances',
    BankTransfer: '/finance/bank-accounts',
  };

  const link = sourceType ? links[sourceType] : undefined;

  return <SourceChip type={sourceType} link={link} />;
}

