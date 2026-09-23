import React from 'react';
import { amountInWords, formatDate, formatMoney } from '@/lib/finance/format';
import type { Advance, Settings } from '@mercon/shared-types';

interface AdvancePrintVoucherProps {
  advance: Advance;
  settings?: Settings | null;
  onClose?: () => void;
}

export const AdvancePrintVoucher: React.FC<AdvancePrintVoucherProps> = ({
  advance,
  settings,
  onClose,
}) => {
  const isReceipt = advance.direction === 'Received';
  const voucherTitle = isReceipt ? 'RECEIPT VOUCHER' : 'PAYMENT VOUCHER';
  const partyLabel = advance.party_type === 'Customer' ? 'Received From' : 'Paid To';
  const partyName = advance.party?.name || (advance.party_id ? `ID: ${advance.party_id}` : 'General / Not Specified');
  const bankName = advance.account ? `${advance.account.name} (${advance.account.account_code})` : '—';
  const amountWords = amountInWords(advance.amount, advance.currency || 'SAR');

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      {/* Container with print styles */}
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-8 space-y-6 print:p-0 print:border-none print:shadow-none print:w-full print:max-w-none print:bg-white print:text-black">
        {/* Screen Top Bar */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4 print:hidden">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Print Preview</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            >
              Close
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-1.5 text-xs font-semibold bg-[#FA634E] hover:bg-[#E54D38] text-white rounded-lg shadow-sm"
            >
              Print Voucher
            </button>
          </div>
        </div>

        {/* Printable Voucher Paper */}
        <div className="space-y-6 text-slate-900 dark:text-slate-100 print:text-black">
          {/* Header */}
          <div className="flex items-start justify-between border-b-2 border-slate-900 dark:border-slate-100 pb-4 print:border-black">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 print:text-black">
                {settings?.companyLegalName || 'MERCON LOGISTICS'}
              </h1>
              {settings?.vatNumber && (
                <p className="text-xs text-slate-500 print:text-slate-700">VAT Reg No: {settings.vatNumber}</p>
              )}
            </div>
            <div className="text-right">
              <span className="text-lg font-black tracking-wider text-[#FA634E] print:text-black block">
                {voucherTitle}
              </span>
              <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 print:text-black">
                No: {advance.ref_id || advance.id.slice(0, 10)}
              </span>
            </div>
          </div>

          {/* Details Table Grid */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 print:border-slate-300 print:bg-white space-y-1">
              <span className="text-slate-500 print:text-slate-600 block font-semibold text-[11px] uppercase">Date</span>
              <span className="font-bold text-slate-900 dark:text-slate-100 print:text-black">{formatDate(advance.advance_date)}</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 print:border-slate-300 print:bg-white space-y-1">
              <span className="text-slate-500 print:text-slate-600 block font-semibold text-[11px] uppercase">{partyLabel}</span>
              <span className="font-bold text-slate-900 dark:text-slate-100 print:text-black">{partyName}</span>
            </div>
          </div>

          {/* Amount Box */}
          <div className="p-4 rounded-xl border-2 border-slate-900 dark:border-slate-100 print:border-black space-y-2 bg-slate-50/50 dark:bg-slate-800/20 print:bg-white">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 print:text-slate-700">Amount</span>
              <span className="font-mono text-2xl font-black text-slate-900 dark:text-slate-100 print:text-black">
                {formatMoney(advance.amount, { currency: advance.currency || 'SAR' })}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 print:border-slate-300 text-xs font-semibold italic text-slate-700 dark:text-slate-300 print:text-black">
              Amount in words: {amountWords}
            </div>
          </div>

          {/* Account & Memo */}
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2 print:border-slate-300">
              <span className="text-slate-500 print:text-slate-600 font-semibold">{isReceipt ? 'Deposited To' : 'Paid From'}</span>
              <span className="font-medium text-slate-900 dark:text-slate-100 print:text-black">{bankName}</span>
            </div>
            {advance.memo && (
              <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-2 print:border-slate-300">
                <span className="text-slate-500 print:text-slate-600 font-semibold">Memo / Purpose</span>
                <span className="font-medium text-slate-900 dark:text-slate-100 print:text-black max-w-md text-right">{advance.memo}</span>
              </div>
            )}
          </div>

          {/* Signature Lines */}
          <div className="pt-16 grid grid-cols-3 gap-8 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 print:text-black">
            <div className="border-t border-slate-400 dark:border-slate-600 print:border-black pt-2">
              Prepared By
            </div>
            <div className="border-t border-slate-400 dark:border-slate-600 print:border-black pt-2">
              Approved By
            </div>
            <div className="border-t border-slate-400 dark:border-slate-600 print:border-black pt-2">
              Receiver Signature
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
