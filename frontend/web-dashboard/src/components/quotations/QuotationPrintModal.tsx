import React, { useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, Download, X, FileText } from 'lucide-react';

interface QuotationPrintLineItem {
  originName?: string;
  destinationName?: string;
  vehicleClass?: string;
  rate?: string | number;
  driverPayout?: string | number;
  lineType?: string;
}

export interface SurchargeRulePrintItem {
  name: string;
  amount: string | number;
  unit?: string;
}

interface QuotationPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerName?: string;
  customerAddress?: string;
  attnName?: string;
  quoteNo?: string;
  validFromDate?: string;
  validToDate?: string;
  lineItems: QuotationPrintLineItem[];
  surchargeRules?: SurchargeRulePrintItem[];
}

export function QuotationPrintModal({
  isOpen,
  onClose,
  customerName = 'Valued Customer',
  customerAddress = 'Riyadh, Saudi Arabia',
  attnName = 'Procurement Department',
  quoteNo = '00115/MLS/26',
  validFromDate = new Date().toLocaleDateString('en-GB'),
  validToDate = '30/04/2026',
  lineItems = [],
  surchargeRules = [],
}: QuotationPrintModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  // Group line items into matrix by (Origin, Destination) and Vehicle Classes
  const { vehicleClasses, routeRows } = useMemo(() => {
    const vcSet = new Set<string>();
    const routeMap = new Map<string, { origin: string; destination: string; rates: Record<string, string | number> }>();

    lineItems.forEach((item) => {
      const origin = item.originName || 'Origin';
      const dest = item.destinationName || 'Destination';
      const vc = item.vehicleClass || 'Standard';
      const rate = item.rate || 0;

      vcSet.add(vc);

      const routeKey = `${origin}__${dest}`;
      if (!routeMap.has(routeKey)) {
        routeMap.set(routeKey, { origin, destination: dest, rates: {} });
      }
      routeMap.get(routeKey)!.rates[vc] = rate;
    });

    const vehicleClassesArr = Array.from(vcSet);
    if (vehicleClassesArr.length === 0) vehicleClassesArr.push('Rate (SAR)');

    return {
      vehicleClasses: vehicleClassesArr,
      routeRows: Array.from(routeMap.values()),
    };
  }, [lineItems]);

  const handlePrint = () => {
    window.print();
  };

  const currentDate = validFromDate || new Date().toLocaleDateString('en-GB');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent hideCloseButton className="max-w-4xl p-0 bg-charcoal-strong/60 backdrop-blur-md border border-slate-800 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col rounded-2xl">
        {/* Modal Top Actions Header (Screen only) */}
        <div className="px-4 py-3 bg-[#2D2B2C] text-white flex items-center justify-between border-b border-slate-800 shrink-0 print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="w-4.5 h-4.5 text-[#FA634E]" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-200">
              Commercial Quotation Document Preview
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
            className="w-full max-w-[210mm] bg-white text-slate-900 p-8 shadow-xl border border-slate-200 print:shadow-none print:border-0 print:p-0 print:m-0 font-sans text-xs space-y-4"
            style={{ minHeight: '270mm' }}
          >
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
                    src="/invoice-logo.png"
                    alt="MERCON Logo"
                    className="h-14 w-auto object-contain"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <span className="text-[10px] font-black tracking-widest text-[#FA634E] uppercase mt-1">
                    MERCON LOGISTICS
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
                C.R NO. 1009152862 | VAT NO.31270921580003
              </div>
            </div>

            {/* 2. CUSTOMER & QUOTATION REFERENCE BOX */}
            <table className="w-full border-collapse border border-slate-900 text-xs">
              <tbody>
                <tr className="border-b border-slate-900">
                  <td className="p-2 font-bold border-r border-slate-900 bg-slate-50 w-7/12">
                    {customerName}
                  </td>
                  <td className="p-2 border-r border-slate-900 font-bold bg-slate-50 w-2/12">Date:</td>
                  <td className="p-2 font-mono font-semibold w-3/12">{currentDate}</td>
                </tr>
                <tr className="border-b border-slate-900">
                  <td className="p-2 border-r border-slate-900">
                    <span className="font-semibold text-slate-600">Location: </span>
                    {customerAddress}
                  </td>
                  <td className="p-2 border-r border-slate-900 font-bold bg-slate-50">Quote No:</td>
                  <td className="p-2 font-mono font-bold text-[#FA634E]">{quoteNo}</td>
                </tr>
                <tr>
                  <td className="p-2 border-r border-slate-900">
                    <span className="font-semibold text-slate-600">Attn: </span>
                    {attnName}
                  </td>
                  <td className="p-2 border-r border-slate-900 font-bold bg-slate-50">Quote Valid:</td>
                  <td className="p-2 font-mono font-bold text-slate-900">{validToDate}</td>
                </tr>
              </tbody>
            </table>

            {/* 3. COMMERCIAL ROUTE RATES MATRIX TABLE */}
            <table className="w-full border-collapse border border-slate-900 text-xs">
              <thead>
                {/* Section Header Title Bar */}
                <tr className="bg-slate-100 border-b border-slate-900">
                  <th
                    colSpan={2 + vehicleClasses.length}
                    className="p-1.5 text-center font-black uppercase tracking-wider text-slate-900 text-[11px]"
                  >
                    DRY BOX TYPE VEHICLES & COMMERCIAL RATES
                  </th>
                </tr>
                {/* Column Headers */}
                <tr className="bg-slate-200/80 border-b border-slate-900">
                  <th className="p-2 border-r border-slate-900 text-left font-bold w-1/4">Origin</th>
                  <th className="p-2 border-r border-slate-900 text-left font-bold w-1/4">Destination</th>
                  {vehicleClasses.map((vc, idx) => (
                    <th key={idx} className="p-2 border-r border-slate-900 text-center font-bold last:border-r-0">
                      {vc}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {routeRows.length === 0 ? (
                  <tr>
                    <td colSpan={2 + vehicleClasses.length} className="p-4 text-center text-slate-400 italic">
                      No commercial route lines defined.
                    </td>
                  </tr>
                ) : (
                  routeRows.map((row, idx) => (
                    <tr key={idx} className="border-b border-slate-900 hover:bg-slate-50">
                      <td className="p-2 border-r border-slate-900 font-semibold">{row.origin}</td>
                      <td className="p-2 border-r border-slate-900 font-semibold">{row.destination}</td>
                      {vehicleClasses.map((vc, vIdx) => {
                        const val = row.rates[vc];
                        const displayVal =
                          val != null && !isNaN(Number(val)) && Number(val) > 0
                            ? Number(val).toLocaleString()
                            : '—';
                        return (
                          <td key={vIdx} className="p-2 border-r border-slate-900 text-center font-mono font-bold text-slate-900 last:border-r-0">
                            {displayVal}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}

                {/* Additional Standard Charges & Surcharges Section (Dynamic) */}
                {surchargeRules && surchargeRules.length > 0 && (
                  <>
                    {surchargeRules.map((rule, sIdx) => {
                      const displayAmount =
                        rule.amount != null && !isNaN(Number(rule.amount)) && Number(rule.amount) > 0
                          ? `${Number(rule.amount).toLocaleString()} SAR`
                          : '—';
                      return (
                        <tr key={sIdx} className="border-t-2 border-slate-900 bg-slate-50">
                          <td colSpan={2} className="p-2 border-r border-slate-900 font-bold text-slate-800">
                            {rule.name || 'Additional Surcharge'}
                          </td>
                          <td colSpan={vehicleClasses.length} className="p-2 text-center font-mono font-bold text-slate-900">
                            {displayAmount}
                            {rule.unit && (
                              <span className="font-sans font-normal text-[10px] text-slate-500 ml-1">
                                ({rule.unit})
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </>
                )}
              </tbody>
            </table>

            {/* 4. TERMS & CONDITIONS SECTION */}
            <div className="pt-2 space-y-1.5 text-[11px] text-slate-800">
              <h3 className="font-bold italic text-slate-900 underline text-xs">
                Terms and Conditions
              </h3>
              <ul className="list-disc pl-5 space-y-1 italic text-slate-700 leading-tight">
                <li>
                  This Quotation & the above rates are valid till{' '}
                  <strong className="font-bold text-slate-900">{validToDate}</strong>
                </li>
                <li>Free Loading & Off loading time would be 02:00 HRS</li>
                <li>In case of fuel market variation, charges will be revised as per the market fuel price</li>
                <li>Above mentioned prices are excluding VAT</li>
                <li>Above mentioned prices are for per Trip 1-way</li>
                <li>Payment terms would be 30 Days after the invoice submission.</li>
                <li>We will provide the vehicles within 1 to 2 hours upon the request.</li>
              </ul>
            </div>

            {/* Footer Signature Strip */}
            <div className="pt-8 border-t border-slate-300 flex justify-between text-[11px] font-bold text-slate-700">
              <div>
                <p>Prepared By: ___________________</p>
                <p className="text-[9px] font-normal text-slate-500 mt-1">MERCON Logistics Commercial Dept</p>
              </div>
              <div className="text-right">
                <p>Customer Acceptance: ___________________</p>
                <p className="text-[9px] font-normal text-slate-500 mt-1">Authorized Signature & Stamp</p>
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
