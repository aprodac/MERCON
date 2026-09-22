import React, { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, X, FileText, CheckCircle2 } from 'lucide-react';
import { settingsService } from '@/services/settingsService';
import type { Invoice } from '@mercon/shared-types';

interface InvoicePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
}

export function InvoicePrintModal({
  isOpen,
  onClose,
  invoice,
}: InvoicePrintModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const { data: settings } = useQuery({
    queryKey: ['settings', 'public'],
    queryFn: () => settingsService.getPublic(),
  });

  if (!invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  const customer = (invoice as any).customer;
  const customerName = customer?.name || 'Valued Customer';
  const customerAddress = customer?.address || customer?.city || 'Saudi Arabia';
  const invoiceRef = invoice.ref_id || `INV-${invoice.id.slice(0, 8).toUpperCase()}`;
  const invoiceDateStr = invoice.invoice_date
    ? new Date(invoice.invoice_date).toLocaleDateString('en-GB')
    : new Date().toLocaleDateString('en-GB');
  const dueDateStr = invoice.due_date
    ? new Date(invoice.due_date).toLocaleDateString('en-GB')
    : 'Upon Receipt';

  const lines = invoice.lines || [];
  const totalAmount = Number(invoice.total_amount) || 0;
  const balanceDue = Number(invoice.balance_due) || 0;
  const taxAmount = Number(invoice.tax_amount) || 0;
  const taxRate = Number(invoice.tax_rate) || 0;
  const subtotal = Number((invoice as any).subtotal_amount) || (totalAmount - taxAmount);
  const paidAmount = totalAmount - balanceDue;

  const isPaid = balanceDue <= 0 && totalAmount > 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent hideCloseButton className="max-w-4xl p-0 bg-slate-950/60 backdrop-blur-md border border-slate-800 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col rounded-2xl">
        {/* Modal Top Actions Header (Screen only) */}
        <div className="px-4 py-3 bg-[#2D2B2C] text-white flex items-center justify-between border-b border-slate-800 shrink-0 print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="w-4.5 h-4.5 text-[#FA634E]" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-200">
              Tax Invoice Document Preview
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={handlePrint}
              className="h-8.5 px-4 text-xs font-bold bg-[#FA634E] hover:bg-[#DF4834] text-white rounded-xl gap-1.5 cursor-pointer shadow-md shadow-[#FA634E]/20 transition-all hover:scale-[1.01]"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Export PDF</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8.5 w-8.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl cursor-pointer transition-colors"
              title="Close Preview"
            >
              <X className="w-4.5 h-4.5" />
            </Button>
          </div>
        </div>

        {/* Scrollable Printable Document Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100 dark:bg-slate-950 flex justify-center">
          
          {/* THE OFFICIAL PRINTABLE PAPER DOCUMENT */}
          <div
            ref={printRef}
            className="w-full max-w-[210mm] bg-white text-slate-900 p-8 shadow-xl border border-slate-200 print:shadow-none print:border-0 print:p-0 print:m-0 font-sans text-xs space-y-5 relative"
            style={{ minHeight: '270mm' }}
          >
            {/* PAID Stamp / Watermark if fully settled */}
            {isPaid && (
              <div className="absolute top-12 right-12 border-4 border-emerald-600/30 text-emerald-600/40 rounded-xl px-4 py-1 text-2xl font-black uppercase tracking-widest rotate-[-12deg] pointer-events-none select-none flex items-center gap-1.5">
                <CheckCircle2 className="w-8 h-8" />
                <span>PAID</span>
              </div>
            )}

            {/* 1. OFFICIAL BILINGUAL BRANDING HEADER */}
            <div className="border-b-2 border-slate-900 pb-3 space-y-1">
              <div className="flex items-center justify-between">
                {/* Arabic Title */}
                <div className="text-right">
                  <h1 className="text-base font-black text-slate-900 leading-tight">
                    شركة ميركون
                  </h1>
                  <p className="text-[11px] font-bold text-slate-700">
                    للخدمات اللوجستية
                  </p>
                </div>

                {/* Center MERCON Logo */}
                <div className="flex flex-col items-center">
                  <img
                    src={settings?.logoUrl || '/invoice-logo.png'}
                    alt="MERCON Logo"
                    className="h-14 w-auto object-contain"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <span className="text-[10px] font-black tracking-widest text-[#FA634E] uppercase mt-1">
                    {settings?.appName || 'MERCON LOGISTICS'}
                  </span>
                </div>

                {/* English Title */}
                <div className="text-left">
                  <h1 className="text-base font-black text-[#FA634E] tracking-tight leading-tight">
                    MERCON LOGISTICS
                  </h1>
                  <p className="text-[11px] font-bold text-slate-800 tracking-wider">
                    SERVICES COMPANY
                  </p>
                </div>
              </div>

              {/* Sub-header C.R & VAT NO. */}
              <div className="text-center text-[10px] font-mono font-bold text-slate-700 pt-1 border-t border-slate-300">
                C.R NO. 1009152862 | VAT NO. 31270921580003
              </div>
            </div>

            {/* Document Type Heading */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div>
                <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                  TAX INVOICE / فاتورة ضريبية
                </h2>
                <p className="text-[11px] text-slate-500 font-mono">
                  Ref: <strong className="text-[#FA634E] font-bold">{invoiceRef}</strong>
                </p>
              </div>
              <div className="text-right">
                <span className={`inline-block px-3 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                  isPaid ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`}>
                  {invoice.status}
                </span>
              </div>
            </div>

            {/* 2. CUSTOMER & INVOICE REFERENCE BOX */}
            <table className="w-full border-collapse border border-slate-900 text-xs">
              <tbody>
                <tr className="border-b border-slate-900">
                  <td className="p-2 font-bold border-r border-slate-900 bg-slate-50 w-7/12">
                    <span className="text-slate-500 font-normal text-[10px] block uppercase">Billed To / العميل:</span>
                    <span className="text-sm font-black text-slate-900">{customerName}</span>
                  </td>
                  <td className="p-2 border-r border-slate-900 font-bold bg-slate-50 w-2/12">Invoice Date:</td>
                  <td className="p-2 font-mono font-semibold w-3/12">{invoiceDateStr}</td>
                </tr>
                <tr className="border-b border-slate-900">
                  <td className="p-2 border-r border-slate-900">
                    <span className="font-semibold text-slate-600">Location / Address: </span>
                    {customerAddress}
                  </td>
                  <td className="p-2 border-r border-slate-900 font-bold bg-slate-50">Due Date:</td>
                  <td className="p-2 font-mono font-bold text-slate-900">{dueDateStr}</td>
                </tr>
                <tr>
                  <td className="p-2 border-r border-slate-900">
                    <span className="font-semibold text-slate-600">Payment Status: </span>
                    <span className="font-bold">{isPaid ? 'Fully Settled (SAR 0.00 Due)' : `Outstanding (SAR ${balanceDue.toFixed(2)} Due)`}</span>
                  </td>
                  <td className="p-2 border-r border-slate-900 font-bold bg-slate-50">Currency:</td>
                  <td className="p-2 font-mono font-bold text-[#FA634E]">SAR (Saudi Riyal)</td>
                </tr>
              </tbody>
            </table>

            {/* 3. ITEMIZATION TABLE */}
            <table className="w-full border-collapse border border-slate-900 text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-900">
                  <th className="p-2 border-r border-slate-900 text-center font-bold w-12">#</th>
                  <th className="p-2 border-r border-slate-900 text-left font-bold">Description / Details</th>
                  <th className="p-2 border-r border-slate-900 text-center font-bold w-20">Qty</th>
                  <th className="p-2 border-r border-slate-900 text-right font-bold w-28">Rate (SAR)</th>
                  <th className="p-2 text-right font-bold w-32">Amount (SAR)</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-slate-400 italic">
                      No invoice line items specified.
                    </td>
                  </tr>
                ) : (
                  lines.map((line, idx) => {
                    const qty = Number(line.quantity) || 1;
                    const rate = Number(line.rate) || Number(line.amount) / qty || 0;
                    const lineAmt = Number(line.amount) || 0;

                    return (
                      <tr key={line.id || idx} className="border-b border-slate-900 hover:bg-slate-50">
                        <td className="p-2 border-r border-slate-900 text-center font-mono text-slate-500">{idx + 1}</td>
                        <td className="p-2 border-r border-slate-900 font-semibold text-slate-800">{line.description}</td>
                        <td className="p-2 border-r border-slate-900 text-center font-mono">{qty}</td>
                        <td className="p-2 border-r border-slate-900 text-right font-mono">{rate.toFixed(2)}</td>
                        <td className="p-2 text-right font-mono font-bold text-slate-900">{lineAmt.toFixed(2)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* 4. FINANCIAL BREAKDOWN & TOTALS SUMMARY */}
            <div className="flex justify-end pt-2">
              <div className="w-72 border border-slate-900 divide-y divide-slate-900 text-xs">
                <div className="flex justify-between p-2 bg-slate-50">
                  <span className="font-semibold text-slate-700">Subtotal:</span>
                  <span className="font-mono font-bold text-slate-900">SAR {subtotal.toFixed(2)}</span>
                </div>
                {taxRate > 0 && (
                  <div className="flex justify-between p-2 bg-slate-50">
                    <span className="font-semibold text-slate-700">VAT ({taxRate}%):</span>
                    <span className="font-mono font-bold text-slate-900">SAR {taxAmount.toFixed(2)}</span>
                  </div>
                )}
                {taxRate === 0 && taxAmount > 0 && (
                  <div className="flex justify-between p-2 bg-slate-50">
                    <span className="font-semibold text-slate-700">VAT Tax:</span>
                    <span className="font-mono font-bold text-slate-900">SAR {taxAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between p-2 bg-slate-900 text-white font-bold">
                  <span>Grand Total:</span>
                  <span className="font-mono text-sm text-[#FA634E]">SAR {totalAmount.toFixed(2)}</span>
                </div>
                {paidAmount > 0 && (
                  <div className="flex justify-between p-2 bg-emerald-50 text-emerald-800 font-semibold">
                    <span>Amount Paid:</span>
                    <span className="font-mono font-bold">SAR {paidAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between p-2 bg-slate-100 font-bold">
                  <span className="text-slate-900">Balance Due:</span>
                  <span className="font-mono text-slate-900 text-sm">SAR {balanceDue.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* 5. TERMS & CONDITIONS SECTION */}
            <div className="pt-3 space-y-1.5 text-[11px] text-slate-800">
              <h3 className="font-bold italic text-slate-900 underline text-xs">
                Terms and Payment Instructions / الشروط والأحكام
              </h3>
              <ul className="list-disc pl-5 space-y-1 italic text-slate-700 leading-tight">
                <li>Payment is due according to agreed credit terms from the invoice date.</li>
                <li>All bank charges for transfer to be borne by the customer.</li>
                <li>Please quote invoice reference number <strong className="font-bold text-slate-900">{invoiceRef}</strong> when making payment.</li>
                <li>This is an official Tax Invoice generated by MERCON Logistics Operating Platform.</li>
              </ul>
            </div>

            {/* Footer Signature Strip */}
            <div className="pt-8 border-t border-slate-300 flex justify-between text-[11px] font-bold text-slate-700">
              <div>
                <p>Issued By: ___________________</p>
                <p className="text-[9px] font-normal text-slate-500 mt-1">MERCON Logistics Finance Dept</p>
              </div>
              <div className="text-right">
                <p>Received / Accepted By: ___________________</p>
                <p className="text-[9px] font-normal text-slate-500 mt-1">Authorized Customer Signature & Stamp</p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>

      {/* Embedded CSS Print Stylesheet */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:hidden {
            display: none !important;
          }
          [data-slot="dialog-content"] {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            background: white !important;
            box-shadow: none !important;
          }
          ${printRef.current ? `div[ref] { visibility: visible; }` : ''}
          .print\\:shadow-none {
            box-shadow: none !important;
          }
        }
      `}</style>
    </Dialog>
  );
}
