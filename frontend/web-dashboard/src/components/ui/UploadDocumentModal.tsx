import { useState, useRef, useEffect, useMemo } from 'react';
import {
  UploadCloud, FileText, FileImage, FileSpreadsheet, Loader2, AlertCircle, AlertTriangle, FolderPlus, FolderOpen,
  Plus, X, Shield, Tag, Sparkles, FilePlus2, User, Truck, Route, Building2, Briefcase, ChevronDown, Lock, Layers,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { documentService, DocType } from '@/services/documentService';
import { documentTypeService, DocumentType, DocRequirement, DocOwnerType } from '@/services/documentTypeService';
import { folderService, MerconFolder } from '@/services/folderService';
import { driverService } from '@/services/driverService';
import { vehicleService } from '@/services/vehicleService';
import { tripService } from '@/services/tripService';
import { customerService } from '@/services/customerService';
import {
  collectDroppedFiles, partitionUploadable, relativePathOf, folderOf, fileKey, extensionOf, formatBytes,
  isFromFolder, DOC_UPLOAD_ACCEPT, type RejectedFile,
} from '@/lib/fileDrop';
import { cn } from '@/lib/utils';
import CreateFolderModal from './CreateFolderModal';
import ImportReviewModal from '@/components/documents/ImportReviewModal';
import { Button } from './button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './dialog';
import { DatePicker } from './date-picker';
import { Combobox, ComboboxOption } from './combobox';
import { toast } from 'sonner';

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType?: string;
  entityId?: string;
  docType?: DocType;
  folderId?: string;
  onUploadSuccess?: () => void;
  /** When set, pre-selects this configured document type. */
  documentTypeId?: string;
  /** Display name hint for pre-selection (fully editable by user). */
  documentTypeName?: string;
  /** When true (e.g. inside an owner's folder), locks the owner context. */
  lockOwner?: boolean;
  ownerDisplayName?: string;
}

type UploadMode = 'single' | 'ai';

const COMPANY_ENTITY_ID = '00000000-0000-0000-0000-000000000000';

const OWNER_TYPES: Array<{ value: DocOwnerType; label: string; icon: typeof User }> = [
  { value: 'Driver', label: 'Driver', icon: User },
  { value: 'Vehicle', label: 'Vehicle', icon: Truck },
  { value: 'Trip', label: 'Trip', icon: Route },
  { value: 'Customer', label: 'Customer', icon: Building2 },
  { value: 'Company', label: 'Company', icon: Briefcase },
];

/** Owner types the AI matcher can place a file against on its own. */
const AI_OWNER_TYPES = new Set(['Driver', 'Vehicle']);

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * The one upload entry point for the document vault. Takes a single file,
 * several files, or whole folders (picked or dragged), then either:
 *  - files them as ONE document with the details filled in here, or
 *  - hands them to the staged AI import, where each file becomes its own
 *    document matched to a driver/vehicle and is reviewed before saving.
 */
export default function UploadDocumentModal({
  isOpen,
  onClose,
  entityType: initialEntityType = 'Driver',
  entityId: initialEntityId = '',
  docType,
  folderId: initialFolderId = '',
  onUploadSuccess,
  documentTypeId,
  documentTypeName,
  lockOwner = false,
  ownerDisplayName,
}: UploadDocumentModalProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const errorRef = useRef<HTMLDivElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isReadingDrop, setIsReadingDrop] = useState(false);
  const [mode, setMode] = useState<UploadMode>('single');
  const [modeTouched, setModeTouched] = useState(false);

  const [selectedEntityType, setSelectedEntityType] = useState<string>(initialEntityType);
  const [selectedEntityId, setSelectedEntityId] = useState<string>(initialEntityId);
  const [selectedDocumentTypeId, setSelectedDocumentTypeId] = useState<string>('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>(initialFolderId);
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [isConfidential, setIsConfidential] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Hand-off to the staged AI import review.
  const [aiFiles, setAiFiles] = useState<File[] | null>(null);
  const importedViaAiRef = useRef(false);

  // Inline "Create New Document Type" state
  const [isCreatingDocType, setIsCreatingDocType] = useState(false);
  const [newDocTypeName, setNewDocTypeName] = useState('');
  const [newDocTypeReqStatus, setNewDocTypeReqStatus] = useState<DocRequirement>('OPTIONAL');
  const [newDocTypeHasExpiry, setNewDocTypeHasExpiry] = useState(true);

  // Start every open from the caller's context, not from the last session.
  useEffect(() => {
    if (!isOpen) return;
    setFiles([]);
    setRejected([]);
    setMode('single');
    setModeTouched(false);
    setSelectedEntityType(initialEntityType);
    setSelectedEntityId(initialEntityId);
    setSelectedFolderId(initialFolderId);
    setSelectedDocumentTypeId(documentTypeId || '');
    setIssueDate('');
    setExpiryDate('');
    setIsConfidential(false);
    setShowMore(false);
    setError(null);
    setAttempted(false);
    setUploadProgress(null);
    setIsCreatingDocType(false);
    setNewDocTypeName('');
    setAiFiles(null);
    importedViaAiRef.current = false;
  }, [isOpen, initialEntityType, initialEntityId, initialFolderId, documentTypeId]);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [error]);

  /* ─── Lookups ─────────────────────────────────────────────────────────── */

  const { data: dbDocTypes = [], isLoading: docTypesLoading } = useQuery({
    queryKey: ['document-types', 'lookup'],
    queryFn: async () => (await documentTypeService.getAll({ isActive: true })).data,
    enabled: isOpen,
  });

  const filteredDocTypes = useMemo(
    () => dbDocTypes.filter(
      (dt) => dt.ownerType.toLowerCase() === selectedEntityType.toLowerCase() && dt.requirementStatus !== 'DISABLED',
    ),
    [dbDocTypes, selectedEntityType],
  );

  const activeDocType: DocumentType | undefined = dbDocTypes.find((t) => t.id === selectedDocumentTypeId);

  const docTypeOptions: ComboboxOption[] = useMemo(() => filteredDocTypes.map((dt) => ({
    value: dt.id,
    selectedLabel: dt.name,
    label: (
      <div className="flex items-center justify-between w-full py-0.5 gap-2">
        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{dt.name}</span>
        {dt.requirementStatus === 'MANDATORY' ? (
          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 shrink-0">
            Mandatory
          </span>
        ) : (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
            Optional
          </span>
        )}
      </div>
    ),
    keywords: `${dt.name} ${dt.code} ${dt.ownerType} ${dt.requirementStatus}`,
  })), [filteredDocTypes]);

  // Pre-select a type from the caller's hints (name / legacy code) once types load.
  useEffect(() => {
    if (!isOpen || documentTypeId || selectedDocumentTypeId || !dbDocTypes.length) return;
    const hints = [documentTypeName, docType].filter(Boolean).map((h) => h!.toLowerCase());
    if (!hints.length) return;
    const matched = dbDocTypes.find((t) => hints.includes(t.name.toLowerCase()) || hints.includes(t.code.toLowerCase()));
    if (matched) setSelectedDocumentTypeId(matched.id);
  }, [isOpen, documentTypeId, documentTypeName, docType, dbDocTypes, selectedDocumentTypeId]);

  const { data: allFolders = [] } = useQuery({
    queryKey: ['folders'],
    queryFn: async () => (await folderService.getAll()).data,
    enabled: isOpen && !lockOwner,
  });
  const folders = allFolders.filter((f: MerconFolder) => f.category !== 'Vehicles' && f.category !== 'Drivers');

  const needsOwnerList = isOpen && !lockOwner;
  const { data: drivers = [], isLoading: driversLoading } = useQuery({
    queryKey: ['drivers', 'lookup'],
    queryFn: async () => (await driverService.getAll()).data,
    enabled: needsOwnerList && selectedEntityType === 'Driver',
  });
  const { data: vehicles = [], isLoading: vehiclesLoading } = useQuery({
    queryKey: ['vehicles', 'lookup'],
    queryFn: async () => (await vehicleService.getAll()).data,
    enabled: needsOwnerList && selectedEntityType === 'Vehicle',
  });
  const { data: trips = [], isLoading: tripsLoading } = useQuery({
    queryKey: ['trips', 'lookup'],
    queryFn: async () => (await tripService.getAll({ per_page: 100 })).data,
    enabled: needsOwnerList && selectedEntityType === 'Trip',
  });
  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ['customers', 'lookup'],
    queryFn: async () => (await customerService.getAll({ per_page: 500, mode: 'lookup' })).data,
    enabled: needsOwnerList && selectedEntityType === 'Customer',
  });

  const ownersLoading =
    (selectedEntityType === 'Driver' && driversLoading) ||
    (selectedEntityType === 'Vehicle' && vehiclesLoading) ||
    (selectedEntityType === 'Trip' && tripsLoading) ||
    (selectedEntityType === 'Customer' && customersLoading);

  const ownerOptions: ComboboxOption[] = useMemo(() => {
    if (selectedEntityType === 'Driver') return drivers.map((d: any) => ({ value: d.id, label: `${d.first_name} ${d.last_name}`.trim(), keywords: `${d.ref_id || ''} ${d.phone || ''}` }));
    if (selectedEntityType === 'Vehicle') return vehicles.map((v: any) => ({ value: v.id, label: v.plate_number || v.ref_id, keywords: `${v.ref_id || ''} ${v.plate_number || ''}` }));
    if (selectedEntityType === 'Trip') return trips.map((t: any) => ({ value: t.id, label: t.ref_id || `Trip #${t.id.slice(0, 8)}` }));
    if (selectedEntityType === 'Customer') return customers.map((c: any) => ({ value: c.id, label: c.name }));
    return [];
  }, [selectedEntityType, drivers, vehicles, trips, customers]);

  /* ─── Derived state ───────────────────────────────────────────────────── */

  const aiAvailable = lockOwner ? AI_OWNER_TYPES.has(selectedEntityType) : true;
  const effectiveMode: UploadMode = aiAvailable ? mode : 'single';
  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  const folderNames = useMemo(() => {
    const roots = new Set(files.map((f) => folderOf(f).split('/')[0]).filter(Boolean));
    return [...roots];
  }, [files]);

  const finalEntityId = selectedEntityType === 'Company' ? (selectedEntityId || COMPANY_ENTITY_ID) : selectedEntityId;
  const tooManyFilesForType = effectiveMode === 'single' && files.length > 1 && !!activeDocType && !activeDocType.allowsMultipleFiles;
  const expiryInPast = !!expiryDate && expiryDate < todayStr();

  const missing = {
    files: files.length === 0,
    owner: !finalEntityId,
    type: !selectedDocumentTypeId,
    expiry: !!activeDocType?.requiresExpiryDate && !expiryDate,
    issue: !!activeDocType?.requiresIssueDate && !issueDate,
  };

  /* ─── File intake ─────────────────────────────────────────────────────── */

  const addFiles = (picked: File[]) => {
    const { accepted, rejected: bad } = partitionUploadable(picked);
    setRejected((prev) => [...prev, ...bad]);
    if (picked.length > 0 && accepted.length === 0 && bad.length === 0) {
      toast.error('No documents found in that selection');
      return;
    }
    if (accepted.length === 0) return;
    setError(null);
    const seen = new Set(files.map(fileKey));
    const next = [...files, ...accepted.filter((f) => !seen.has(fileKey(f)))];
    setFiles(next);
    // Folders and piles of files are usually a batch of different documents,
    // so steer to AI sort unless the user already chose, or the caller opened
    // this for one specific document slot.
    if (!modeTouched && aiAvailable && !documentTypeId) {
      setMode(next.length > 1 && (next.some(isFromFolder) || next.length > 3) ? 'ai' : 'single');
    }
  };

  const removeFile = (key: string) => setFiles((prev) => prev.filter((f) => fileKey(f) !== key));

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    if (isBusy) return;
    setIsReadingDrop(true);
    try {
      addFiles(await collectDroppedFiles(e.dataTransfer));
    } finally {
      setIsReadingDrop(false);
    }
  };

  /* ─── Mutations ───────────────────────────────────────────────────────── */

  const createDocTypeMutation = useMutation({
    mutationFn: async () => {
      if (!newDocTypeName.trim()) throw new Error('Please enter a document type name');
      const cleanName = newDocTypeName.trim();
      const code = `CUSTOM_${cleanName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${Date.now().toString().slice(-4)}`;
      const ownerType: DocOwnerType = OWNER_TYPES.some((o) => o.value === selectedEntityType)
        ? (selectedEntityType as DocOwnerType)
        : 'Company';
      return documentTypeService.create({
        name: cleanName,
        code,
        ownerType,
        requirementStatus: newDocTypeReqStatus,
        requiresExpiryDate: newDocTypeHasExpiry,
        requiresIssueDate: false,
        allowsMultipleFiles: true,
        allowedFileTypes: ['pdf', 'jpg', 'png', 'webp'],
      });
    },
    onSuccess: (newType) => {
      toast.success(`Created document type "${newType.name}"`);
      queryClient.invalidateQueries({ queryKey: ['document-types'] });
      queryClient.invalidateQueries({ queryKey: ['documentTypes'] });
      setSelectedDocumentTypeId(newType.id);
      setIsCreatingDocType(false);
      setNewDocTypeName('');
      setNewDocTypeReqStatus('OPTIONAL');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || err.message || 'Failed to create document type');
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) =>
      documentService.upload(formData, (evt) => {
        if (evt.total) setUploadProgress(Math.round((evt.loaded * 100) / evt.total));
      }),
    onSuccess: () => {
      toast.success(files.length > 1 ? `Document saved with ${files.length} files` : 'Document uploaded to vault');
      invalidateVault();
      onUploadSuccess?.();
      handleClose(true);
    },
    onError: (err: any) => {
      setUploadProgress(null);
      setError(
        err.response?.data?.error?.message ||
        (err.code === 'ECONNABORTED' ? 'The upload timed out — check your connection and try again.' : null) ||
        err.message ||
        'Failed to upload document',
      );
    },
  });

  const isBusy = uploadMutation.isPending;

  const invalidateVault = () => {
    queryClient.invalidateQueries({ queryKey: ['documents'] });
    queryClient.invalidateQueries({ queryKey: ['folders'] });
    queryClient.invalidateQueries({ queryKey: ['ownerFolders'] });
  };

  const handleClose = (force = false) => {
    if (isBusy && !force) return;
    onClose();
  };

  const handleSubmit = () => {
    setAttempted(true);
    setError(null);
    if (missing.files) {
      setError('Add at least one file to upload.');
      return;
    }

    if (effectiveMode === 'ai') {
      setAiFiles(files);
      return;
    }

    if (missing.owner) return setError('Choose who this document belongs to.');
    if (missing.type) return setError('Choose a document type.');
    if (missing.issue) return setError(`${activeDocType!.name} requires an issue date.`);
    if (missing.expiry) return setError(`${activeDocType!.name} requires an expiry date.`);
    if (issueDate && expiryDate && expiryDate < issueDate) return setError('Expiry date cannot be before the issue date.');
    if (tooManyFilesForType) return setError(`${activeDocType!.name} holds a single file.`);

    setUploadProgress(0);
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    formData.append('entity_type', selectedEntityType);
    formData.append('entity_id', finalEntityId);
    formData.append('document_type_id', selectedDocumentTypeId);
    if (selectedFolderId) formData.append('folder_id', selectedFolderId);
    if (issueDate) formData.append('issue_date', issueDate);
    if (expiryDate) formData.append('expiry_date', expiryDate);
    formData.append('is_confidential', String(isConfidential));
    uploadMutation.mutate(formData);
  };

  const ownerTypeMeta = OWNER_TYPES.find((o) => o.value === selectedEntityType);
  const OwnerIcon = ownerTypeMeta?.icon || Shield;

  const primaryLabel = effectiveMode === 'ai'
    ? `Upload & auto-sort ${files.length || ''} file${files.length === 1 ? '' : 's'}`.replace('  ', ' ')
    : files.length > 1 ? `Save as 1 document (${files.length} files)` : 'Upload document';

  /* ─── Render ──────────────────────────────────────────────────────────── */

  return (
    <>
      <Dialog open={isOpen && !aiFiles} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <DialogContent
          className="w-[calc(100vw-2rem)] max-w-2xl rounded-2xl p-0 gap-0 border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col bg-white dark:bg-slate-900"
          onInteractOutside={(e) => { if (isBusy) e.preventDefault(); }}
        >
          {/* Header */}
          <DialogHeader className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 space-y-0 text-left">
            <div className="flex items-center gap-3 pr-8">
              <div className="w-10 h-10 rounded-xl bg-brand-light dark:bg-brand/15 text-brand flex items-center justify-center shrink-0">
                <UploadCloud className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                  Upload documents
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {lockOwner
                    ? <>For <span className="font-bold text-slate-700 dark:text-slate-300">{ownerDisplayName || selectedEntityType}</span> · files, several pages or a whole folder</>
                    : 'Drop a file, several pages, or a whole folder'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* ── Dropzone ─────────────────────────────────────────────── */}
            <div
              onDragEnter={(e) => { e.preventDefault(); dragDepth.current += 1; setIsDragging(true); }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
              onDragLeave={(e) => { e.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setIsDragging(false); }}
              onDrop={handleDrop}
              className={cn(
                'relative rounded-2xl border-2 border-dashed transition-all',
                files.length ? 'p-4' : 'p-8',
                isDragging
                  ? 'border-brand bg-brand-light/60 dark:bg-brand/10 ring-4 ring-brand/10'
                  : attempted && missing.files
                    ? 'border-rose-300 dark:border-rose-800 bg-rose-50/40 dark:bg-rose-950/10'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30',
                isBusy && 'opacity-60 pointer-events-none',
              )}
            >
              <div className={cn('flex items-center gap-4', files.length ? 'flex-row' : 'flex-col text-center')}>
                <div className={cn(
                  'rounded-2xl flex items-center justify-center shrink-0 transition-colors',
                  files.length ? 'w-10 h-10' : 'w-14 h-14',
                  isDragging ? 'bg-brand text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-brand',
                )}>
                  {isReadingDrop ? <Loader2 className="w-6 h-6 animate-spin" /> : <UploadCloud className={files.length ? 'w-5 h-5' : 'w-7 h-7'} />}
                </div>
                <div className={cn('min-w-0', files.length && 'flex-1')}>
                  <p className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                    {isDragging ? 'Drop to add' : isReadingDrop ? 'Reading folder…' : files.length ? 'Add more files' : 'Drag files or folders here'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    PDF, images, Word, Excel, CSV or text · up to 150 MB each
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button type="button" size="sm" onClick={() => fileInputRef.current?.click()}
                    className="h-8 rounded-lg bg-brand hover:bg-brand-hover text-white text-xs font-bold gap-1.5">
                    <FilePlus2 className="w-3.5 h-3.5" /> Files
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => folderInputRef.current?.click()}
                    className="h-8 rounded-lg text-xs font-bold gap-1.5 bg-white dark:bg-slate-900">
                    <FolderOpen className="w-3.5 h-3.5" /> Folder
                  </Button>
                </div>
              </div>
              <input ref={fileInputRef} type="file" multiple accept={DOC_UPLOAD_ACCEPT} className="hidden"
                onChange={(e) => { addFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
              <input ref={folderInputRef} type="file" multiple className="hidden"
                // @ts-expect-error — non-standard but supported by every current browser
                webkitdirectory="" directory=""
                onChange={(e) => { addFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
            </div>

            {/* ── Selected files ───────────────────────────────────────── */}
            {files.length > 0 && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2 min-w-0 text-xs">
                    <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-extrabold text-slate-800 dark:text-slate-200">{files.length} file{files.length === 1 ? '' : 's'}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500 dark:text-slate-400 font-mono">{formatBytes(totalBytes)}</span>
                    {folderNames.length > 0 && (
                      <span className="truncate text-slate-500 dark:text-slate-400">
                        · from <span className="font-bold text-slate-700 dark:text-slate-300">{folderNames.slice(0, 2).join(', ')}{folderNames.length > 2 ? ` +${folderNames.length - 2}` : ''}</span>
                      </span>
                    )}
                  </div>
                  <button type="button" onClick={() => { setFiles([]); setRejected([]); }} disabled={isBusy}
                    className="text-[11px] font-bold text-slate-500 hover:text-rose-600 shrink-0 disabled:opacity-50">
                    Clear all
                  </button>
                </div>
                <ul className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {files.map((f) => (
                    <FileRow key={fileKey(f)} file={f} disabled={isBusy} onRemove={() => removeFile(fileKey(f))} />
                  ))}
                </ul>
              </div>
            )}

            {rejected.length > 0 && (
              <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{rejected.length} file{rejected.length === 1 ? '' : 's'} skipped</p>
                  <p className="truncate opacity-80" title={rejected.map((r) => `${r.name} — ${r.reason}`).join('\n')}>
                    {rejected.slice(0, 3).map((r) => `${r.name.split('/').pop()} (${r.reason.toLowerCase()})`).join(', ')}
                    {rejected.length > 3 ? ` and ${rejected.length - 3} more` : ''}
                  </p>
                </div>
                <button type="button" onClick={() => setRejected([])} className="shrink-0 opacity-70 hover:opacity-100" aria-label="Dismiss">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* ── How to file them ─────────────────────────────────────── */}
            {aiAvailable && files.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" role="radiogroup" aria-label="How to file these documents">
                <ModeCard
                  active={effectiveMode === 'single'}
                  onClick={() => { setMode('single'); setModeTouched(true); }}
                  icon={<FileText className="w-4 h-4" />}
                  title={files.length > 1 ? 'One document' : 'Fill in details'}
                  text={files.length > 1 ? 'All files are pages of the same document.' : 'Choose the owner, type and dates yourself.'}
                />
                <ModeCard
                  active={effectiveMode === 'ai'}
                  onClick={() => { setMode('ai'); setModeTouched(true); }}
                  icon={<Sparkles className="w-4 h-4" />}
                  title="Auto-sort with AI"
                  text={lockOwner
                    ? 'Each file becomes its own document; AI reads the type and dates.'
                    : 'Each file becomes its own document, matched to a driver or vehicle.'}
                  badge="Folders"
                />
              </div>
            )}

            {effectiveMode === 'ai' && files.length > 0 ? (
              <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/20 p-4">
                <ol className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                  {[
                    `Upload ${files.length} file${files.length === 1 ? '' : 's'}${folderNames.length ? ' (folder names are kept as a matching hint)' : ''}`,
                    lockOwner
                      ? `AI reads each file for its type, number and dates — owner stays ${ownerDisplayName || selectedEntityType}`
                      : 'AI reads each file and matches it to a driver or vehicle and a document type',
                    'You review every match before anything is saved to the vault',
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-[10px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                      <span className="pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              /* ── Single-document details ─────────────────────────────── */
              <div className="space-y-4">
                {/* Owner */}
                {lockOwner ? (
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 text-xs">
                    <OwnerIcon className="w-4 h-4 text-brand shrink-0" />
                    <div className="flex-1 min-w-0 truncate">
                      <span className="text-slate-500 dark:text-slate-400">Belongs to </span>
                      <span className="font-extrabold text-slate-900 dark:text-slate-100">{ownerDisplayName || 'this owner'}</span>
                      <span className="text-slate-400 ml-1">({selectedEntityType})</span>
                    </div>
                    <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <FieldLabel required>Belongs to</FieldLabel>
                    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Owner type">
                      {OWNER_TYPES.map(({ value, label, icon: Icon }) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={selectedEntityType === value}
                          disabled={isBusy}
                          onClick={() => {
                            if (selectedEntityType === value) return;
                            setSelectedEntityType(value);
                            setSelectedEntityId('');
                            if (activeDocType && activeDocType.ownerType !== value) setSelectedDocumentTypeId('');
                          }}
                          className={cn(
                            'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold border transition-all',
                            selectedEntityType === value
                              ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100 shadow-xs'
                              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600',
                          )}
                        >
                          <Icon className="w-3.5 h-3.5" /> {label}
                        </button>
                      ))}
                    </div>
                    {selectedEntityType !== 'Company' && (
                      <Combobox
                        options={ownerOptions}
                        value={selectedEntityId}
                        onChange={setSelectedEntityId}
                        placeholder={ownersLoading ? 'Loading…' : `Select ${selectedEntityType.toLowerCase()}…`}
                        searchPlaceholder={`Search ${selectedEntityType.toLowerCase()}s…`}
                        emptyText="No matches found."
                        triggerClassName="h-9"
                        hasError={attempted && missing.owner}
                        disabled={isBusy}
                      />
                    )}
                  </div>
                )}

                {/* Document type */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <FieldLabel required>Document type</FieldLabel>
                    {!isCreatingDocType && (
                      <button type="button" onClick={() => setIsCreatingDocType(true)}
                        className="text-[11px] font-bold text-brand hover:underline flex items-center gap-1">
                        <Plus className="w-3 h-3" /> New type
                      </button>
                    )}
                  </div>

                  {isCreatingDocType ? (
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-brand" /> New {selectedEntityType.toLowerCase()} document type
                        </span>
                        <button type="button" onClick={() => setIsCreatingDocType(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Cancel">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={newDocTypeName}
                        onChange={(e) => setNewDocTypeName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newDocTypeName.trim()) createDocTypeMutation.mutate(); } }}
                        placeholder="e.g. Health Certificate, Route Permit…"
                        className="w-full h-9 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-brand/30"
                        autoFocus
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <Segmented
                          label="Requirement"
                          value={newDocTypeReqStatus}
                          onChange={(v) => setNewDocTypeReqStatus(v as DocRequirement)}
                          options={[{ value: 'OPTIONAL', label: 'Optional' }, { value: 'MANDATORY', label: 'Mandatory' }]}
                        />
                        <Segmented
                          label="Has expiry date?"
                          value={newDocTypeHasExpiry ? 'yes' : 'no'}
                          onChange={(v) => setNewDocTypeHasExpiry(v === 'yes')}
                          options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setIsCreatingDocType(false)}>Cancel</Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => createDocTypeMutation.mutate()}
                          disabled={createDocTypeMutation.isPending || !newDocTypeName.trim()}
                          className="h-8 rounded-lg bg-brand hover:bg-brand-hover text-white text-xs font-bold gap-1"
                        >
                          {createDocTypeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                          Create & select
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Combobox
                      options={docTypeOptions}
                      value={selectedDocumentTypeId}
                      onChange={setSelectedDocumentTypeId}
                      placeholder={docTypesLoading ? 'Loading…' : 'Select document type…'}
                      searchPlaceholder="Search document types…"
                      emptyText={`No ${selectedEntityType.toLowerCase()} document types yet.`}
                      onAddNew={() => setIsCreatingDocType(true)}
                      addNewLabel="Create new document type…"
                      triggerClassName="h-9 w-full"
                      hasError={attempted && missing.type}
                      disabled={isBusy}
                    />
                  )}

                  {tooManyFilesForType && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
                      <span className="flex-1 min-w-[12rem]"><strong>{activeDocType!.name}</strong> holds a single file, but {files.length} are selected.</span>
                      <button type="button" className="font-bold underline" onClick={() => setFiles((prev) => prev.slice(0, 1))}>Keep first file</button>
                      {aiAvailable && (
                        <button type="button" className="font-bold underline" onClick={() => { setMode('ai'); setModeTouched(true); }}>Auto-sort instead</button>
                      )}
                    </div>
                  )}
                </div>

                {/* Dates */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <FieldLabel required={!!activeDocType?.requiresIssueDate}>Issue date</FieldLabel>
                    <DatePicker
                      value={issueDate}
                      onChange={(_, dateStr) => setIssueDate(dateStr)}
                      placeholder="Select issue date…"
                      maxDate={expiryDate ? new Date(expiryDate) : undefined}
                      error={attempted && missing.issue}
                      disabled={isBusy}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel required={!!activeDocType?.requiresExpiryDate}>Expiry date</FieldLabel>
                    <DatePicker
                      value={expiryDate}
                      onChange={(_, dateStr) => setExpiryDate(dateStr)}
                      placeholder="Select expiry date…"
                      minDate={issueDate ? new Date(issueDate) : undefined}
                      error={attempted && missing.expiry}
                      disabled={isBusy}
                    />
                  </div>
                </div>
                {expiryInPast && (
                  <p className="-mt-2 text-[11px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> This date has passed — the document will be filed as expired.
                  </p>
                )}

                {/* More options */}
                <div>
                  <button type="button" onClick={() => setShowMore((v) => !v)}
                    className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
                    <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showMore && 'rotate-180')} />
                    More options
                    {(isConfidential || selectedFolderId) && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-brand" />}
                  </button>
                  {showMore && (
                    <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
                      {!lockOwner && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <FieldLabel>Folder</FieldLabel>
                            <button type="button" onClick={() => setIsCreateFolderOpen(true)}
                              className="text-[11px] font-bold text-brand hover:underline flex items-center gap-0.5">
                              <FolderPlus className="w-3 h-3" /> New folder
                            </button>
                          </div>
                          <select
                            value={selectedFolderId}
                            onChange={(e) => setSelectedFolderId(e.target.value)}
                            className="w-full h-9 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-brand/30"
                          >
                            <option value="">No folder (vault root)</option>
                            {folders.map((f: MerconFolder) => <option key={f.id} value={f.id}>{f.name}</option>)}
                          </select>
                        </div>
                      )}
                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input type="checkbox" checked={isConfidential} onChange={(e) => setIsConfidential(e.target.checked)}
                          className="w-4 h-4 rounded border-slate-300 accent-brand" />
                        <span className="text-xs text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-slate-400" /> Mark as confidential
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div ref={errorRef} role="alert" className="flex items-start gap-2 p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900 rounded-xl text-xs font-semibold">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 px-6 py-3.5">
            {isBusy && (
              <div className="mb-3">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  <span>{uploadProgress !== null && uploadProgress >= 100 ? 'Saving to vault…' : `Uploading ${files.length} file${files.length === 1 ? '' : 's'}…`}</span>
                  <span className="font-mono text-brand">{uploadProgress ?? 0}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-brand rounded-full transition-all duration-300" style={{ width: `${Math.max(uploadProgress ?? 0, 3)}%` }} />
                </div>
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => handleClose()} disabled={isBusy}
                className="h-9 px-4 rounded-lg text-xs font-bold">
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSubmit}
                disabled={isBusy || files.length === 0 || isReadingDrop}
                className={cn(
                  'h-9 px-5 rounded-lg text-xs font-bold gap-1.5 text-white',
                  effectiveMode === 'ai' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-brand hover:bg-brand-hover',
                )}
              >
                {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : effectiveMode === 'ai' ? <Sparkles className="w-4 h-4" /> : <UploadCloud className="w-4 h-4" />}
                {primaryLabel}
              </Button>
            </div>
          </div>
        </DialogContent>

        <CreateFolderModal
          isOpen={isCreateFolderOpen}
          onClose={() => setIsCreateFolderOpen(false)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['folders'] })}
        />
      </Dialog>

      {aiFiles && (
        <ImportReviewModal
          isOpen
          initialFiles={aiFiles}
          lockOwnerType={lockOwner && AI_OWNER_TYPES.has(selectedEntityType) ? (selectedEntityType as 'Driver' | 'Vehicle') : undefined}
          lockOwnerId={lockOwner && AI_OWNER_TYPES.has(selectedEntityType) ? selectedEntityId : undefined}
          ownerDisplayName={lockOwner ? ownerDisplayName : undefined}
          onImported={() => {
            importedViaAiRef.current = true;
            invalidateVault();
          }}
          onClose={() => {
            // Tell the caller only once the review is closed — some callers
            // unmount this modal on success, which would cut a review short.
            if (importedViaAiRef.current) onUploadSuccess?.();
            setAiFiles(null);
            onClose();
          }}
        />
      )}
    </>
  );
}

/* ─── Pieces ─────────────────────────────────────────────────────────────── */

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
      {children}
      {required
        ? <span className="text-rose-500 ml-0.5">*</span>
        : <span className="font-normal text-slate-400 dark:text-slate-500 ml-1">(optional)</span>}
    </label>
  );
}

function ModeCard({ active, onClick, icon, title, text, badge }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; title: string; text: string; badge?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'text-left rounded-xl border p-3 transition-all flex gap-3 items-start',
        active
          ? 'border-brand bg-brand-light/50 dark:bg-brand/10 ring-2 ring-brand/15'
          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-900',
      )}
    >
      <span className={cn(
        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
        active ? 'bg-brand text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500',
      )}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900 dark:text-slate-100">
          {title}
          {badge && <span className="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{badge}</span>}
        </span>
        <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{text}</span>
      </span>
    </button>
  );
}

function Segmented({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <span className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">{label}</span>
      <div className="flex p-0.5 rounded-lg bg-slate-200/70 dark:bg-slate-900">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'flex-1 py-1 rounded-md text-xs font-bold transition-all',
              value === o.value
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);
const SHEET_EXTS = new Set(['.xls', '.xlsx', '.csv']);

function FileRow({ file, onRemove, disabled }: { file: File; onRemove: () => void; disabled?: boolean }) {
  const ext = extensionOf(file.name);
  const isImage = IMAGE_EXTS.has(ext);
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setThumb(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  const Icon = isImage ? FileImage : SHEET_EXTS.has(ext) ? FileSpreadsheet : FileText;
  const folder = folderOf(file);

  return (
    <li className="flex items-center gap-3 px-4 py-2 group hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0 overflow-hidden">
        {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <Icon className="w-4 h-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate" title={relativePathOf(file)}>{file.name}</p>
        <p className="text-[10px] text-slate-400 truncate">
          <span className="uppercase font-bold">{ext.replace('.', '') || 'file'}</span>
          {' · '}{formatBytes(file.size)}
          {folder && <> · {folder}</>}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 opacity-60 group-hover:opacity-100 disabled:opacity-30 shrink-0"
        aria-label={`Remove ${file.name}`}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}
