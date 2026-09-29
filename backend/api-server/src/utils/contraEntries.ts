/**
 * Contra entries are the BankTransfer journal entries (cashBankEngine.transferFunds). This reads
 * one back as a transfer: which bank/cash account it left, which it reached, the amount, any bank
 * charges, and its type — worked out from the two accounts, never stored.
 */

export type ContraType = 'deposit' | 'withdrawal' | 'bank_to_bank' | 'cash_to_cash';
export const CONTRA_TYPES: ContraType[] = ['deposit', 'withdrawal', 'bank_to_bank', 'cash_to_cash'];

export interface ContraSide {
  account_id: string;
  bank_account_id: string | null;
  name: string;
  code: string;
  is_cash: boolean;
}

export interface ContraLineInput {
  accountId: string;
  debit: number | string | { toString(): string };
  credit: number | string | { toString(): string };
  account?: { account_code: string; name: string } | null;
}

export interface BankLookup {
  id: string;
  accountId: string;
  is_cash: boolean;
  bank_name: string | null;
}

export interface ContraShape {
  from: ContraSide | null;
  to: ContraSide | null;
  amount: number;
  charges: number;
  type: ContraType | null;
}

const num = (v: ContraLineInput['debit']) => Number(v?.toString() ?? 0) || 0;

export function contraType(fromCash: boolean, toCash: boolean): ContraType {
  if (fromCash && !toCash) return 'deposit';
  if (!fromCash && toCash) return 'withdrawal';
  return fromCash ? 'cash_to_cash' : 'bank_to_bank';
}

/**
 * The destination is the bank/cash line with a debit; the source is the bank/cash line credited
 * that isn't the destination (a deposit's fee credits the destination bank). Debits to anything
 * that isn't a bank/cash account are bank charges.
 */
export function readContra(lines: ContraLineInput[], banks: Map<string, BankLookup>): ContraShape {
  const side = (l: ContraLineInput): ContraSide => {
    const b = banks.get(l.accountId);
    return {
      account_id: l.accountId,
      bank_account_id: b?.id ?? null,
      name: b ? (b.is_cash ? b.bank_name || l.account?.name || 'Cash' : b.bank_name || l.account?.name || 'Bank') : l.account?.name ?? 'Account',
      code: l.account?.account_code ?? '',
      is_cash: Boolean(b?.is_cash),
    };
  };
  // Older transfers could use any account: a debit line that isn't a bank still counts as "to" when no bank is debited
  const debits = lines.filter((l) => num(l.debit) > 0);
  const toLine = debits.find((l) => banks.has(l.accountId)) ?? debits[0];
  const fromLine = lines.find((l) => num(l.credit) > 0 && l.accountId !== toLine?.accountId);
  const charges = debits.filter((l) => l !== toLine && !banks.has(l.accountId)).reduce((t, l) => t + num(l.debit), 0);
  const from = fromLine ? side(fromLine) : null;
  const to = toLine ? side(toLine) : null;
  return {
    from,
    to,
    amount: toLine ? num(toLine.debit) : 0,
    charges: Math.round(charges * 100) / 100,
    type: from && to ? contraType(from.is_cash, to.is_cash) : null,
  };
}
