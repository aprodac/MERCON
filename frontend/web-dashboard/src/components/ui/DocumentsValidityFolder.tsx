import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  FileText, ShieldCheck, AlertTriangle, Award, CheckCircle2, Loader2, Plus, X, Check, FilePlus, Sparkles
} from 'lucide-react';
import { documentService } from '@/services/documentService';
import { format, differenceInDays, parseISO } from 'date-fns';
import { toast } from 'sonner';

interface DocumentsValidityFolderProps {
  vehicleId?: string;
  onSelectDocument?: (docId: string) => void;
  selectedDocumentId?: string | null;
  deletedDocIds?: string[];
  onDeleteDocument?: (docId: string) => void;
}

function getDocIcon(docType: string) {
  const t = (docType || '').toLowerCase();
  if (t.includes('istimara') || t.includes('registration')) return FileText;
  if (t.includes('insurance')) return ShieldCheck;
  if (t.includes('operation') || t.includes('card')) return AlertTriangle;
  if (t.includes('saso') || t.includes('plates')) return Award;
  if (t.includes('fahas') || t.includes('inspection')) return CheckCircle2;
  return FileText;
}

function getDocIconColor(docType: string) {
  const t = (docType || '').toLowerCase();
  if (t.includes('istimara') || t.includes('registration')) return 'text-[#2563EB]';
  if (t.includes('insurance')) return 'text-[#7C3AED]';
  if (t.includes('operation')) return 'text-[#EA580C]';
  if (t.includes('saso')) return 'text-[#7C3AED]';
  if (t.includes('fahas')) return 'text-[#059669]';
  return 'text-[#2563EB]';
}

function getStatusBadge(expiry_date: string | null, status: string) {
  if (status === 'Expired' || status === 'Rejected') {
    return {
      badgeBg: 'bg-red-50 dark:bg-red-950/40', badgeText: 'text-red-700 dark:text-red-400',
      badgeBorder: 'border-red-200/80 dark:border-red-800/60', dotColor: 'bg-red-500',
      label: status === 'Rejected' ? 'Rejected' : 'Expired',
    };
  }
  if (!expiry_date) {
    return {
      badgeBg: 'bg-slate-50 dark:bg-slate-800/60', badgeText: 'text-slate-600 dark:text-slate-400',
      badgeBorder: 'border-slate-200/80 dark:border-slate-700', dotColor: 'bg-slate-400',
      label: 'No Expiry',
    };
  }
  try {
    const daysLeft = differenceInDays(parseISO(expiry_date), new Date());
    if (daysLeft < 0) {
      return {
        badgeBg: 'bg-red-50 dark:bg-red-950/40', badgeText: 'text-red-700 dark:text-red-400',
        badgeBorder: 'border-red-200/80 dark:border-red-800/60', dotColor: 'bg-red-500',
        label: 'Expired',
      };
    }
    if (daysLeft <= 30) {
      return {
        badgeBg: 'bg-amber-50 dark:bg-amber-950/40', badgeText: 'text-amber-700 dark:text-amber-400',
        badgeBorder: 'border-amber-200/80 dark:border-amber-800/60', dotColor: 'bg-amber-500',
        label: `${daysLeft}d left`,
      };
    }
    const shortDate = format(parseISO(expiry_date), 'dd/MM/yy');
    return {
      badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40', badgeText: 'text-emerald-700 dark:text-emerald-400',
      badgeBorder: 'border-emerald-200/80 dark:border-emerald-800/60', dotColor: 'bg-emerald-500',
      label: `Valid · ${shortDate}`,
    };
  } catch {
    return {
      badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40', badgeText: 'text-emerald-700 dark:text-emerald-400',
      badgeBorder: 'border-emerald-200/80 dark:border-emerald-800/60', dotColor: 'bg-emerald-500',
      label: status || 'Valid',
    };
  }
}

function isPodDocument(doc: any) {
  const typeName = (doc.documentType?.name || doc.doc_type || doc.name || doc.title || '').toLowerCase();
  const code = (doc.documentType?.code || '').toLowerCase();
  return (
    typeName.includes('pod') ||
    typeName.includes('proof of delivery') ||
    typeName.includes('waybill') ||
    typeName.includes('receipt') ||
    typeName.includes('delivery note') ||
    typeName.includes('load slip') ||
    code.includes('pod') ||
    code.includes('waybill')
  );
}

const DEFAULT_VEHICLE_DOCS = [
  { id: 'istimara', name: 'Istimara', status: 'Valid · 15/10/27', icon: FileText, iconColor: 'text-[#2563EB]', strokeColor: '#CBD5E1', badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40', badgeText: 'text-emerald-700 dark:text-emerald-400', badgeBorder: 'border-emerald-200/80 dark:border-emerald-800/60', dotColor: 'bg-emerald-500', label: 'Valid · 15/10/27' },
  { id: 'insurance', name: 'Insurance', status: 'Valid · 10/01/27', icon: ShieldCheck, iconColor: 'text-[#7C3AED]', strokeColor: '#CBD5E1', badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40', badgeText: 'text-emerald-700 dark:text-emerald-400', badgeBorder: 'border-emerald-200/80 dark:border-emerald-800/60', dotColor: 'bg-emerald-500', label: 'Valid · 10/01/27' },
  { id: 'operation_card', name: 'Operation Card', status: 'Expiring · 28 Sep', icon: AlertTriangle, iconColor: 'text-[#EA580C]', strokeColor: '#CBD5E1', badgeBg: 'bg-amber-50 dark:bg-amber-950/40', badgeText: 'text-amber-700 dark:text-amber-400', badgeBorder: 'border-amber-200/80 dark:border-amber-800/60', dotColor: 'bg-amber-500', label: 'Expiring · 28 Sep' },
  { id: 'saso_plates', name: 'SASO Plates', status: 'Valid · 04/11/28', icon: Award, iconColor: 'text-[#7C3AED]', strokeColor: '#CBD5E1', badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40', badgeText: 'text-emerald-700 dark:text-emerald-400', badgeBorder: 'border-emerald-200/80 dark:border-emerald-800/60', dotColor: 'bg-emerald-500', label: 'Valid · 04/11/28' },
  { id: 'fahas', name: 'FAHAS', status: 'Valid · 20/05/27', icon: CheckCircle2, iconColor: 'text-[#059669]', strokeColor: '#CBD5E1', badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40', badgeText: 'text-emerald-700 dark:text-emerald-400', badgeBorder: 'border-emerald-200/80 dark:border-emerald-800/60', dotColor: 'bg-emerald-500', label: 'Valid · 20/05/27' },
];

const QUICK_VEHICLE_DOC_TYPES = [
  { name: 'Weight Calibration Permit', code: 'weight_permit' },
  { name: 'Customs Clearance Certificate', code: 'customs_cert' },
  { name: 'Hazardous Cargo Pass', code: 'hazmat_pass' },
  { name: 'GPS Compliance Certificate', code: 'gps_cert' },
];

export default function DocumentsValidityFolder({ 
  vehicleId, 
  onSelectDocument, 
  selectedDocumentId,
  deletedDocIds = [],
  onDeleteDocument,
}: DocumentsValidityFolderProps) {
  const navigate = useNavigate();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const [addedLocalDocs, setAddedLocalDocs] = useState<any[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newDocTypeName, setNewDocTypeName] = useState('');
  const [newDocNumber, setNewDocNumber] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data: docs, isLoading } = useQuery({
    queryKey: ['vehicle-documents', vehicleId],
    queryFn: () => documentService.getAll({ entity_type: 'Vehicle', entity_id: vehicleId }),
    enabled: !!vehicleId,
    select: (res) => res.data ?? [],
  });

  const baseDocs = (docs && docs.length > 0) ? docs : null;

  const rawDocsList = baseDocs
    ? [...baseDocs, ...addedLocalDocs].filter((d) => !deletedDocIds.includes(d.id) && !isPodDocument(d))
    : [...DEFAULT_VEHICLE_DOCS, ...addedLocalDocs].filter((d) => !deletedDocIds.includes(d.id) && !isPodDocument(d));

  const documents = rawDocsList.map((doc) => {
    if (doc.badgeBg) {
      // Default fallback item
      return {
        ...doc,
        strokeColor: '#CBD5E1',
      };
    }
    const typeName = doc.documentType?.name || doc.doc_type || doc.name || 'Document';
    const badge = getStatusBadge(doc.expiry_date, doc.status || 'Verified');
    return {
      id: doc.id,
      name: typeName,
      icon: getDocIcon(typeName),
      iconColor: getDocIconColor(typeName),
      strokeColor: '#CBD5E1',
      ...badge,
    };
  });

  const handleAddDocumentToStack = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const title = newDocTypeName.trim() || 'Custom Document';
    const newId = `new-veh-doc-${Date.now()}`;

    let fileUrl = 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=800&auto=format&fit=crop&q=80';
    let mimeType = 'image/jpeg';
    if (selectedFile) {
      fileUrl = URL.createObjectURL(selectedFile);
      mimeType = selectedFile.type || (selectedFile.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    }

    const newDoc = {
      id: newId,
      name: title,
      doc_type: title,
      status: 'Verified',
      expiry_date: '2027-12-31T00:00:00.000Z',
      file_url: fileUrl,
      mime_type: mimeType,
      label: 'Valid (31 Dec 2027)',
      badgeBg: 'bg-emerald-50',
      badgeText: 'text-emerald-700',
      badgeBorder: 'border-[#A7F3D0]',
      dotColor: 'bg-[#16A34A]',
    };

    setAddedLocalDocs((prev) => [...prev, newDoc]);
    setIsAddModalOpen(false);
    setNewDocTypeName('');
    setNewDocNumber('');
    setSelectedFile(null);
    toast.success(`Added "${title}" to document stack!`);

    if (onSelectDocument) {
      onSelectDocument(newId);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between h-full min-h-[460px] max-h-[480px] overflow-hidden select-none">
      
      {/* ── Top Header Bar ── */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0 z-10">
        <h2 className="text-sm font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
          <FileText className="w-4.5 h-4.5 text-blue-600" />
          Documents &amp; Validity
        </h2>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => vehicleId && navigate(`/vehicles/${vehicleId}/documents`)}
            className="text-xs font-bold px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer shrink-0"
          >
            View All
          </button>
        </div>
      </div>

      {/* ── Folder Pocket & Stacked Index Cards (Max 5-6 visible at once, scrollable if more) ── */}
      <div className="relative flex-1 flex flex-col justify-start pt-2 pb-1 min-h-0 max-h-[380px] overflow-y-auto overflow-x-hidden pr-1.5">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-[#FA634E]" />
            <p className="text-xs font-semibold">Loading documents…</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-400">
            <FileText className="w-7 h-7 text-slate-300" />
            <p className="text-xs font-semibold">No documents uploaded yet</p>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="text-xs font-bold text-[#FA634E] hover:underline cursor-pointer"
            >
              + Add first document
            </button>
          </div>
        ) : (
          <div className="relative w-full flex flex-col justify-start space-y-2 pt-3">
            {documents.map((doc, index) => {
              const Icon = doc.icon;
              const isSelected = selectedDocumentId === doc.id;
              const isHovered = hoveredId === doc.id || isSelected;
              const isLast = index === documents.length - 1;

              const baseZIndex = (index + 1) * 10;
              const computedZIndex = isHovered ? 100 : baseZIndex;

              return (
                <div
                  key={doc.id}
                  onMouseEnter={() => setHoveredId(doc.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => {
                    if (onSelectDocument) {
                      onSelectDocument(selectedDocumentId === doc.id ? '' : doc.id);
                    } else if (vehicleId) {
                      navigate(`/vehicles/${vehicleId}/documents`);
                    }
                  }}
                  style={{ zIndex: computedZIndex }}
                  className={`
                    relative w-full ${isLast ? 'h-[175px]' : 'h-[58px]'} cursor-pointer
                    transition-all duration-300 ease-out transform group
                    ${isHovered ? '-translate-y-3' : 'hover:-translate-y-1'}
                  `}
                >
                  {/* SVG Background Path & Vertical Side Guide Lines */}
                  <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox={isLast ? "0 0 400 175" : "0 0 400 58"} preserveAspectRatio="none">
                    {isHovered ? (
                      <>
                        <path 
                          d={isLast
                            ? "M0,165 L0,14 C0,6 6,0 14,0 L215,0 C230,0 240,7 255,7 L386,7 C394,7 400,13 400,21 L400,165 C400,171 395,173 390,173 L10,173 C5,173 0,171 0,165 Z"
                            : "M0,56 L0,14 C0,6 6,0 14,0 L215,0 C230,0 240,7 255,7 L386,7 C394,7 400,13 400,21 L400,56"
                          }
                          fill="#FFFFFF"
                          stroke="#64748B"
                          strokeWidth="1.2"
                        />
                        {!isLast && (
                          <>
                            <line x1="0" y1="56" x2="0" y2="88" stroke="#475569" strokeWidth="1.2" />
                            <line x1="400" y1="56" x2="400" y2="88" stroke="#475569" strokeWidth="1.2" />
                          </>
                        )}
                      </>
                    ) : (
                      <path 
                        d={isLast
                          ? "M0,165 L0,14 C0,6 6,0 14,0 L215,0 C230,0 240,7 255,7 L386,7 C394,7 400,13 400,21 L400,165 C400,171 395,173 390,173 L10,173 C5,173 0,171 0,165 Z"
                          : "M0,76 L0,14 C0,6 6,0 14,0 L215,0 C230,0 240,7 255,7 L386,7 C394,7 400,13 400,21 L400,76"
                        }
                        fill="#FFFFFF"
                        stroke={doc.strokeColor}
                        strokeWidth="1.2"
                      />
                    )}
                  </svg>

                  {/* Content Overlay */}
                  <div className={`relative z-10 w-full h-full px-3.5 flex justify-between ${isLast ? 'items-start pt-3.5' : 'items-center'}`}>
                    <div className="flex items-center gap-2 pt-0.5 min-w-0 flex-1 pr-2">
                      <Icon className={`w-4 h-4 ${doc.iconColor} stroke-[2.2] shrink-0`} />
                      <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight truncate">
                        {doc.name}
                      </span>
                    </div>

                    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${doc.badgeBg} ${doc.badgeText} border ${doc.badgeBorder} shadow-2xs shrink-0 max-w-[48%] sm:max-w-[55%] min-w-0`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${doc.dotColor} shrink-0`}></span>
                      <span className="truncate whitespace-nowrap">{doc.label}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* ── Add Document Action Button (Dynamically follows bottom of stack) ── */}
            <div className="pt-6 sm:pt-8 mt-2 z-10">
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="w-full py-2.5 px-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/80 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs group"
              >
                <Plus className="w-4 h-4 text-[#FA634E] stroke-[2.5]" />
                <span>Add Document</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── QUICK ADD DOCUMENT MODAL / OVERLAY ── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FilePlus className="w-5 h-5 text-[#FA634E] stroke-[2.2] shrink-0" />
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white leading-tight">Add Vehicle Document</h3>
                  <p className="text-[11px] font-medium text-slate-400">Attach a new certificate to stack</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddDocumentToStack} className="mt-4 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Document Type / Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Weight Calibration Permit"
                  value={newDocTypeName}
                  onChange={(e) => setNewDocTypeName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#FA634E]/30 focus:border-[#FA634E]"
                />

                <div className="flex flex-wrap gap-1.5 mt-2">
                  {QUICK_VEHICLE_DOC_TYPES.map((t) => (
                    <button
                      key={t.code}
                      type="button"
                      onClick={() => setNewDocTypeName(t.name)}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800 text-[10.5px] font-bold text-slate-600 dark:text-slate-300 hover:bg-rose-50 hover:text-[#FA634E] hover:border-rose-200 transition-colors cursor-pointer"
                    >
                      + {t.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Document Number (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. SA-592019"
                  value={newDocNumber}
                  onChange={(e) => setNewDocNumber(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-[#FA634E]/30 focus:border-[#FA634E]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Attach File (PDF or Image)
                </label>
                <div className="relative border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-50 transition-colors text-center cursor-pointer">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  {selectedFile ? (
                    <div className="flex items-center justify-center gap-2 text-emerald-600 font-bold text-xs">
                      <Check className="w-4 h-4" />
                      <span className="truncate">{selectedFile.name}</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Sparkles className="w-5 h-5 text-[#FA634E] mx-auto" />
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Click or drop file here</p>
                      <p className="text-[10px] text-slate-400">PDF, JPG, PNG up to 10MB</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#FA634E] hover:bg-[#e0533e] text-white text-xs font-bold transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add to Stack</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
