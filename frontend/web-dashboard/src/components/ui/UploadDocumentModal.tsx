import { useState, useRef, useEffect, useMemo } from 'react';
import { UploadCloud, FileText, Loader2, AlertCircle, FolderPlus, Plus, X, Shield, FileCheck, Tag } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { documentService, DocType } from '@/services/documentService';
import { documentTypeService, DocumentType, DocRequirement, DocOwnerType } from '@/services/documentTypeService';
import { folderService, MerconFolder } from '@/services/folderService';
import { driverService } from '@/services/driverService';
import { vehicleService } from '@/services/vehicleService';
import { tripService } from '@/services/tripService';
import { customerService } from '@/services/customerService';
import CreateFolderModal from './CreateFolderModal';
import Btn from './Btn';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog';
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

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedEntityType, setSelectedEntityType] = useState<string>(initialEntityType);
  const [selectedEntityId, setSelectedEntityId] = useState<string>(initialEntityId);
  const [selectedDocumentTypeId, setSelectedDocumentTypeId] = useState<string>('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>(initialFolderId);
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [isConfidential, setIsConfidential] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [loadedBytes, setLoadedBytes] = useState<number>(0);
  const [totalBytes, setTotalBytes] = useState<number>(0);

  // Inline "Create New Document Type" state
  const [isCreatingDocType, setIsCreatingDocType] = useState(false);
  const [newDocTypeName, setNewDocTypeName] = useState('');
  const [newDocTypeReqStatus, setNewDocTypeReqStatus] = useState<DocRequirement>('OPTIONAL');
  const [newDocTypeHasExpiry, setNewDocTypeHasExpiry] = useState(true);

  // 1. Fetch DB Configured Document Types
  const { data: dbDocTypes = [] } = useQuery({
    queryKey: ['document-types', 'lookup'],
    queryFn: async () => (await documentTypeService.getAll({ isActive: true })).data,
    enabled: isOpen,
  });

  // Filter Document Types based on current selected entityType
  const filteredDocTypes = useMemo(() => {
    if (!dbDocTypes.length) return [];
    const normalizedEntity = selectedEntityType.toLowerCase();
    const matching = dbDocTypes.filter(
      (dt) => dt.ownerType.toLowerCase() === normalizedEntity
    );
    return matching.length > 0 ? matching : dbDocTypes;
  }, [dbDocTypes, selectedEntityType]);

  // Transform Document Types into Combobox options with Mandatory / Optional badges
  const docTypeOptions: ComboboxOption[] = useMemo(() => {
    if (!filteredDocTypes.length) return [];

    return filteredDocTypes.map((dt) => {
      const isMandatory = dt.requirementStatus === 'MANDATORY';
      return {
        value: dt.id,
        selectedLabel: dt.name,
        label: (
          <div className="flex items-center justify-between w-full py-0.5">
            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[210px]">
              {dt.name}
            </span>
            {isMandatory ? (
              <span className="ml-2 text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 shrink-0">
                Mandatory
              </span>
            ) : (
              <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                Optional
              </span>
            )}
          </div>
        ),
        keywords: `${dt.name} ${dt.code} ${dt.ownerType} ${dt.requirementStatus}`,
      };
    });
  }, [filteredDocTypes]);

  // Handle Initial Pre-selection of Document Type
  useEffect(() => {
    if (!isOpen) return;

    if (documentTypeId) {
      setSelectedDocumentTypeId(documentTypeId);
      return;
    }

    if (dbDocTypes.length > 0) {
      // Try to find matching docType by name or legacy docType code
      let matched: DocumentType | undefined;
      if (documentTypeName) {
        matched = dbDocTypes.find(
          (t) => t.name.toLowerCase() === documentTypeName.toLowerCase() || t.code.toLowerCase() === documentTypeName.toLowerCase()
        );
      }
      if (!matched && docType) {
        matched = dbDocTypes.find(
          (t) => t.code.toLowerCase() === docType.toLowerCase() || t.name.toLowerCase() === docType.toLowerCase()
        );
      }

      if (matched) {
        setSelectedDocumentTypeId(matched.id);
      } else if (!selectedDocumentTypeId && filteredDocTypes.length > 0) {
        setSelectedDocumentTypeId(filteredDocTypes[0].id);
      }
    }
  }, [isOpen, documentTypeId, documentTypeName, docType, dbDocTypes, filteredDocTypes]);

  // Sync initial entity type and ID
  useEffect(() => {
    if (isOpen) {
      setSelectedEntityType(initialEntityType);
      setSelectedEntityId(initialEntityId);
      setSelectedFolderId(initialFolderId);
    }
  }, [isOpen, initialEntityType, initialEntityId, initialFolderId]);

  // 2. Fetch Owner Lookups
  const { data: allFolders = [] } = useQuery({
    queryKey: ['folders'],
    queryFn: async () => (await folderService.getAll()).data,
    enabled: isOpen,
  });

  const folders = allFolders.filter((f: MerconFolder) => f.category !== 'Vehicles' && f.category !== 'Drivers');

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers', 'lookup'],
    queryFn: async () => (await driverService.getAll()).data,
    enabled: isOpen && selectedEntityType === 'Driver',
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles', 'lookup'],
    queryFn: async () => (await vehicleService.getAll()).data,
    enabled: isOpen && selectedEntityType === 'Vehicle',
  });

  const { data: trips = [] } = useQuery({
    queryKey: ['trips', 'lookup'],
    queryFn: async () => (await tripService.getAll({ per_page: 100 })).data,
    enabled: isOpen && selectedEntityType === 'Trip',
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', 'lookup'],
    queryFn: async () => (await customerService.getAll({ per_page: 500, mode: 'lookup' })).data,
    enabled: isOpen && selectedEntityType === 'Customer',
  });

  const ownerOptions: ComboboxOption[] = useMemo(() => {
    if (selectedEntityType === 'Driver') return drivers.map((d: any) => ({ value: d.id, label: `${d.first_name} ${d.last_name}` }));
    if (selectedEntityType === 'Vehicle') return vehicles.map((v: any) => ({ value: v.id, label: v.plate_number || v.ref_id }));
    if (selectedEntityType === 'Trip') return trips.map((t: any) => ({ value: t.id, label: t.ref_id || `Trip #${t.id.slice(0, 8)}` }));
    if (selectedEntityType === 'Customer') return customers.map((c: any) => ({ value: c.id, label: c.name }));
    return [];
  }, [selectedEntityType, drivers, vehicles, trips, customers]);

  // Auto select first entity if none selected
  useEffect(() => {
    if (!selectedEntityId && !lockOwner) {
      if (selectedEntityType === 'Driver' && drivers.length > 0) setSelectedEntityId(drivers[0].id);
      if (selectedEntityType === 'Vehicle' && vehicles.length > 0) setSelectedEntityId(vehicles[0].id);
      if (selectedEntityType === 'Trip' && trips.length > 0) setSelectedEntityId(trips[0].id);
      if (selectedEntityType === 'Customer' && customers.length > 0) setSelectedEntityId(customers[0].id);
      if (selectedEntityType === 'Company') setSelectedEntityId('00000000-0000-0000-0000-000000000000');
    }
  }, [selectedEntityType, drivers, vehicles, trips, customers, selectedEntityId, lockOwner]);

  // 3. Inline Create Document Type Mutation
  const createDocTypeMutation = useMutation({
    mutationFn: async () => {
      if (!newDocTypeName.trim()) throw new Error('Please enter a document type name');
      const cleanName = newDocTypeName.trim();
      const code = `CUSTOM_${cleanName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${Date.now().toString().slice(-4)}`;
      
      const normOwnerType: DocOwnerType = 
        selectedEntityType === 'Vehicle' ? 'Vehicle' :
        selectedEntityType === 'Driver' ? 'Driver' :
        selectedEntityType === 'Trip' ? 'Trip' :
        selectedEntityType === 'Customer' ? 'Customer' : 'Company';

      return documentTypeService.create({
        name: cleanName,
        code,
        ownerType: normOwnerType,
        requirementStatus: newDocTypeReqStatus,
        requiresExpiryDate: newDocTypeHasExpiry,
        requiresIssueDate: false,
        allowsMultipleFiles: true,
        allowedFileTypes: ['pdf', 'jpg', 'png', 'webp'],
      });
    },
    onSuccess: (newType) => {
      toast.success(`Created document type "${newType.name}" (${newType.requirementStatus === 'MANDATORY' ? 'Mandatory' : 'Optional'})`);
      queryClient.invalidateQueries({ queryKey: ['document-types'] });
      setSelectedDocumentTypeId(newType.id);
      setIsCreatingDocType(false);
      setNewDocTypeName('');
      setNewDocTypeReqStatus('OPTIONAL');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || err.message || 'Failed to create document type');
    },
  });

  // 4. Main Upload Mutation
  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) =>
      documentService.upload(formData, (evt) => {
        if (evt.total) {
          const pct = Math.round((evt.loaded * 100) / evt.total);
          setUploadProgress(pct);
          setLoadedBytes(evt.loaded);
          setTotalBytes(evt.total);
        }
      }),
    onSuccess: () => {
      toast.success('Document uploaded to vault');
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['documents', 'owner-folders'] });
      if (onUploadSuccess) onUploadSuccess();
      handleClose();
    },
    onError: (err: any) => {
      setUploadProgress(null);
      setError(err.response?.data?.error?.message || err.message || 'Failed to upload document');
    },
  });

  const handleClose = () => {
    setSelectedFile(null);
    setIssueDate('');
    setExpiryDate('');
    setIsConfidential(false);
    setError(null);
    setUploadProgress(null);
    setLoadedBytes(0);
    setTotalBytes(0);
    setIsCreatingDocType(false);
    setNewDocTypeName('');
    onClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setError(null);
      setUploadProgress(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please select a file to upload.');
      return;
    }

    const finalEntityId = selectedEntityId || (selectedEntityType === 'Company' ? '00000000-0000-0000-0000-000000000000' : '');

    if (!finalEntityId) {
      setError('Please select an entity owner for this document.');
      return;
    }

    // Determine configured type object
    const activeDocType = dbDocTypes.find((t) => t.id === selectedDocumentTypeId);
    
    // Check required fields based on configuration
    if (activeDocType?.requiresExpiryDate && !expiryDate) {
      setError(`${activeDocType.name} requires an expiry date.`);
      return;
    }

    setUploadProgress(0);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('entity_type', selectedEntityType);
    formData.append('entity_id', finalEntityId);

    if (selectedDocumentTypeId) {
      formData.append('document_type_id', selectedDocumentTypeId);
    }
    
    // Legacy fallback doc_type
    const legacyCode = activeDocType?.code || docType || 'POD';
    formData.append('doc_type', legacyCode);

    if (selectedFolderId) formData.append('folder_id', selectedFolderId);
    if (issueDate) formData.append('issue_date', new Date(issueDate).toISOString());
    if (expiryDate) formData.append('expiry_date', new Date(expiryDate).toISOString());
    formData.append('is_confidential', isConfidential.toString());

    uploadMutation.mutate(formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open && !uploadMutation.isPending) handleClose();
    }}>
      <DialogContent className="w-full max-w-lg rounded-2xl p-0 border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden max-h-[92vh] flex flex-col bg-white dark:bg-slate-900">
        
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 m-0">
          <DialogTitle className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center justify-between">
            <span>Upload Vault Document</span>
          </DialogTitle>
        </DialogHeader>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* File Dropzone */}
            <div>
              <div 
                onClick={() => !uploadMutation.isPending && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all relative group
                  ${uploadMutation.isPending 
                    ? 'border-brand bg-brand-light/20 dark:bg-brand/10 cursor-wait' 
                    : selectedFile 
                    ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 cursor-pointer hover:bg-emerald-50/70 dark:hover:bg-emerald-950/30' 
                    : 'border-slate-200 dark:border-slate-700 hover:border-brand hover:bg-brand-light/30 dark:hover:bg-brand/10 cursor-pointer'}`}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileSelect} 
                  className="hidden" 
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  disabled={uploadMutation.isPending}
                />
                
                {uploadMutation.isPending ? (
                  <div className="flex flex-col items-center w-full space-y-2.5">
                    <div className="w-10 h-10 bg-brand-light dark:bg-brand/20 text-brand rounded-full flex items-center justify-center mb-1">
                      <Loader2 size={20} className="animate-spin text-brand" />
                    </div>
                    <div className="w-full max-w-xs mx-auto">
                      <div className="flex items-center justify-between text-xs font-extrabold text-slate-900 dark:text-slate-100 mb-1">
                        <span>Uploading document...</span>
                        <span className="font-mono text-brand">{uploadProgress !== null ? `${uploadProgress}%` : 'Processing...'}</span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-brand h-full transition-all duration-300 rounded-full"
                          style={{ width: `${uploadProgress || 10}%` }}
                        />
                      </div>
                      {totalBytes > 0 && (
                        <p className="text-[10px] text-slate-400 font-mono mt-1 text-right">
                          {(loadedBytes / 1024 / 1024).toFixed(2)} MB of {(totalBytes / 1024 / 1024).toFixed(2)} MB transferred
                        </p>
                      )}
                    </div>
                  </div>
                ) : selectedFile ? (
                  <div className="flex flex-col items-center relative">
                    <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-2 shadow-xs">
                      <FileCheck size={20} />
                    </div>
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate max-w-[280px]">{selectedFile.name}</p>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    <span className="text-[10px] font-bold text-brand hover:underline mt-2">Click to replace file</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-full flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                      <UploadCloud size={20} className="group-hover:text-brand transition-colors" />
                    </div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Click or drag document to upload</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">PDF, PNG, JPG, WEBP (Max 50MB)</p>
                  </div>
                )}
              </div>
            </div>

            {/* Owner Section */}
            {lockOwner ? (
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 text-xs">
                <Shield className="w-4 h-4 text-brand shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-slate-500 dark:text-slate-400">Uploading for </span>
                  <span className="font-extrabold text-slate-900 dark:text-slate-100 truncate">{ownerDisplayName || 'Selected Owner'}</span>
                  <span className="text-slate-400 font-normal ml-1">({selectedEntityType})</span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Owner Type</label>
                  <select
                    value={selectedEntityType}
                    onChange={(e) => {
                      setSelectedEntityType(e.target.value);
                      setSelectedEntityId('');
                    }}
                    className="w-full h-9 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-brand/30 transition-all"
                  >
                    <option value="Driver">Driver</option>
                    <option value="Vehicle">Vehicle</option>
                    <option value="Trip">Trip</option>
                    <option value="Customer">Customer</option>
                    <option value="Company">Company</option>
                  </select>
                </div>

                {selectedEntityType !== 'Company' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Owner</label>
                    <Combobox
                      options={ownerOptions}
                      value={selectedEntityId}
                      onChange={setSelectedEntityId}
                      placeholder="Select owner..."
                      searchPlaceholder="Search..."
                      emptyText="No matches found."
                      triggerClassName="h-9"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Document Type Section (Searchable / Changeable / Textable) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Document Type
                </label>
                <button
                  type="button"
                  onClick={() => setIsCreatingDocType(!isCreatingDocType)}
                  className="text-[11px] font-bold text-brand hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> {isCreatingDocType ? 'Hide Form' : 'New Type'}
                </button>
              </div>

              {/* Inline Create Document Type Form */}
              {isCreatingDocType ? (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-brand" /> Create Document Type
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsCreatingDocType(false)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div>
                    <input
                      type="text"
                      value={newDocTypeName}
                      onChange={(e) => setNewDocTypeName(e.target.value)}
                      placeholder="e.g. Health Certificate, Special Route Permit..."
                      className="w-full h-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-brand/30"
                      autoFocus
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-0.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                        Requirement Level
                      </label>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setNewDocTypeReqStatus('OPTIONAL')}
                          className={`flex-1 py-1 px-2 rounded-lg text-xs font-bold transition-all border ${
                            newDocTypeReqStatus === 'OPTIONAL'
                              ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-800 dark:border-slate-100 shadow-2xs'
                              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          Optional
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewDocTypeReqStatus('MANDATORY')}
                          className={`flex-1 py-1 px-2 rounded-lg text-xs font-bold transition-all border ${
                            newDocTypeReqStatus === 'MANDATORY'
                              ? 'bg-amber-500 text-white border-amber-500 shadow-2xs'
                              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          Mandatory
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                        Has Expiry Date?
                      </label>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setNewDocTypeHasExpiry(true)}
                          className={`flex-1 py-1 px-2 rounded-lg text-xs font-bold transition-all border ${
                            newDocTypeHasExpiry
                              ? 'bg-brand text-white border-brand shadow-2xs'
                              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewDocTypeHasExpiry(false)}
                          className={`flex-1 py-1 px-2 rounded-lg text-xs font-bold transition-all border ${
                            !newDocTypeHasExpiry
                              ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-800 dark:border-slate-100 shadow-2xs'
                              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          No
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsCreatingDocType(false)}
                      className="px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:underline"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => createDocTypeMutation.mutate()}
                      disabled={createDocTypeMutation.isPending || !newDocTypeName.trim()}
                      className="px-3 py-1 bg-brand text-white font-bold rounded-lg text-xs hover:bg-brand-dark transition-all disabled:opacity-50 flex items-center gap-1 shadow-2xs"
                    >
                      {createDocTypeMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Plus className="w-3 h-3" />
                      )}
                      Save & Select
                    </button>
                  </div>
                </div>
              ) : (
                /* Searchable & Textable Combobox for Document Types */
                <Combobox
                  options={docTypeOptions}
                  value={selectedDocumentTypeId}
                  onChange={setSelectedDocumentTypeId}
                  placeholder="Select or search document type..."
                  searchPlaceholder="Search document type..."
                  emptyText="No document type found."
                  onAddNew={() => setIsCreatingDocType(true)}
                  addNewLabel="Create New Document Type..."
                  triggerClassName="h-9 w-full bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                />
              )}
            </div>

            {/* Folder & Dates Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {!lockOwner && (
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Folder (Optional)</label>
                    <button
                      type="button"
                      onClick={() => setIsCreateFolderOpen(true)}
                      className="text-[11px] font-bold text-brand hover:underline flex items-center gap-0.5"
                    >
                      <FolderPlus className="w-3 h-3" /> New Folder
                    </button>
                  </div>
                  <select
                    value={selectedFolderId}
                    onChange={(e) => setSelectedFolderId(e.target.value)}
                    className="w-full h-9 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-brand/30 transition-all"
                  >
                    <option value="">No Folder (Root Vault)</option>
                    {folders.map((f: MerconFolder) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Issue Date <span className="font-normal text-slate-400 dark:text-slate-500">(Optional)</span></label>
                <DatePicker
                  value={issueDate}
                  onChange={(_, dateStr) => setIssueDate(dateStr)}
                  placeholder="Select issue date..."
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Expiry Date <span className="font-normal text-slate-400 dark:text-slate-500">(Optional)</span></label>
                <DatePicker
                  value={expiryDate}
                  onChange={(_, dateStr) => setExpiryDate(dateStr)}
                  placeholder="Select expiry date..."
                  minDate={(() => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    if (issueDate) {
                      const parsedIssue = new Date(issueDate);
                      return parsedIssue > today ? parsedIssue : today;
                    }
                    return today;
                  })()}
                />
              </div>
            </div>

            {/* Confidentiality Checkbox */}
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input 
                type="checkbox" 
                checked={isConfidential}
                onChange={(e) => setIsConfidential(e.target.checked)}
                className="w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand accent-brand"
              />
              <span className="text-xs text-slate-700 dark:text-slate-300 font-semibold">Mark document as confidential</span>
            </label>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 rounded-xl text-xs">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900">
          <Btn 
            label="Cancel" 
            variant="outline" 
            onClick={handleClose} 
            disabled={uploadMutation.isPending} 
          />
          <Btn 
            label="Upload Document" 
            onClick={handleSubmit} 
            disabled={!selectedFile || uploadMutation.isPending}
            icon={uploadMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
          />
        </div>

      </DialogContent>

      <CreateFolderModal
        isOpen={isCreateFolderOpen}
        onClose={() => setIsCreateFolderOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['folders'] });
        }}
      />
    </Dialog>
  );
}
