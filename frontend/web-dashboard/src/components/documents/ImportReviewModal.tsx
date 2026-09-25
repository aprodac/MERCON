import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UploadCloud, Loader2, CheckCircle2, AlertTriangle, HelpCircle, XCircle,
  Copy, FileText, ChevronDown, ChevronRight, X, Ban, Sparkles, FolderPlus, Folder,
  Check, ArrowRight, Eye, ShieldAlert, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { DatePicker } from '@/components/ui/date-picker';
import { documentService, type DocumentImportItem, type MatchConfidence } from '@/services/documentService';
import { documentTypeService } from '@/services/documentTypeService';
import { driverService } from '@/services/driverService';
import { vehicleService } from '@/services/vehicleService';
import { resolveFileUrl } from '@/lib/documents';
import { cn } from '@/lib/utils';
import { useDeploymentTimezone, formatInDeploymentTz } from '@/lib/datetime';

const CONFIDENCE_RANK: Record<MatchConfidence, number> = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };

const STATUS_CHIP: Record<string, { label: string; className: string; icon: any }> = {
  Pending:      { label: 'Uploaded',     className: 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 font-bold shadow-2xs', icon: FileText },
  Ready:        { label: 'Matched',      className: 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 font-bold shadow-2xs', icon: CheckCircle2 },
  NeedsInput:   { label: 'Needs Input',  className: 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 font-bold shadow-2xs', icon: HelpCircle },
  Unrecognised: { label: 'Not a fleet doc', className: 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 font-bold shadow-2xs', icon: Ban },
  Failed:       { label: 'Failed',       className: 'bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 font-bold shadow-2xs', icon: XCircle },
  Analyzing:    { label: 'Reading…',     className: 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 font-bold shadow-2xs', icon: Loader2 },
  Confirmed:    { label: 'Imported',     className: 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 font-bold shadow-2xs', icon: CheckCircle2 },
  Skipped:      { label: 'Skipped',      className: 'bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-800 font-bold', icon: X },
};

interface ImportReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported?: () => void;
  lockOwnerType?: 'Driver' | 'Vehicle';
  lockOwnerId?: string;
  ownerDisplayName?: string;
  initialFiles?: File[];
}

export default function ImportReviewModal({
  isOpen,
  onClose,
  onImported,
  lockOwnerType,
  lockOwnerId,
  ownerDisplayName,
  initialFiles,
}: ImportReviewModalProps) {
  const queryClient = useQueryClient();
  const tz = useDeploymentTimezone();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [importId, setImportId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dupActions, setDupActions] = useState<Record<string, 'replace' | 'addFile' | 'skip'>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const seededRef = useRef(false);

  const extractFilesFromDrop = async (dataTransfer: DataTransfer): Promise<File[]> => {
    const fileEntries: File[] = [];
    const items = Array.from(dataTransfer.items || []);
    
    const processEntry = async (entry: any) => {
      if (entry.isFile) {
        await new Promise<void>((resolve) => {
          entry.file((file: File) => {
            if (file.name && !file.name.startsWith('.')) {
              fileEntries.push(file);
            }
            resolve();
          }, () => resolve());
        });
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const entries: any[] = await new Promise((resolve) => {
          dirReader.readEntries((results: any[]) => resolve(results), () => resolve([]));
        });
        for (const childEntry of entries) {
          await processEntry(childEntry);
        }
      }
    };

    const queue: Promise<void>[] = [];
    for (const item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
        if (entry) {
          queue.push(processEntry(entry));
        } else {
          const file = item.getAsFile();
          if (file) fileEntries.push(file);
        }
      }
    }

    await Promise.all(queue);
    return fileEntries.length > 0 ? fileEntries : Array.from(dataTransfer.files || []);
  };

  // Poll while anything is being read by AI
  const { data: imp } = useQuery({
    queryKey: ['documentImport', importId],
    queryFn: () => documentService.getImport(importId!),
    enabled: !!importId && isOpen,
    refetchInterval: (q) => (q.state.data && (q.state.data.analyzing > 0 || isAnalyzingAi) ? 1500 : false),
  });

  const { data: docTypes = [] } = useQuery({
    queryKey: ['documentTypes', 'all'],
    queryFn: async () => (await documentTypeService.getAll({ isActive: true })).data,
    enabled: isOpen,
  });
  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers', 'lookup'],
    queryFn: async () => (await driverService.getAll()).data,
    enabled: isOpen,
  });
  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles', 'lookup'],
    queryFn: async () => (await vehicleService.getAll()).data,
    enabled: isOpen,
  });

  // Pre-select everything the matcher is confident about & auto-assign locked folder owner
  useEffect(() => {
    if (!imp?.items) return;
    if (lockOwnerType && lockOwnerId) {
      imp.items.forEach((item) => {
        if (!item.ownerId && item.status !== 'Confirmed' && item.status !== 'Skipped') {
          patchItem(item, { ownerType: lockOwnerType, ownerId: lockOwnerId });
        }
      });
    }
    if (!imp.isComplete || seededRef.current) return;
    seededRef.current = true;
    setSelected(new Set(
      imp.items
        .filter((i) => i.status === 'Ready' && (i.confidence === 'HIGH' || i.confidence === 'MEDIUM') && !i.duplicateOfDocumentId)
        .map((i) => i.id),
    ));
  }, [imp?.isComplete, imp?.items, lockOwnerType, lockOwnerId]);

  const ownerOptions = useMemo<ComboboxOption[]>(() => [
    ...vehicles.map((v: any) => ({ value: `Vehicle:${v.id}`, label: v.plate_number || v.ref_id, group: `Vehicles (${vehicles.length})` })),
    ...drivers.map((d: any) => ({ value: `Driver:${d.id}`, label: `${d.first_name} ${d.last_name}`.trim(), group: `Drivers (${drivers.length})` })),
  ], [vehicles, drivers]);

  const reset = () => {
    setImportId(null);
    setSelected(new Set());
    setDupActions({});
    setExpandedId(null);
    seededRef.current = false;
  };

  const handleClose = () => {
    if (isUploading || isConfirming) return;
    reset();
    onClose();
  };

  // Process initialFiles if provided when modal opens
  useEffect(() => {
    if (isOpen && initialFiles && initialFiles.length > 0 && !importId && !isUploading) {
      handleFiles(initialFiles);
    }
  }, [isOpen, initialFiles]);

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setIsUploading(true);
    try {
      const created = await documentService.createImport(files, lockOwnerType, lockOwnerId);
      setImportId(created.id);
      toast.success(`${created.itemCount} file(s) staged — Click "Analyse with AI" on any file or choose document type manually.`);
      await queryClient.invalidateQueries({ queryKey: ['documentImport', created.id] });
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleTriggerAiAnalysis = async (itemIds?: string[]) => {
    if (!importId) return;
    setIsAnalyzingAi(true);
    try {
      const res = await documentService.analyzeImport(importId, itemIds);
      toast.success(res.message || `Started AI analysis for ${res.count || 0} file(s)`);
      await queryClient.invalidateQueries({ queryKey: ['documentImport', importId] });
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to trigger AI analysis');
    } finally {
      setIsAnalyzingAi(false);
    }
  };

  const patchItem = async (item: DocumentImportItem, patch: Parameters<typeof documentService.updateImportItem>[2]) => {
    if (!importId) return;
    try {
      await documentService.updateImportItem(importId, item.id, patch);
      await queryClient.invalidateQueries({ queryKey: ['documentImport', importId] });
    } catch {
      toast.error('Could not update that row');
    }
  };

  const handleConfirm = async () => {
    if (!importId || selected.size === 0) return;
    setIsConfirming(true);
    try {
      const result = await documentService.confirmImport(importId, [...selected], dupActions);
      const parts = [
        result.created ? `${result.created} imported` : null,
        result.replaced ? `${result.replaced} replaced` : null,
        result.filesAdded ? `${result.filesAdded} added as extra file` : null,
        result.skipped ? `${result.skipped} skipped` : null,
      ].filter(Boolean);
      toast.success(parts.join(' · ') || 'Nothing to import');
      if (result.blocked.length > 0) {
        const missingTypeCount = result.blocked.filter((b) => b.reason === 'Missing Document Type').length;
        const missingOwnerCount = result.blocked.filter((b) => b.reason === 'Missing Owner').length;
        if (missingTypeCount > 0 && missingOwnerCount === 0) {
          toast.warning(`${missingTypeCount} row(s) missing Document Type — please select a Document Type.`);
        } else if (missingOwnerCount > 0 && missingTypeCount === 0) {
          toast.warning(`${missingOwnerCount} row(s) missing Owner — please pick a Driver or Vehicle.`);
        } else {
          toast.warning(`${result.blocked.length} row(s) still need an owner or document type.`);
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      await queryClient.invalidateQueries({ queryKey: ['ownerFolders'] });
      onImported?.();

      if (result.remaining === 0) {
        reset();
        onClose();
      } else {
        setSelected(new Set());
        await queryClient.invalidateQueries({ queryKey: ['documentImport', importId] });
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Import failed');
    } finally {
      setIsConfirming(false);
    }
  };

  const sortedItems = useMemo(() => {
    if (!imp) return [];
    const rank = (i: DocumentImportItem) => {
      if (i.status === 'Confirmed' || i.status === 'Skipped') return 9;
      if (i.status === 'Failed') return 0;
      if (i.status === 'NeedsInput') return 1;
      if (i.duplicateOfDocumentId) return 2;
      if (i.status === 'Unrecognised') return 3;
      return 4 + CONFIDENCE_RANK[(i.confidence || 'NONE') as MatchConfidence];
    };
    return [...imp.items].sort((a, b) => rank(a) - rank(b));
  }, [imp]);

  const actionable = sortedItems.filter((i) => !['Confirmed', 'Skipped'].includes(i.status));

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="w-full max-w-5xl rounded-2xl p-0 overflow-hidden max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
        
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <DialogHeader className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 border border-brand/30 text-brand flex items-center justify-center shrink-0 shadow-2xs">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
                Import Documents & Folders
                {(ownerDisplayName || lockOwnerType) && (
                  <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800 font-bold text-xs">
                    {lockOwnerType ? `${lockOwnerType}: ` : ''}{ownerDisplayName || lockOwnerId}
                  </Badge>
                )}
              </DialogTitle>
              {imp ? (
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {imp.counts.total} Total File{imp.counts.total === 1 ? '' : 's'} Staged
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    {imp.counts.ready} Matched
                  </span>
                  {imp.counts.needsInput > 0 && (
                    <>
                      <span className="text-slate-300 dark:text-slate-700">•</span>
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                        {imp.counts.needsInput} Need Input
                      </span>
                    </>
                  )}
                  {imp.counts.duplicates > 0 && (
                    <>
                      <span className="text-slate-300 dark:text-slate-700">•</span>
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                        {imp.counts.duplicates} Duplicates
                      </span>
                    </>
                  )}
                  {imp.counts.failed > 0 && (
                    <>
                      <span className="text-slate-300 dark:text-slate-700">•</span>
                      <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                        {imp.counts.failed} Failed
                      </span>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Upload files or entire folders — AI reads each file and matches it to your fleet roster.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 pr-8">
            {importId && imp && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleTriggerAiAnalysis()}
                disabled={isAnalyzingAi || imp.analyzing > 0 || actionable.length === 0}
                className="h-9 gap-1.5 text-xs font-bold border-indigo-200 bg-white hover:bg-slate-50 text-indigo-700 dark:bg-slate-900 dark:border-indigo-800 dark:text-indigo-300 shrink-0 shadow-2xs"
              >
                {isAnalyzingAi || imp.analyzing > 0 ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                )}
                {imp.analyzing > 0 ? 'Analyzing All with AI…' : 'Analyse All with AI'}
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* ── Dropzone (before files are staged) ─────────────────────────── */}
        {!importId ? (
          <div className="p-8 bg-white dark:bg-slate-900 space-y-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={async (e) => {
                e.preventDefault();
                setIsDragging(false);
                const files = await extractFilesFromDrop(e.dataTransfer);
                handleFiles(files);
              }}
              className={cn(
                'border-2 border-dashed rounded-2xl p-10 text-center transition-all bg-white dark:bg-slate-900 shadow-2xs',
                isDragging ? 'border-brand ring-4 ring-brand/10' : 'border-slate-200 dark:border-slate-800 hover:border-brand',
              )}
            >
              {isUploading ? (
                <div className="flex flex-col items-center gap-3 text-slate-600 dark:text-slate-300 py-6">
                  <Loader2 className="w-10 h-10 animate-spin text-brand" />
                  <p className="text-sm font-bold">Uploading files & folders…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 py-2">
                  <div className="flex items-center justify-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-brand flex items-center justify-center shadow-2xs">
                      <UploadCloud className="w-7 h-7" />
                    </div>
                    <div className="w-14 h-14 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-2xs">
                      <Folder className="w-7 h-7" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-base font-black text-slate-900 dark:text-slate-100">
                      Drop documents or whole folders here
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                      Select individual document files or drag an entire folder of documents. AI automatically reads each file and assigns it to your drivers or vehicles.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-9 text-xs font-bold bg-brand hover:bg-brand-hover text-white gap-1.5 shadow-xs px-5 rounded-xl"
                    >
                      <UploadCloud className="w-4 h-4" /> Select Files
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => folderInputRef.current?.click()}
                      className="h-9 text-xs font-bold bg-white hover:bg-slate-50 text-indigo-700 dark:bg-slate-900 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 gap-1.5 shadow-2xs px-5 rounded-xl"
                    >
                      <FolderPlus className="w-4 h-4" /> Upload Folder
                    </Button>
                  </div>

                  <p className="text-[11px] text-slate-400 font-medium">PDF, Word, Excel, CSV, Images or Text (Direct folder drag-and-drop supported)</p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.gif,.doc,.docx,.xls,.xlsx,.txt,.rtf,.csv"
              className="hidden"
              onChange={(e) => { handleFiles(Array.from(e.target.files || [])); e.target.value = ''; }}
            />
            <input
              ref={folderInputRef}
              type="file"
              // @ts-ignore
              webkitdirectory=""
              // @ts-ignore
              directory=""
              multiple
              className="hidden"
              onChange={(e) => { handleFiles(Array.from(e.target.files || [])); e.target.value = ''; }}
            />
          </div>
        ) : (
          <>
            {/* ── Review table / Staged Items ─────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 bg-white dark:bg-slate-900">
              {sortedItems.map((item) => {
                const chip = STATUS_CHIP[item.status] || STATUS_CHIP.Analyzing;
                const ChipIcon = chip.icon;
                const isDone = item.status === 'Confirmed' || item.status === 'Skipped';
                const isExpanded = expandedId === item.id;
                const dupAction = dupActions[item.id];

                const hasOwner = !!(item.ownerId || (lockOwnerType && lockOwnerId));
                const hasDocType = !!item.documentType?.id;

                let chipLabel = chip.label;
                if (item.status === 'NeedsInput') {
                  if (hasOwner && !hasDocType) {
                    chipLabel = 'Select Document Type';
                  } else if (!hasOwner && hasDocType) {
                    chipLabel = 'Select Owner';
                  } else if (!hasOwner && !hasDocType) {
                    chipLabel = 'Select Owner & Type';
                  }
                }

                return (
                  <div
                    key={item.id}
                    className={cn(
                      'rounded-2xl border transition-all p-4 space-y-3 bg-white dark:bg-slate-900 shadow-2xs',
                      isDone ? 'border-slate-200 dark:border-slate-800 opacity-60'
                        : item.status === 'NeedsInput' || item.duplicateOfDocumentId ? 'border-amber-300 dark:border-amber-800'
                        : item.status === 'Failed' ? 'border-rose-300 dark:border-rose-800'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700',
                    )}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      
                      {/* Left: Checkbox + File Info */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          disabled={isDone || item.status === 'Analyzing'}
                          checked={selected.has(item.id)}
                          onChange={(e) => {
                            const next = new Set(selected);
                            e.target.checked ? next.add(item.id) : next.delete(item.id);
                            setSelected(next);
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-brand focus:ring-brand shrink-0 disabled:opacity-40"
                        />

                        <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0 shadow-2xs">
                          <FileText className="w-4 h-4" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black text-slate-900 dark:text-slate-100 truncate">{item.filename}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {item.status === 'Analyzing' ? 'Reading with AI…' : item.error || item.reason || 'Ready for assignment'}
                          </p>
                        </div>
                      </div>

                      {/* Right: Inline Pickers & Status Badge & Per-File Analyse Button */}
                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
                        {!isDone && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleTriggerAiAnalysis([item.id])}
                              disabled={item.status === 'Analyzing' || isAnalyzingAi}
                              className="h-8 px-2.5 text-xs font-bold text-indigo-700 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 shadow-2xs gap-1.5 rounded-xl"
                            >
                              {item.status === 'Analyzing' ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
                                  Analyzing…
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                  Analyse with AI
                                </>
                              )}
                            </Button>

                            {item.status !== 'Analyzing' && (
                              <>
                                <Combobox
                                  options={ownerOptions}
                                  value={item.ownerId ? `${item.ownerType}:${item.ownerId}` : (lockOwnerType && lockOwnerId ? `${lockOwnerType}:${lockOwnerId}` : '')}
                                  onChange={(v) => {
                                    const [t, id] = String(v).split(':');
                                    patchItem(item, { ownerType: t as 'Driver' | 'Vehicle', ownerId: id });
                                  }}
                                  placeholder="Pick Owner"
                                  searchPlaceholder="Search driver or vehicle..."
                                  className={cn(
                                    "w-48 h-8 text-xs bg-white dark:bg-slate-900",
                                    !hasOwner && item.status === 'NeedsInput' && "border-amber-400 dark:border-amber-500 ring-2 ring-amber-400/20 font-semibold"
                                  )}
                                  popoverClassName="w-72"
                                />

                                <Combobox
                                  options={docTypes
                                    .filter((t: any) => !(item.ownerType || lockOwnerType) || t.ownerType === (item.ownerType || lockOwnerType))
                                    .map((t: any) => ({ value: t.id, label: t.name }))}
                                  value={item.documentType?.id || ''}
                                  onChange={(v) => patchItem(item, { documentTypeId: String(v) })}
                                  placeholder="Pick Document Type"
                                  searchPlaceholder="Search document type..."
                                  className={cn(
                                    "w-44 h-8 text-xs bg-white dark:bg-slate-900",
                                    !hasDocType && item.status === 'NeedsInput' && "border-amber-400 dark:border-amber-500 ring-2 ring-amber-400/20 font-semibold"
                                  )}
                                  popoverClassName="w-72"
                                />
                              </>
                            )}
                          </div>
                        )}

                        <Badge variant="outline" className={cn('text-[10px] px-2.5 py-1 font-bold shrink-0 gap-1.5', chip.className)}>
                          <ChipIcon className={cn('w-3.5 h-3.5', item.status === 'Analyzing' && 'animate-spin')} />
                          {chipLabel}
                        </Badge>

                        <button
                          onClick={() => setExpandedId(isExpanded ? null : item.id)}
                          className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 flex items-center justify-center shrink-0 shadow-2xs"
                          title="View Details"
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </div>

                    </div>

                    {/* Duplicate resolution box */}
                    {item.duplicateOfDocumentId && !isDone && (
                      <div className="p-3 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                        <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-300">
                          <Copy className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>
                            <strong>{item.ownerName}</strong> already has a <strong>{item.documentType?.name}</strong>
                            {item.duplicateExpiry && <> (expires {formatInDeploymentTz(item.duplicateExpiry, tz, 'MM/dd/yyyy')})</>}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {(['replace', 'addFile', 'skip'] as const).map((a) => (
                            <button
                              key={a}
                              onClick={() => setDupActions({ ...dupActions, [item.id]: a })}
                              className={cn(
                                'text-xs font-bold px-3 py-1 rounded-lg border transition-all shadow-2xs',
                                dupAction === a
                                  ? 'bg-amber-600 text-white border-amber-600'
                                  : 'bg-white dark:bg-slate-900 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-300 hover:bg-amber-50',
                              )}
                            >
                              {a === 'replace' ? 'Replace Existing' : a === 'addFile' ? 'Add Extra File' : 'Skip File'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Extracted Detail View */}
                    {isExpanded && (
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-charcoal h-36 flex items-center justify-center overflow-hidden">
                          {(item.mime_type || '').startsWith('image/')
                            ? <img src={resolveFileUrl(item.file_url)} alt="" className="max-h-full max-w-full object-contain" />
                            : <FileText className="w-10 h-10 text-slate-500" />}
                        </div>
                        <div className="space-y-2 text-xs">
                          <Field label="AI Detected" value={item.detectedKind} />
                          <Field label="Document #" value={item.document_number} />
                          <Field label="Issuing Authority" value={item.issuing_authority} />
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 w-24 shrink-0 font-medium">Expiry Date</span>
                            <DatePicker
                              value={item.expiry_date ? item.expiry_date.slice(0, 10) : ''}
                              onChange={(_d, dateString) => patchItem(item, { expiry_date: dateString || null })}
                              className="h-8 text-xs flex-1 bg-white dark:bg-slate-900"
                            />
                          </div>
                          {item.confidence && (
                            <Field label="Confidence Score" value={item.confidence} />
                          )}
                        </div>
                      </div>
                    )}

                  </div>
                );
              })}
            </div>

            {/* ── Footer ──────────────────────────────────────────────────── */}
            <div className="border-t border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between gap-4 bg-white dark:bg-slate-900 shrink-0">
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <button
                  onClick={() => setSelected(new Set(actionable.map((i) => i.id)))}
                  className="font-bold text-brand hover:underline"
                >
                  Select All
                </button>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <button
                  onClick={() => setSelected(new Set())}
                  className="font-bold text-slate-500 hover:underline"
                >
                  Clear Selection
                </button>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">{selected.size} selected</span>

                {(imp?.counts.unrecognised ?? 0) > 0 && (
                  <>
                    <span className="text-slate-300 dark:text-slate-700">•</span>
                    <button
                      onClick={async () => {
                        const junk = sortedItems.filter((i) => i.status === 'Unrecognised');
                        await Promise.all(junk.map((i) => patchItem(i, { status: 'Skipped' })));
                        setSelected((prev) => {
                          const next = new Set(prev);
                          junk.forEach((i) => next.delete(i.id));
                          return next;
                        });
                        toast.success(`Dismissed ${junk.length} non-fleet file(s)`);
                      }}
                      className="font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:underline"
                    >
                      Dismiss {imp!.counts.unrecognised} non-fleet files
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-4 text-xs font-bold bg-white hover:bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300"
                  onClick={handleClose}
                  disabled={isConfirming}
                >
                  {actionable.length > 0 ? 'Finish Later' : 'Close'}
                </Button>
                <Button
                  size="sm"
                  className="h-9 px-5 text-xs font-bold bg-brand hover:bg-brand-hover text-white gap-1.5 shadow-xs rounded-xl"
                  onClick={handleConfirm}
                  disabled={selected.size === 0 || isConfirming || (imp?.analyzing ?? 0) > 0}
                >
                  {isConfirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Import {selected.size > 0 ? selected.size : ''} Document{selected.size === 1 ? '' : 's'}
                </Button>
              </div>
            </div>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-500 dark:text-slate-400 w-28 shrink-0 font-medium">{label}</span>
      <span className="font-mono font-bold text-slate-900 dark:text-slate-100 truncate">{value || '—'}</span>
    </div>
  );
}
