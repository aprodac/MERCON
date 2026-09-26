import React, { useState } from 'react';
import { 
  X, Download, ExternalLink, RotateCw, ZoomIn, ZoomOut, 
  FileText, FileCheck, ShieldAlert, Calendar, Hash, Building2, 
  Sparkles, CheckCircle2, AlertTriangle, Lock, Globe, RefreshCw, Maximize2
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MerconDocument } from '@/services/documentService';
import { documentDisplayName, getExpiryStatus, formatExpiryText, formatBilingualAuthority, resolveFileUrl } from '@/lib/documents';
import { cn } from '@/lib/utils';
import { useDeploymentTimezone, formatInDeploymentTz } from '@/lib/datetime';

interface DocumentViewerModalProps {
  document: MerconDocument | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete?: (id: string) => void;
  vehiclePlate?: string;
}

export function isImageFile(url: string | null | undefined, mimeType?: string | null): boolean {
  if (!url) return false;
  if (mimeType && mimeType.startsWith('image/')) return true;
  const cleaned = url.toLowerCase().split('?')[0];
  return /\.(jpg|jpeg|png|webp|gif|svg|bmp)$/i.test(cleaned) || url.startsWith('data:image/');
}

export function isPdfFile(url: string | null | undefined, mimeType?: string | null): boolean {
  if (!url) return false;
  if (mimeType === 'application/pdf') return true;
  const cleaned = url.toLowerCase().split('?')[0];
  return /\.pdf$/i.test(cleaned) || url.startsWith('data:application/pdf');
}

export default function DocumentViewerModal({
  document,
  isOpen,
  onClose,
  onDelete,
  vehiclePlate,
}: DocumentViewerModalProps) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [imageError, setImageError] = useState(false);
  const tz = useDeploymentTimezone();

  if (!document) return null;

  const resolvedUrl = resolveFileUrl(document.file_url);
  const isImg = isImageFile(document.file_url, document.mime_type) && !imageError;
  const isPdf = isPdfFile(document.file_url, document.mime_type);
  const expStatus = getExpiryStatus(document.expiry_date);
  const expiryText = formatExpiryText(expStatus === 'none' ? null : Math.round((new Date(document.expiry_date!).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)));

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const handleResetView = () => {
    setZoomLevel(1);
    setRotation(0);
    setImageError(false);
  };

  const handleClose = () => {
    handleResetView();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-4xl w-[92vw] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl">
        
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex flex-row items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-900/50">
              <FileCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-base font-extrabold text-slate-900 dark:text-slate-100 truncate">
                  {documentDisplayName(document)}
                </DialogTitle>
                <Badge className={cn(
                  "text-[10px] font-bold px-2 py-0.5",
                  document.status === 'Verified' ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300" :
                  document.status === 'Expired' ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300" :
                  "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300"
                )}>
                  {(document.status || 'PENDING').toUpperCase()}
                </Badge>
                {expStatus === 'expired' && (
                  <Badge className="bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/60 dark:text-rose-200 text-[10px]">
                    Expired
                  </Badge>
                )}
                {expStatus === 'critical' && (
                  <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] animate-pulse">
                    Expiring Soon
                  </Badge>
                )}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                {vehiclePlate && <span className="font-semibold text-slate-700 dark:text-slate-300">Vehicle: {vehiclePlate}</span>}
                {vehiclePlate && <span>•</span>}
                <span>ID: {document.id.slice(0, 8)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isImg && (
              <div className="hidden sm:flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <Button variant="ghost" size="sm" onClick={handleZoomOut} className="h-7 w-7 p-0" title="Zoom Out">
                  <ZoomOut className="w-3.5 h-3.5" />
                </Button>
                <span className="text-[11px] font-mono px-1 font-semibold">{Math.round(zoomLevel * 100)}%</span>
                <Button variant="ghost" size="sm" onClick={handleZoomIn} className="h-7 w-7 p-0" title="Zoom In">
                  <ZoomIn className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={handleRotate} className="h-7 w-7 p-0 ml-1" title="Rotate">
                  <RotateCw className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="h-8 w-8 p-0 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Content Body: Split view (Preview on left, Details on right) */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 min-h-0 bg-slate-100/50 dark:bg-slate-950/60">
          
          {/* Left Preview Pane */}
          <div className="lg:col-span-7 xl:col-span-8 p-4 sm:p-6 flex flex-col items-center justify-center min-h-[340px] sm:min-h-[440px] bg-charcoal/90 dark:bg-slate-950 relative overflow-hidden group">
            
            {/* Visual background pattern */}
            <div className="absolute inset-0 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px] opacity-10 pointer-events-none" />

            {isImg ? (
              <div className="relative w-full h-full flex items-center justify-center overflow-auto max-h-[60vh] p-2">
                <img
                  src={resolvedUrl}
                  alt={documentDisplayName(document)}
                  onError={() => setImageError(true)}
                  style={{
                    transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                    transition: 'transform 0.2s ease-in-out',
                  }}
                  className="max-h-[55vh] max-w-full object-contain rounded-lg shadow-2xl border border-slate-800"
                />
              </div>
            ) : isPdf ? (
              <div className="w-full h-[55vh] rounded-xl overflow-hidden border border-slate-800 shadow-2xl bg-white">
                <iframe
                  src={resolvedUrl}
                  title={documentDisplayName(document)}
                  className="w-full h-full border-0"
                />
              </div>
            ) : (
              <div className="text-center p-8 max-w-sm space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-indigo-950/80 text-indigo-400 border border-indigo-800/60 flex items-center justify-center mx-auto shadow-lg">
                  <FileText className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-white">Document File Preview</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    {document.mime_type || 'Standard Document'}
                  </p>
                </div>
                {resolvedUrl && (
                  <a
                    href={resolvedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-xs font-bold text-indigo-300 hover:text-white bg-indigo-900/60 hover:bg-indigo-900 border border-indigo-700/60 px-4 py-2 rounded-xl transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open File Externally
                  </a>
                )}
              </div>
            )}

            {/* Quick floating toolbar for images */}
            {isImg && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-charcoal/90 backdrop-blur-md border border-slate-700/80 px-3 py-1.5 rounded-full shadow-xl text-white text-xs opacity-95 hover:opacity-100 transition-opacity">
                <button onClick={handleZoomOut} className="hover:text-indigo-400 p-1" title="Zoom Out"><ZoomOut size={14} /></button>
                <span className="font-mono text-[11px] px-1">{Math.round(zoomLevel * 100)}%</span>
                <button onClick={handleZoomIn} className="hover:text-indigo-400 p-1" title="Zoom In"><ZoomIn size={14} /></button>
                <div className="w-px h-3 bg-slate-700 my-auto mx-1" />
                <button onClick={handleRotate} className="hover:text-indigo-400 p-1" title="Rotate"><RotateCw size={14} /></button>
                <button onClick={handleResetView} className="hover:text-indigo-400 p-1 text-[11px] font-semibold" title="Reset">Reset</button>
              </div>
            )}

          </div>

          {/* Right Details Pane */}
          <div className="lg:col-span-5 xl:col-span-4 p-5 sm:p-6 bg-white dark:bg-slate-900 space-y-5 border-l border-slate-100 dark:border-slate-800">
            
            {/* Document Header Metadata */}
            <div className="space-y-3">
              <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                Document Overview
              </span>
              
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Doc Type:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{documentDisplayName(document)}</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Verification Status:</span>
                  <Badge variant="outline" className={cn(
                    "text-[10px] font-extrabold",
                    document.status === 'Verified' ? "text-emerald-700 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40" : "text-amber-700 border-amber-300 bg-amber-50"
                  )}>
                    {document.status}
                  </Badge>
                </div>

                {document.expiry_date && (
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Expiry Date:</span>
                    <span className={cn(
                      "font-mono font-bold",
                      expStatus === 'expired' ? "text-rose-600" : expStatus === 'critical' ? "text-rose-500" : "text-slate-900 dark:text-slate-100"
                    )}>
                      {formatInDeploymentTz(document.expiry_date, tz, 'MM/dd/yyyy')}
                    </span>
                  </div>
                )}

                {document.issue_date && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Issue Date:</span>
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                      {formatInDeploymentTz(document.issue_date, tz, 'MM/dd/yyyy')}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Confidentiality:</span>
                  <span className="text-slate-700 dark:text-slate-300 font-bold flex items-center gap-1">
                    {document.is_confidential ? (
                      <><Lock size={12} className="text-amber-500" /> Confidential</>
                    ) : (
                      <><Globe size={12} className="text-indigo-500" /> Standard</>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* AI Extracted OCR Metadata Panel */}
            {document.ai_extracted_json && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> AI Extracted OCR Data
                  </span>
                  {document.ai_extracted_json.confidence && (
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      {Math.round(document.ai_extracted_json.confidence * 100)}% match
                    </span>
                  )}
                </div>

                <div className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/50 p-3.5 rounded-xl space-y-2 text-xs">
                  {document.ai_extracted_json.document_number && (
                    <div>
                      <span className="text-[10px] font-bold text-amber-800/70 dark:text-amber-400/80 block uppercase">Doc Number</span>
                      <span className="font-mono font-extrabold text-amber-950 dark:text-amber-200">{document.ai_extracted_json.document_number}</span>
                    </div>
                  )}

                  {document.ai_extracted_json.vehicle_plate && (
                    <div>
                      <span className="text-[10px] font-bold text-amber-800/70 dark:text-amber-400/80 block uppercase">Extracted Plate</span>
                      <span className="font-mono font-bold text-amber-950 dark:text-amber-200">{document.ai_extracted_json.vehicle_plate}</span>
                    </div>
                  )}

                  {document.ai_extracted_json.issuing_authority && (
                    <div>
                      <span className="text-[10px] font-bold text-amber-800/70 dark:text-amber-400/80 block uppercase">Issuing Authority</span>
                      <span className="font-bold text-amber-950 dark:text-amber-200">
                        {formatBilingualAuthority(document.ai_extracted_json.issuing_authority)}
                      </span>
                    </div>
                  )}

                  {document.ai_extracted_json.notes && (
                    <p className="text-[11px] text-amber-900 dark:text-amber-300 italic pt-1 border-t border-amber-200/50">
                      "{document.ai_extracted_json.notes}"
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* System Info */}
            <div className="text-[11px] text-slate-400 space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span>Created At:</span>
                <span className="font-mono">{formatInDeploymentTz(document.createdAt, tz, 'MM/dd/yyyy')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>MIME Type:</span>
                <span className="font-mono truncate max-w-[150px]">{document.mime_type || 'N/A'}</span>
              </div>
            </div>

          </div>
        </div>

        {/* Pinned Footer */}
        <DialogFooter className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onDelete(document.id);
                  handleClose();
                }}
                className="text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 gap-1.5 h-8.5 rounded-xl"
              >
                <X className="w-3.5 h-3.5" /> Delete Document
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClose}
              className="text-xs font-bold h-8.5 rounded-xl border-slate-200 dark:border-slate-700"
            >
              Close
            </Button>

            {resolvedUrl && (
              <a
                href={resolvedUrl}
                target="_blank"
                rel="noreferrer"
                className="h-8.5 px-4 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 text-xs font-bold inline-flex items-center gap-1.5 transition-all"
              >
                <ExternalLink size={13} /> Open Tab
              </a>
            )}

            {resolvedUrl && (
              <a
                href={resolvedUrl}
                download
                className="h-8.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm inline-flex items-center gap-1.5 transition-all"
              >
                <Download size={13} /> Download File
              </a>
            )}
          </div>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
