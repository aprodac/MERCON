import { useState, useEffect, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import KpiCard from '@/components/ui/KpiCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FolderGit2, FileText, Image as ImageIcon, Upload, Search, Download, Eye,
  Trash2, Edit2, RotateCw, FileCode, X, LayoutGrid, List, AlertCircle, FilePlus,
  ChevronDown, HardDrive, Tag, CheckCircle2
} from 'lucide-react';
import { exportExcelTable, exportPDFTable } from '@/utils/exportUtils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { FileSpreadsheet } from 'lucide-react';

export interface AprodacDocument {
  id: string;
  title: string;
  category: 'Software Agreements' | 'System Architecture' | 'SLA & Maintenance' | 'Commercials & Invoices' | 'Release Notes & Handover';
  version: string;
  fileType: 'pdf' | 'image';
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  status: 'Active' | 'Under Review' | 'Archived';
  uploadedAt: string;
  uploadedBy: string;
  description: string;
  tags: string[];
  dataUrl?: string;
}

const STORAGE_KEY = 'mercon_aprodac_documents_vault';

export default function AprodacDocumentsPage() {
  // Start with empty array — no fake/mock data initialized by default!
  const [documents, setDocuments] = useState<AprodacDocument[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Filter out legacy mock items (ids starting with 'apr-doc-')
          return parsed.filter((d: any) => d && d.id && !d.id.startsWith('apr-doc-'));
        }
      }
    } catch {
      // Fallback to empty array
    }
    return [];
  });

  // Save to localStorage whenever documents change & clear old mock data keys
  useEffect(() => {
    try {
      const cleanDocs = documents.filter(d => !d.id.startsWith('apr-doc-'));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanDocs));
    } catch {
      // Ignore quota errors gracefully
    }
  }, [documents]);

  // Filters & Control State
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<AprodacDocument | null>(null);
  const [editingDoc, setEditingDoc] = useState<AprodacDocument | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Upload Form state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState<AprodacDocument['category']>('Software Agreements');
  const [uploadVersion, setUploadVersion] = useState('v1.0');
  const [uploadStatus, setUploadStatus] = useState<AprodacDocument['status']>('Active');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Refresh handler
  const handleRefresh = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setDocuments(parsed.filter((d: any) => d && d.id && !d.id.startsWith('apr-doc-')));
          return;
        }
      }
      setDocuments([]);
    } catch {
      setDocuments([]);
    }
  };

  // Reset upload form
  const resetUploadForm = () => {
    setUploadFile(null);
    setUploadPreviewUrl(null);
    setUploadTitle('');
    setUploadCategory('Software Agreements');
    setUploadVersion('v1.0');
    setUploadStatus('Active');
    setUploadDescription('');
    setUploadTags('');
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // File selection & validation
  const handleFileSelected = (file: File) => {
    setUploadError(null);
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|svg)$/i.test(file.name);

    if (!isPdf && !isImage) {
      setUploadError('Unsupported file type. Please upload a PDF (.pdf) or an Image (.png, .jpg, .webp, .svg).');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setUploadError('File size exceeds the 25MB limit.');
      return;
    }

    setUploadFile(file);
    if (!uploadTitle) {
      const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      setUploadTitle(cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1));
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setUploadPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Submit New or Edited Document
  const handleSaveDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile && !editingDoc) {
      setUploadError('Please select a PDF or Image file to upload.');
      return;
    }

    if (!uploadTitle.trim()) {
      setUploadError('Please enter a document title.');
      return;
    }

    if (editingDoc) {
      const updated = documents.map((doc) => {
        if (doc.id === editingDoc.id) {
          return {
            ...doc,
            title: uploadTitle.trim(),
            category: uploadCategory,
            version: uploadVersion.trim() || 'v1.0',
            status: uploadStatus,
            description: uploadDescription.trim(),
            tags: uploadTags.split(',').map((t) => t.trim()).filter(Boolean),
            ...(uploadPreviewUrl && uploadFile ? {
              dataUrl: uploadPreviewUrl,
              fileName: uploadFile.name,
              sizeBytes: uploadFile.size,
              fileType: (uploadFile.type === 'application/pdf' || uploadFile.name.toLowerCase().endsWith('.pdf')) ? 'pdf' as const : 'image' as const,
              mimeType: uploadFile.type || doc.mimeType,
            } : {})
          };
        }
        return doc;
      });
      setDocuments(updated);
      setEditingDoc(null);
    } else if (uploadFile) {
      const isPdf = uploadFile.type === 'application/pdf' || uploadFile.name.toLowerCase().endsWith('.pdf');
      const newDoc: AprodacDocument = {
        id: `apr-${Date.now()}`,
        title: uploadTitle.trim(),
        category: uploadCategory,
        version: uploadVersion.trim() || 'v1.0',
        fileType: isPdf ? 'pdf' : 'image',
        mimeType: uploadFile.type || (isPdf ? 'application/pdf' : 'image/png'),
        fileName: uploadFile.name,
        sizeBytes: uploadFile.size,
        status: uploadStatus,
        uploadedAt: new Date().toISOString().split('T')[0],
        uploadedBy: 'Admin User',
        description: uploadDescription.trim() || 'Uploaded company document from Aprodac.',
        tags: uploadTags.split(',').map((t) => t.trim()).filter(Boolean),
        dataUrl: uploadPreviewUrl || undefined,
      };

      setDocuments([newDoc, ...documents]);
    }

    setIsUploadOpen(false);
    resetUploadForm();
  };

  // Start Editing
  const handleEditClick = (doc: AprodacDocument) => {
    setEditingDoc(doc);
    setUploadTitle(doc.title);
    setUploadCategory(doc.category);
    setUploadVersion(doc.version);
    setUploadStatus(doc.status);
    setUploadDescription(doc.description);
    setUploadTags(doc.tags.join(', '));
    setUploadPreviewUrl(doc.dataUrl || null);
    setIsUploadOpen(true);
  };

  // Delete Document
  const handleDeleteDocument = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    setDeleteConfirmId(null);
    if (previewDoc?.id === id) setPreviewDoc(null);
  };

  // Download Document File
  const handleDownload = (doc: AprodacDocument) => {
    if (doc.dataUrl) {
      const a = document.createElement('a');
      a.href = doc.dataUrl;
      a.download = doc.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      const content = `MERCON DEVELOPER VAULT DOCUMENT\n===================================\nDocument Title: ${doc.title}\nCategory: ${doc.category}\nVersion: ${doc.version}\nStatus: ${doc.status}\nUploaded Date: ${doc.uploadedAt}\nDescription: ${doc.description}`;
      const blob = new Blob([content], { type: doc.mimeType || 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  // Export Documents
  const handleExport = (format: 'excel' | 'pdf') => {
    if (filteredDocuments.length === 0) return;
    const headers = ['ID', 'Title', 'Category', 'Version', 'File Type', 'File Name', 'Size (Bytes)', 'Status', 'Uploaded Date', 'Uploaded By', 'Description'];
    const rows = filteredDocuments.map((d) => [
      d.id,
      d.title,
      d.category,
      d.version,
      d.fileType.toUpperCase(),
      d.fileName,
      d.sizeBytes,
      d.status,
      d.uploadedAt,
      d.uploadedBy,
      d.description
    ]);

    const title = 'Aprodac Vault Documents';
    const filename = `Aprodac_Vault_Documents_${new Date().toISOString().split('T')[0]}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
    if (format === 'excel') {
      exportExcelTable(title, headers, rows, filename);
    } else {
      exportPDFTable(title, headers, rows, filename);
    }
  };

  // Helper bytes formatter
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Filter Logic
  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.tags.some((t) => t.toLowerCase().includes(searchTerm.toLowerCase())) ||
      doc.version.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = categoryFilter === 'All' || doc.category === categoryFilter;
    const matchesType = typeFilter === 'All' || doc.fileType === typeFilter.toLowerCase();
    const matchesStatus = statusFilter === 'All' || doc.status === statusFilter;

    return matchesSearch && matchesCategory && matchesType && matchesStatus;
  });

  // Metrics
  const totalDocs = documents.length;
  const pdfCount = documents.filter((d) => d.fileType === 'pdf').length;
  const imageCount = documents.filter((d) => d.fileType === 'image').length;
  const totalStorage = documents.reduce((acc, d) => acc + d.sizeBytes, 0);

  return (
    <DashboardLayout active="/aprodac-documents" title="Aprodac Vault">
      <div className="px-4 sm:px-6 pb-6 w-full flex flex-col animate-fade-in gap-5">
        {/* Top Header Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 shrink-0 pb-1">
          <div className="flex items-center gap-3">
            <FolderGit2 className="w-6 h-6 text-brand shrink-0" />
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Aprodac Vault
              </h1>
              <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 text-xs font-semibold">
                Aprodac Developer Module
              </Badge>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={filteredDocuments.length === 0}
                  className="h-9 gap-1.5 text-xs font-semibold border-slate-200 bg-white hover:bg-slate-50 shadow-2xs text-slate-700 dark:bg-slate-900 dark:border-slate-800 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5 text-slate-600" />
                  <span>Export</span>
                  <ChevronDown className="h-3 w-3 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 p-1.5 shadow-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl z-50">
                <DropdownMenuItem
                  onClick={() => handleExport('excel')}
                  className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md flex items-center gap-2"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Excel (.xlsx)</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleExport('pdf')}
                  className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md flex items-center gap-2"
                >
                  <FileText className="h-3.5 w-3.5 text-rose-600" />
                  <span>PDF (.pdf)</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="sm"
              onClick={() => {
                setEditingDoc(null);
                resetUploadForm();
                setIsUploadOpen(true);
              }}
              className="h-9 gap-1.5 text-xs font-bold bg-brand hover:bg-brand-hover text-white shadow-xs rounded-md px-4"
            >
              <FilePlus className="h-4 w-4" />
              + Upload Document
            </Button>
          </div>
        </div>

        {/* Instrument-Panel KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Total Documents"
            label="DEV VAULT COUNT"
            value={totalDocs}
            icon={FolderGit2}
            variant="brand"
            description="Total documents in developer vault"
            isActive={typeFilter === 'All'}
            onClick={() => setTypeFilter('All')}
          />
          <KpiCard
            title="PDF Agreements"
            label="PDF FORMAT"
            value={pdfCount}
            icon={FileText}
            variant="rose"
            description="Contracts, SLAs & certifications"
            isActive={typeFilter === 'PDF'}
            onClick={() => setTypeFilter(typeFilter === 'PDF' ? 'All' : 'PDF')}
          />
          <KpiCard
            title="Architecture & Media"
            label="IMAGE FORMAT"
            value={imageCount}
            icon={ImageIcon}
            variant="blue"
            description="System diagrams & ERD blueprints"
            isActive={typeFilter === 'Image'}
            onClick={() => setTypeFilter(typeFilter === 'Image' ? 'All' : 'Image')}
          />
          <KpiCard
            title="Vault Storage Used"
            label="STORAGE CAPACITY"
            value={formatBytes(totalStorage)}
            icon={HardDrive}
            variant="emerald"
            description="Encrypted persistent storage"
            onClick={() => {
              setTypeFilter('All');
              setCategoryFilter('All');
              setStatusFilter('All');
              setSearchTerm('');
            }}
          />
        </div>

        {/* Toolbar & Control Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          {/* Search Bar */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search document title, file name, version, tags..."
              className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filter Select Dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="pl-3 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand cursor-pointer"
            >
              <option value="All">All Categories</option>
              <option value="Software Agreements">Software Agreements</option>
              <option value="System Architecture">System Architecture</option>
              <option value="SLA & Maintenance">SLA & Maintenance</option>
              <option value="Commercials & Invoices">Commercials & Invoices</option>
              <option value="Release Notes & Handover">Release Notes & Handover</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="pl-3 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand cursor-pointer"
            >
              <option value="All">All File Types</option>
              <option value="PDF">PDF Documents</option>
              <option value="Image">Image Files</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pl-3 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand cursor-pointer"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Under Review">Under Review</option>
              <option value="Archived">Archived</option>
            </select>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shrink-0">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
              title="List View"
            >
              <List size={15} />
              <span className="hidden sm:inline">List</span>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
              title="Grid View"
            >
              <LayoutGrid size={15} />
              <span className="hidden sm:inline">Grid</span>
            </button>
          </div>
        </div>

        {/* Ledger & Empty State Table */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
          {/* Header Bar */}
          <div className="px-4 py-3.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-500" />
              <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Aprodac Document Ledger</h2>
            </div>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
              {filteredDocuments.length} {filteredDocuments.length === 1 ? 'record' : 'records'}
            </span>
          </div>

          {/* Clean Honest Empty State */}
          {filteredDocuments.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-full flex items-center justify-center mb-3">
                <FolderGit2 className="w-7 h-7 text-slate-400" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No developer documents found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                {searchTerm || categoryFilter !== 'All' || typeFilter !== 'All' || statusFilter !== 'All'
                  ? 'No documents match your filter criteria. Try adjusting or clearing your filters.'
                  : 'Upload your company software agreements, system specs, or image blueprints from Aprodac.'}
              </p>
              <div className="mt-4 flex items-center gap-3">
                {(searchTerm || categoryFilter !== 'All' || typeFilter !== 'All' || statusFilter !== 'All') ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchTerm('');
                      setCategoryFilter('All');
                      setTypeFilter('All');
                      setStatusFilter('All');
                    }}
                    className="text-xs font-semibold"
                  >
                    Clear Filters
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingDoc(null);
                      resetUploadForm();
                      setIsUploadOpen(true);
                    }}
                    className="bg-brand hover:bg-brand-hover text-white text-xs font-bold gap-1.5"
                  >
                    <FilePlus size={15} />
                    + Upload First Document
                  </Button>
                )}
              </div>
            </div>
          ) : viewMode === 'list' ? (
            /* List View Table */
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Document Title</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Version</th>
                    <th className="py-3 px-3">Type</th>
                    <th className="py-3 px-3">Size</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Uploaded</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {filteredDocuments.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group">
                      {/* Document Title & Details */}
                      <td className="py-3 px-4 max-w-md">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                            doc.fileType === 'pdf'
                              ? 'bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-400'
                              : 'bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-950/40 dark:border-blue-900/60 dark:text-blue-400'
                          }`}>
                            {doc.fileType === 'pdf' ? <FileText size={18} /> : <ImageIcon size={18} />}
                          </div>
                          <div className="min-w-0">
                            <h4
                              onClick={() => setPreviewDoc(doc)}
                              className="font-bold text-slate-900 dark:text-slate-100 hover:text-brand transition-colors cursor-pointer truncate"
                            >
                              {doc.title}
                            </h4>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">{doc.description}</p>
                            {doc.tags && doc.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {doc.tags.map((tag) => (
                                  <span key={tag} className="text-[9.5px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <Badge variant="outline" className="text-[11px] font-medium bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                          {doc.category}
                        </Badge>
                      </td>

                      {/* Version */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                          {doc.version}
                        </span>
                      </td>

                      {/* Type */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <Badge
                          variant="secondary"
                          className={`text-[10px] uppercase font-bold ${
                            doc.fileType === 'pdf'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                          }`}
                        >
                          {doc.fileType.toUpperCase()}
                        </Badge>
                      </td>

                      {/* Size */}
                      <td className="py-3 px-3 whitespace-nowrap text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                        {formatBytes(doc.sizeBytes)}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          doc.status === 'Active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900/60 dark:text-emerald-400'
                            : doc.status === 'Under Review'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-900/60 dark:text-amber-400'
                            : 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            doc.status === 'Active' ? 'bg-emerald-500' : doc.status === 'Under Review' ? 'bg-amber-500' : 'bg-slate-400'
                          }`} />
                          {doc.status}
                        </span>
                      </td>

                      {/* Uploaded */}
                      <td className="py-3 px-3 whitespace-nowrap text-[11px] text-slate-500 dark:text-slate-400">
                        <div>{doc.uploadedAt}</div>
                        <div className="text-[10px] text-slate-400">{doc.uploadedBy}</div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setPreviewDoc(doc)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Preview Document"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            onClick={() => handleDownload(doc)}
                            className="p-1.5 text-slate-500 hover:text-brand hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Download File"
                          >
                            <Download size={15} />
                          </button>
                          <button
                            onClick={() => handleEditClick(doc)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Edit Document"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(doc.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                            title="Delete Document"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Grid View Cards */
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="group relative rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-brand/40 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className={`p-2.5 rounded-xl ${
                        doc.fileType === 'pdf'
                          ? 'bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-400'
                          : 'bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-950/40 dark:border-blue-900/60 dark:text-blue-400'
                      }`}>
                        {doc.fileType === 'pdf' ? <FileText size={22} /> : <ImageIcon size={22} />}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                          {doc.version}
                        </span>
                        <Badge variant="outline" className="text-[10px] font-semibold">
                          {doc.status}
                        </Badge>
                      </div>
                    </div>

                    <h3
                      onClick={() => setPreviewDoc(doc)}
                      className="font-bold text-slate-900 dark:text-slate-100 text-sm hover:text-brand transition-colors cursor-pointer line-clamp-2"
                    >
                      {doc.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{doc.description}</p>
                  </div>

                  {doc.fileType === 'image' && doc.dataUrl && (
                    <div
                      onClick={() => setPreviewDoc(doc)}
                      className="mt-3 h-28 w-full rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 cursor-pointer group-hover:opacity-95 transition-opacity"
                    >
                      <img src={doc.dataUrl} alt={doc.title} className="w-full h-full object-cover" />
                    </div>
                  )}

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-[11px] font-semibold text-slate-400 font-mono">
                      {formatBytes(doc.sizeBytes)}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPreviewDoc(doc)}
                        className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="Preview"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => handleDownload(doc)}
                        className="p-1.5 text-slate-500 hover:text-brand hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="Download"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        onClick={() => handleEditClick(doc)}
                        className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(doc.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Upload / Edit Modal */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal-strong/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-charcoal text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-brand text-white">
                  <Upload size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm">
                    {editingDoc ? 'Edit Developer Document' : 'Upload Developer Document'}
                  </h3>
                  <p className="text-[11px] text-slate-400">PDF specifications & Image blueprints supported</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsUploadOpen(false);
                  setEditingDoc(null);
                  resetUploadForm();
                }}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveDocument} className="p-6 space-y-4 overflow-y-auto flex-1">
              {uploadError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {!editingDoc && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Document File <span className="text-rose-500">*</span> (PDF or Image)
                  </label>

                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        handleFileSelected(e.dataTransfer.files[0]);
                      }
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                      isDragging
                        ? 'border-brand bg-brand/5 scale-[1.01]'
                        : uploadFile
                        ? 'border-emerald-400 bg-emerald-50/40'
                        : 'border-slate-300 dark:border-slate-700 hover:border-brand hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleFileSelected(e.target.files[0]);
                        }
                      }}
                    />

                    {uploadFile ? (
                      <div className="flex items-center justify-center gap-3">
                        <div className={`p-3 rounded-xl ${
                          uploadFile.type.includes('pdf') || uploadFile.name.endsWith('.pdf')
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {uploadFile.type.includes('pdf') || uploadFile.name.endsWith('.pdf') ? (
                            <FileText size={24} />
                          ) : (
                            <ImageIcon size={24} />
                          )}
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate max-w-xs">{uploadFile.name}</p>
                          <p className="text-[11px] text-slate-500">{formatBytes(uploadFile.size)} • Click to change</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Upload size={28} className="mx-auto text-slate-400" />
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Drag and drop your file here, or <span className="text-brand underline">browse</span>
                        </p>
                        <p className="text-[10px] text-slate-500">Supports PDF documents (.pdf) and Images (.png, .jpg, .svg)</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Document Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="e.g. Master Services Agreement v1.0"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-brand/20 focus:border-brand dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Version</label>
                  <input
                    type="text"
                    value={uploadVersion}
                    onChange={(e) => setUploadVersion(e.target.value)}
                    placeholder="v1.0"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono focus:ring-2 focus:ring-brand/20 focus:border-brand dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Category</label>
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-brand/20 focus:border-brand dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="Software Agreements">Software Agreements</option>
                    <option value="System Architecture">System Architecture</option>
                    <option value="SLA & Maintenance">SLA & Maintenance</option>
                    <option value="Commercials & Invoices">Commercials & Invoices</option>
                    <option value="Release Notes & Handover">Release Notes & Handover</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Status</label>
                  <select
                    value={uploadStatus}
                    onChange={(e) => setUploadStatus(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-brand/20 focus:border-brand dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="Active">Active</option>
                    <option value="Under Review">Under Review</option>
                    <option value="Archived">Archived</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Tags (Comma Separated)</label>
                <input
                  type="text"
                  value={uploadTags}
                  onChange={(e) => setUploadTags(e.target.value)}
                  placeholder="contract, architecture, sla, security"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-brand/20 focus:border-brand dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Description / Notes</label>
                <textarea
                  rows={3}
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  placeholder="Summary or technical description of the uploaded document..."
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-brand/20 focus:border-brand dark:bg-slate-800 dark:text-slate-100 resize-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsUploadOpen(false);
                    setEditingDoc(null);
                    resetUploadForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-brand hover:bg-brand-hover text-white font-bold"
                >
                  {editingDoc ? 'Save Changes' : 'Save to Vault'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Lightbox Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal-strong/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-charcoal text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  previewDoc.fileType === 'pdf' ? 'bg-rose-500/20 text-rose-400' : 'bg-blue-500/20 text-blue-400'
                }`}>
                  {previewDoc.fileType === 'pdf' ? <FileText size={20} /> : <ImageIcon size={20} />}
                </div>
                <div>
                  <h3 className="font-bold text-sm truncate max-w-md">{previewDoc.title}</h3>
                  <p className="text-[11px] text-slate-400">{previewDoc.category} • {previewDoc.version}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownload(previewDoc)}
                  className="h-8 text-xs font-semibold gap-1.5 border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
                >
                  <Download size={14} />
                  Download
                </Button>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 bg-slate-50 dark:bg-slate-950">
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-inner min-h-[220px] flex items-center justify-center">
                {previewDoc.fileType === 'image' && previewDoc.dataUrl ? (
                  <img
                    src={previewDoc.dataUrl}
                    alt={previewDoc.title}
                    className="max-h-[380px] w-auto object-contain rounded-lg shadow-2xs"
                  />
                ) : previewDoc.fileType === 'pdf' && previewDoc.dataUrl ? (
                  <iframe
                    src={previewDoc.dataUrl}
                    title={previewDoc.title}
                    className="w-full h-[380px] rounded-lg border border-slate-200 dark:border-slate-800"
                  />
                ) : (
                  <div className="text-center p-8">
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3 ${
                      previewDoc.fileType === 'pdf' ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'
                    }`}>
                      {previewDoc.fileType === 'pdf' ? <FileText size={32} /> : <ImageIcon size={32} />}
                    </div>
                    <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">{previewDoc.fileName}</h4>
                    <p className="text-xs text-slate-500 mt-1">Uploaded Document ({formatBytes(previewDoc.sizeBytes)})</p>
                    <Button
                      onClick={() => handleDownload(previewDoc)}
                      className="mt-4 bg-brand hover:bg-brand-hover text-white text-xs font-bold gap-2"
                    >
                      <Download size={14} />
                      Download File Content
                    </Button>
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Document Specifications</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Uploaded Date</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{previewDoc.uploadedAt}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Uploaded By</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{previewDoc.uploadedBy}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Version</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{previewDoc.version}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">File Size</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{formatBytes(previewDoc.sizeBytes)}</span>
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] mb-1">Description</span>
                  <p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 leading-relaxed">
                    {previewDoc.description}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal-strong/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">Delete Document?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to remove this document from the vault? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteConfirmId(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => handleDeleteDocument(deleteConfirmId)}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
              >
                Yes, Delete Document
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
