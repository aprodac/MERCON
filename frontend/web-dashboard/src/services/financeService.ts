import { api } from '@/lib/api';
import type { Account, AccountingPeriod, JournalEntry, AccountType, PeriodStatus, JournalEntryStatus } from '@mercon/shared-types';

export interface GetAccountsParams {
  type?: AccountType | 'all';
  search?: string;
  include_inactive?: boolean;
  tree?: boolean;
}

export interface CreateAccountDTO {
  account_code: string;
  name: string;
  account_type: AccountType;
  parentId?: string | null;
  description?: string | null;
  is_postable?: boolean;
  isActive?: boolean;
}

export interface CreateAccountingPeriodDTO {
  name: string;
  start_date: string;
  end_date: string;
}

export interface JournalLineDTO {
  accountId: string;
  debit: number;
  credit: number;
  currency?: string;
  description?: string | null;
}

export interface CreateJournalEntryDTO {
  entry_date: string;
  memo?: string | null;
  periodId: string;
  source_type?: string;
  source_id?: string | null;
  lines: JournalLineDTO[];
}

export const financeService = {
  // Accounts
  getAccounts: async (params?: GetAccountsParams) => {
    const response = await api.get('/accounts', { params });
    return response.data;
  },

  getAccountById: async (id: string) => {
    const response = await api.get(`/accounts/${id}`);
    return response.data;
  },

  createAccount: async (data: CreateAccountDTO) => {
    const response = await api.post('/accounts', data);
    return response.data;
  },

  updateAccount: async (id: string, data: Partial<CreateAccountDTO>) => {
    const response = await api.patch(`/accounts/${id}`, data);
    return response.data;
  },

  deleteAccount: async (id: string) => {
    const response = await api.delete(`/accounts/${id}`);
    return response.data;
  },

  // Accounting Periods
  getAccountingPeriods: async (params?: { status?: PeriodStatus | 'all' }) => {
    const response = await api.get('/accounting-periods', { params });
    return response.data;
  },

  createAccountingPeriod: async (data: CreateAccountingPeriodDTO) => {
    const response = await api.post('/accounting-periods', data);
    return response.data;
  },

  closeAccountingPeriod: async (id: string) => {
    const response = await api.post(`/accounting-periods/${id}/close`);
    return response.data;
  },

  lockAccountingPeriod: async (id: string) => {
    const response = await api.post(`/accounting-periods/${id}/lock`);
    return response.data;
  },

  // Journal Entries
  getJournalEntries: async (params?: {
    period_id?: string;
    status?: JournalEntryStatus | 'all';
    source_type?: string;
    account_id?: string;
    date_from?: string;
    date_to?: string;
    search?: string;
    page?: number;
    per_page?: number;
  }) => {
    const response = await api.get('/journal-entries', { params });
    return response.data;
  },

  getJournalEntryById: async (id: string) => {
    const response = await api.get(`/journal-entries/${id}`);
    return response.data;
  },

  createDraftJournalEntry: async (data: CreateJournalEntryDTO) => {
    const response = await api.post('/journal-entries', data);
    return response.data;
  },

  updateDraftJournalEntry: async (id: string, data: Partial<CreateJournalEntryDTO>) => {
    const response = await api.patch(`/journal-entries/${id}`, data);
    return response.data;
  },

  deleteDraftJournalEntry: async (id: string) => {
    const response = await api.delete(`/journal-entries/${id}`);
    return response.data;
  },

  postJournalEntry: async (id: string) => {
    const response = await api.post(`/journal-entries/${id}/post`);
    return response.data;
  },

  voidJournalEntry: async (id: string, memo?: string) => {
    const response = await api.post(`/journal-entries/${id}/void`, { memo });
    return response.data;
  },
};
