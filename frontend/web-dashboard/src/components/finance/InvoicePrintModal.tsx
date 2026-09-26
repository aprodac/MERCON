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
  const customerVatRegNo = customer?.tax_id || customer?.vat_number || customer?.vat_reg_no || '';
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
  const taxRate = Number(invoice.tax_rate) || 15;
  const subtotal = Number((invoice as any).subtotal_amount) || (totalAmount - taxAmount);

  const isPaid = balanceDue <= 0 && totalAmount > 0;

  const companyVatNumber = settings?.vatNumber || '312709215800003';
  const companyCrNumber = settings?.crNumber || '1009152862';

  const headerSubLine = [
    companyCrNumber ? `C.R NO. ${companyCrNumber}` : null,
    companyVatNumber ? `VAT NO.${companyVatNumber}` : null,
  ].filter(Boolean).join(' | ');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent hideCloseButton className="max-w-4xl p-0 bg-charcoal-strong/60 backdrop-blur-md border border-border shadow-2xl overflow-hidden max-h-[92vh] flex flex-col rounded-xl">
        {/* Modal Top Actions Header (Screen only) */}
        <div className="px-4 py-3 bg-[#2D2B2C] text-white flex items-center justify-between border-b border-border shrink-0 print:hidden">
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
              className="h-8.5 w-8.5 text-muted-foreground hover:text-white hover:bg-slate-800 rounded-xl cursor-pointer transition-colors"
              title="Close Preview"
            >
              <X className="w-4.5 h-4.5" />
            </Button>
          </div>
        </div>

        {/* Scrollable Printable Document Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-muted flex justify-center">
          
          {/* THE OFFICIAL PRINTABLE PAPER DOCUMENT */}
          <div
            ref={printRef}
            className="w-full max-w-[210mm] bg-card text-foreground p-8 shadow-xl border border-border print:shadow-none print:border-0 print:p-0 print:m-0 font-sans text-xs space-y-4 relative"
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
            <div className="border-b-2 border-border pb-2 space-y-1">
              <div className="flex items-center justify-between">
                {/* Arabic Title */}
                <div className="text-right">
                  <h1 className="text-lg font-black text-[#E8450F] leading-tight">
                    شركة ميركون
                  </h1>
                  <p className="text-[11px] font-bold text-foreground">
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
                </div>

                {/* English Title */}
                <div className="text-left">
                  <h1 className="text-lg font-black text-[#FA634E] tracking-tight leading-tight">
                    MERCON LOGISTICS
                  </h1>
                  <p className="text-[11px] font-bold text-foreground tracking-wider">
                    SERVICES COMPANY
                  </p>
                </div>
              </div>

              {/* Sub-header C.R & VAT NO. */}
              {headerSubLine && (
                <div className="text-center text-[10px] font-mono font-bold text-foreground pt-1 border-t border-border">
                  {headerSubLine}
                </div>
              )}
            </div>

            {/* Document Type Heading */}
            <div className="text-center border-b border-border pb-1.5">
              <h2 className="text-base font-black text-foreground uppercase tracking-tight">
                TAX INVOICE فاتورة الضريبة
              </h2>
            </div>

            {/* 2. CUSTOMER & INVOICE REFERENCE BOX */}
            <table className="w-full border-collapse border border-border text-[11px]">
              <tbody>
                <tr className="border-b border-border">
                  <td className="p-1.5 font-bold border-r border-border bg-muted/50 w-7/12">
                    <span className="text-foreground font-bold block">Invoice To</span>
                    <span className="text-foreground font-bold block">Name <span className="font-semibold text-muted-foreground font-arabic">اسم الزبون</span></span>
                    <span className="text-xs font-black text-foreground block mt-0.5">{customerName}</span>
                  </td>
                  <td className="p-1.5 border-r border-border w-2/12">
                    <div className="font-bold text-foreground">Date</div>
                    <div className="font-bold text-foreground">Invoice No.</div>
                  </td>
                  <td className="p-1.5 font-mono font-bold w-3/12">
                    <div>{invoiceDateStr}</div>
                    <div className="text-[#FA634E]">{invoiceRef}</div>
                  </td>
                </tr>

                <tr className="border-b border-border">
                  <td className="p-1.5 border-r border-border">
                    <span className="font-bold text-foreground block">Address</span>
                    <span className="text-foreground font-medium block leading-tight text-[10px]">{customerAddress}</span>
                    <span className="font-bold text-foreground block mt-1">ATTN#</span>
                  </td>
                  <td className="p-1.5 border-r border-border">
                    <div className="font-bold text-foreground">Due Date</div>
                    <div className="font-bold text-foreground mt-2">PO No</div>
                  </td>
                  <td className="p-1.5 font-mono font-bold text-foreground">
                    <div>{dueDateStr}</div>
                    <div className="mt-2">—</div>
                  </td>
                </tr>

                <tr>
                  <td className="p-1.5 border-r border-border">
                    <span className="font-bold text-foreground inline-block mr-2">VAT Reg No.</span>
                    <span className="font-mono font-bold text-foreground">{customerVatRegNo || '—'}</span>
                  </td>
                  <td className="p-1.5 border-r border-border font-bold text-foreground">
                    Company VAT
                  </td>
                  <td className="p-1.5 font-mono font-bold text-foreground">
                    {companyVatNumber}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 3. ITEMIZATION TABLE */}
            <table className="w-full border-collapse border border-border text-[10px]">
              <thead>
                <tr className="bg-muted border-b border-border">
                  <th className="p-1 border-r border-border text-center font-bold w-7">
                    No.<br /><span className="font-arabic font-normal">رقم</span>
                  </th>
                  <th className="p-1 border-r border-border text-center font-bold w-16">
                    Date<br /><span className="font-arabic font-normal">تاريخ</span>
                  </th>
                  <th className="p-1 border-r border-border text-center font-bold">
                    Description<br /><span className="font-arabic font-normal">الوصف</span>
                  </th>
                  <th className="p-1 border-r border-border text-center font-bold w-20">
                    AWB<br />NUMBER
                  </th>
                  <th className="p-1 border-r border-border text-center font-bold w-16">
                    Rate<br /><span className="font-arabic font-normal">سعر الواحدة</span>
                  </th>
                  <th className="p-1 border-r border-border text-center font-bold w-10">
                    QTY<br /><span className="font-arabic font-normal">كمية</span>
                  </th>
                  <th className="p-1 border-r border-border text-center font-bold w-14">
                    VAT {taxRate}%<br /><span className="font-arabic font-normal">القيمة الضريبية</span>
                  </th>
                  <th className="p-1 border-r border-border text-center font-bold w-16">
                    VAT<br /><span className="font-arabic font-normal">مجموع الضريبة</span>
                  </th>
                  <th className="p-1 text-center font-bold w-20">
                    Total<br /><span className="font-arabic font-normal">القيمة الإجمالي</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-4 text-center text-muted-foreground italic">
                      No invoice line items specified.
                    </td>
                  </tr>
                ) : (
                  lines.map((line: any, idx: number) => {
                    const qty = Number(line.quantity) || 1;
                    const lineAmt = Number(line.amount) || 0;
                    const rate = Number(line.rate) || (qty > 0 ? lineAmt / qty : 0);
                    const lineVat = lineAmt * (taxRate / 100);
                    const lineTotal = lineAmt + lineVat;

                    const tripDateStr = line.tripId && line.trip?.actual_start
                      ? new Date(line.trip.actual_start).toLocaleDateString('en-GB')
                      : '';
                    const awbNoStr = line.tripId && line.trip?.awb_number
                      ? line.trip.awb_number
                      : '';

                    return (
                      <tr key={line.id || idx} className="border-b border-border hover:bg-muted">
                        <td className="p-1 border-r border-border text-center font-mono text-muted-foreground">{idx + 1}</td>
                        <td className="p-1 border-r border-border text-center font-mono text-[10px] text-foreground">{tripDateStr}</td>
                        <td className="p-1.5 border-r border-border font-semibold text-foreground leading-snug">{line.description}</td>
                        <td className="p-1 border-r border-border text-center font-mono text-[10px] font-bold text-foreground">{awbNoStr}</td>
                        <td className="p-1 border-r border-border text-right font-mono">{rate.toFixed(2)}</td>
                        <td className="p-1 border-r border-border text-center font-mono">{qty}</td>
                        <td className="p-1 border-r border-border text-center font-mono text-muted-foreground">{taxRate}%</td>
                        <td className="p-1 border-r border-border text-right font-mono text-foreground">{lineVat.toFixed(2)}</td>
                        <td className="p-1 text-right font-mono font-bold text-foreground">{lineTotal.toFixed(2)}</td>
                      </tr>
                    );
                  })
                )}
                {/* Total Row inside Item Table */}
                <tr className="bg-muted border-b border-border font-bold">
                  <td colSpan={4} className="p-1.5 border-r border-border font-black text-foreground">Total</td>
                  <td colSpan={5} className="p-1.5 text-right font-mono font-black text-foreground">
                    {subtotal.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 4. FINANCIAL BREAKDOWN & TOTALS SUMMARY */}
            <div className="flex justify-end pt-1">
              <div className="w-80 border border-border divide-y divide-border/60 text-xs">
                <div className="flex justify-between p-1.5 bg-card font-bold">
                  <span className="text-foreground">Total Excluding VAT / <span className="font-arabic">المبلغ قبل الضريبة</span>:</span>
                  <span className="font-mono text-foreground">{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between p-1.5 bg-card font-bold">
                  <span className="text-foreground">Total VAT / {taxRate}% / <span className="font-arabic">مجموع الضريبة</span>:</span>
                  <span className="font-mono text-foreground">{taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between p-2 bg-card text-foreground border border-border text-white font-black">
                  <span>Total Amount including VAT / <span className="font-arabic">اجمالي المبلغ المـ</span>:</span>
                  <span className="font-mono text-sm text-[#FA634E]">SAR {totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* 5. BANK DETAILS & OFFICIAL STAMPS FOOTER */}
            <div className="pt-2">
              <div className="border border-border rounded p-2.5 grid grid-cols-12 gap-2 text-[10px]">
                {/* Left: Bank Details */}
                <div className="col-span-6 space-y-1 font-sans">
                  <h3 className="font-black text-foreground underline uppercase text-[11px]">Bank Details:</h3>
                  <div className="space-y-0.5 text-foreground">
                    <p><strong>Bank Name:</strong> SAB ( Saudi British Bank)</p>
                    <p><strong>Account No:</strong> 611110701001</p>
                    <p className="font-mono"><strong>IBAN:</strong> SA1645000000611110701001</p>
                  </div>
                  <div className="space-y-0.5 text-foreground pt-1">
                    <p><strong>Bank Name:</strong> Al Rajhi Bank</p>
                    <p><strong>Account No:</strong> 21100-001-000608956478</p>
                    <p className="font-mono"><strong>IBAN:</strong> SA58 8000 0211 6080 1956 4785</p>
                  </div>
                </div>

                {/* Center: QR Code & Approved Stamp */}
                <div className="col-span-3 flex flex-col items-center justify-center border-l border-r border-border px-2 text-center">
                  <div className="w-16 h-16 border border-border p-1 flex items-center justify-center bg-card shadow-xs">
                    {/* SVG Representation of ZATCA QR Code */}
                    <svg viewBox="0 0 100 100" className="w-full h-full">
                      <rect width="100" height="100" fill="white" />
                      <rect x="10" y="10" width="25" height="25" fill="black" />
                      <rect x="65" y="10" width="25" height="25" fill="black" />
                      <rect x="10" y="65" width="25" height="25" fill="black" />
                      <rect x="15" y="15" width="15" height="15" fill="white" />
                      <rect x="70" y="15" width="15" height="15" fill="white" />
                      <rect x="15" y="70" width="15" height="15" fill="white" />
                      <rect x="18" y="18" width="9" height="9" fill="black" />
                      <rect x="73" y="18" width="9" height="9" fill="black" />
                      <rect x="18" y="73" width="9" height="9" fill="black" />
                      <rect x="40" y="40" width="20" height="20" fill="black" />
                      <rect x="45" y="10" width="10" height="20" fill="black" />
                      <rect x="45" y="70" width="10" height="20" fill="black" />
                      <rect x="10" y="45" width="20" height="10" fill="black" />
                      <rect x="70" y="45" width="20" height="10" fill="black" />
                    </svg>
                  </div>
                  <span className="text-[9px] font-black text-foreground uppercase mt-1">Approved Rv</span>
                </div>

                {/* Right: Official Stamp Circle */}
                <div className="col-span-3 flex flex-col items-center justify-center text-center">
                  <div className="w-20 h-20 rounded-full border-2 border-indigo-900/60 text-indigo-900/80 p-1 flex flex-col items-center justify-center text-[8px] font-black uppercase rotate-[-6deg] select-none">
                    <span className="text-[7px] leading-none text-center">شركة ميركون للخدمات اللوجستية</span>
                    <span className="text-[10px] font-extrabold my-0.5">M</span>
                    <span className="text-[6px] font-mono leading-none">C.R 1009152862</span>
                    <span className="text-[6px] text-center leading-none mt-0.5">MERCON LOGISTICS SERVICES CO.</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Footer Ribbon Bar */}
            <div className="pt-2 border-t border-border text-center text-[9px] text-foreground space-y-0.5">
              <p className="font-medium">
                Building No. 4326, Ibn Al Ameed, Al Sulay Dist. Postal Code 14266, Riyadh, KSA | 
                <span className="font-arabic ml-1">رقم المبنى ٤٣٢٦، ابن العميد، حي السلي ١٤٢٦٦ الرياض، المملكة العربية السعودية</span>
              </p>
              <p className="font-mono font-bold text-foreground">
                +966 54 451 4848 | www.merconlogisticssa.com | sales@merconlogisticssa.com | mail@merconlogisticssa.com
              </p>
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
