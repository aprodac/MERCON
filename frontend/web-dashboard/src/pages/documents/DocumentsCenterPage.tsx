import { useMemo, useState, useEffect } from 'react';
import { 
  UploadCloud, FileText, FolderOpen, Shield, Car, User as UserIcon, Eye, Download,
  RotateCw, AlertTriangle, CheckCircle2, FileCheck, Briefcase, Clock, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, FileBadge2, FileBarChart2, FileClock, FileKey2, LayoutGrid, List, Check, HardDrive,
  ExternalLink, Trash2, Filter, ShieldAlert, ArrowUpDown, X, FileSpreadsheet, FolderPlus, FolderInput, Folder, CheckSquare, Truck, Sparkles, Loader2, ChevronDown, ArrowRight,
  Hash, Building2, Calendar, Search, Lock, Globe
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import KpiCard from '@/components/ui/KpiCard';
import DataTable, { Column } from '@/components/ui/DataTable';
import ConfirmModal from '@/components/ui/ConfirmModal';
import BulkActionBar from '@/components/ui/BulkActionBar';
import { CalendarAlert as CalendarAlertIcon, DriverBadge, FleetTruck, CheckBadge } from '@/components/ui/kpi-icons';
import { documentService, type MerconDocument, type DocType, type OwnerFoldersSummaryRow } from '@/services/documentService';
import { folderService, type MerconFolder } from '@/services/folderService';
import { downloadCSV, exportExcelTable, exportPDFTable } from '@/utils/exportUtils';
import { driverService } from '@/services/driverService';
import { vehicleService } from '@/services/vehicleService';
import { tripService } from '@/services/tripService';
import { customerService } from '@/services/customerService';
import { documentDisplayName, categoryForDocType, categoryForEntity, type DocCategory, daysUntil, getExpiryStatus, formatExpiryText, resolveFileUrl, formatBilingualAuthority, formatDocDate, getOwnerCardSummary, sortFoldersByAttentionFirst } from '@/lib/documents';
import FolderCardSection from '@/components/documents/FolderCardSection';
import DocumentPreviewSheet from '@/components/documents/DocumentPreviewSheet';
import ImportReviewModal from '@/components/documents/ImportReviewModal';
import DocumentsLedgerMatrixView from '@/components/documents/DocumentsLedgerMatrixView';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import UploadDocumentModal from '@/components/ui/UploadDocumentModal';
import ExpiryRadarModal from '@/components/ui/ExpiryRadarModal';
import CreateFolderModal from '@/components/ui/CreateFolderModal';
import CreateFolderChoiceModal from '@/components/ui/CreateFolderChoiceModal';
import OwnerFolderPickerModal from '@/components/ui/OwnerFolderPickerModal';
import MoveToFolderModal from '@/components/ui/MoveToFolderModal';
import { AutoAssignModal } from '@/components/ui/AutoAssignModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { cn } from '@/lib/utils';
import { matchesSearch } from '@/lib/search';
import { useDeploymentTimezone, formatInDeploymentTz } from '@/lib/datetime';

// ─── Category & Icon Config ──────────────────────────────────────────────────

type PillCategory = 'All' | 'Drivers' | 'Vehicles' | 'Other' | 'Unassigned';
const CATEGORY_TABS: PillCategory[] = ['Vehicles', 'Drivers', 'Other'];
const PILL_LABEL: Record<PillCategory, string> = {
  All: 'All Documents',
  Drivers: 'Driver Docs',
  Vehicles: 'Vehicle Docs',
  Other: 'Company & Operations',
  Unassigned: 'Unassigned',
};

const CAT_STYLES: Record<PillCategory, { active: string; inactive: string }> = {
  Vehicles: {
    active: 'bg-emerald-600 border-emerald-600 text-white shadow-md hover:bg-emerald-700 ring-2 ring-emerald-500/20',
    inactive: 'text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80',
  },
  Drivers: {
    active: 'bg-indigo-600 border-indigo-600 text-white shadow-md hover:bg-indigo-700 ring-2 ring-indigo-500/20',
    inactive: 'text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80',
  },
  Other: {
    active: 'bg-violet-600 border-violet-600 text-white shadow-md hover:bg-violet-700 ring-2 ring-violet-500/20',
    inactive: 'text-slate-600 dark:text-slate-300 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/20 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80',
  },
  All: {
    active: 'bg-brand border-brand text-white shadow-md ring-2 ring-brand/20',
    inactive: 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80',
  },
  Unassigned: {
    active: 'bg-amber-600 border-amber-600 text-white shadow-md ring-2 ring-amber-500/20',
    inactive: 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80',
  },
};

const CATEGORY_CONFIG: Record<DocCategory, {
  icon: React.ElementType;
  color: string;
  iconBg: string;
  borderColor: string;
  label: string;
  description: string;
}> = {
  Drivers:    { icon: UserIcon,      color: 'text-brand',   iconBg: 'bg-brand-light dark:bg-brand/10', borderColor: 'border-brand/20', label: 'Driver Documents', description: 'Licenses, medical certificates & permits' },
  Vehicles:   { icon: Car,           color: 'text-blue-600',    iconBg: 'bg-blue-50 dark:bg-blue-950/30',    borderColor: 'border-blue-200/60',   label: 'Vehicle Documents', description: 'Registrations, insurance & Istimara' },
  Operations: { icon: Briefcase,     color: 'text-violet-600',  iconBg: 'bg-violet-50 dark:bg-violet-950/30',borderColor: 'border-violet-200/60', label: 'Operations Files', description: 'Waybills, PODs & customs clearance' },
  Company:    { icon: Shield,        color: 'text-emerald-600', iconBg: 'bg-emerald-50 dark:bg-emerald-950/30', borderColor: 'border-emerald-200/60', label: 'Company Records', description: 'Contracts, invoices & corporate filings' },
};

const DOC_TYPE_ICON: Record<string, React.ElementType> = {
  DriverLicense:       FileBadge2,
  Passport:            FileBadge2,
  VehicleRegistration: FileKey2,
  Insurance:           FileCheck,
  POD:                 FileBarChart2,
  CustomsClearance:    FileKey2,
  Waybill:             FileClock,
  Contract:            FileText,
  Invoice:             FileBarChart2,
  Emergency:           ShieldAlert,
};

const REGULATORY_BODY: Record<string, string> = {
  DriverLicense:       'Saudi MOT / Transport Auth',
  Passport:            'Passport Authority',
  VehicleRegistration: 'MOMRAH / Istimara',
  Insurance:           'Najm Insurance Protection',
  POD:                 'MERCON Dispatch System',
  CustomsClearance:    'ZATCA Saudi Customs',
  Waybill:             'Saudi Land Transport Auth',
  Contract:            'Ministry of Commerce',
  Invoice:             'ZATCA Tax Authority',
  Emergency:           'Civil Defense / Operations Center',
};

const EXPIRY_BADGE: Record<string, { label: string; className: string }> = {
  expired:  { label: 'Expired',      className: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800/50' },
  critical: { label: 'Critical <7d', className: 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-800/40' },
  warning:  { label: 'Due Soon',     className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800/40' },
  valid:    { label: 'Valid',         className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-800/40' },
  none:     { label: 'No Expiry',    className: 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700' },
};

// ─── Enriched Document Type ──────────────────────────────────────────────────

type EnrichedDocument = MerconDocument & {
  entityName: string;
  category: DocCategory;
  expStatus: 'expired' | 'critical' | 'warning' | 'valid' | 'none';
  daysLeft: number | null;
  issuer: string;
};

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function DocumentsCenterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tz = useDeploymentTimezone();

  // Initial params from URL
  const initialFilter = (searchParams.get('filter') as any) || 'all';
  const rawInitialCategory = searchParams.get('category') || 'Vehicles';
  const initialSearch = searchParams.get('search') || '';
  const initialSort = searchParams.get('sort') || 'attention';
  const initialView = searchParams.get('view') === 'list' ? 'list' : 'folders';

  // Operations/Company were separate pills before merging into a single "Other" pill.
  const initialCategory: PillCategory =
    rawInitialCategory === 'Operations' || rawInitialCategory === 'Company'
      ? 'Other'
      : (CATEGORY_TABS as string[]).includes(rawInitialCategory) ? (rawInitialCategory as PillCategory) : 'Vehicles';
  const initialRadar = searchParams.get('radar') === 'open';

  // State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [folderSubFilter, setFolderSubFilter] = useState<'all' | 'compliant' | 'expiring' | 'issues' | 'missing'>('all');
  const [activeCategory, setActiveCategory] = useState<PillCategory>(initialCategory);
  const [expiryFilter, setExpiryFilter] = useState<'all' | 'expired' | 'critical' | 'warning' | 'valid'>(
    ['all', 'expired', 'critical', 'warning', 'valid'].includes(initialFilter) ? initialFilter : 'all'
  );
  const [search, setSearch] = useState(initialSearch);
  const [sortBy, setSortBy] = useState<'attention' | 'expiry' | 'plate' | 'recent'>(
    ['attention', 'expiry', 'plate', 'recent'].includes(initialSort) ? (initialSort as any) : 'attention'
  );
  const [viewMode, setViewMode] = useState<'folders' | 'list'>(initialView);

  const updateUrlParams = (key: string, val: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!val || val === 'all' || val === 'folders' || val === 'attention' || val === 'Vehicles') {
        next.delete(key);
      } else {
        next.set(key, val);
      }
      return next;
    });
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    updateUrlParams('search', val);
  };

  const handleFilterChange = (val: 'all' | 'expired' | 'critical' | 'warning' | 'valid') => {
    setExpiryFilter(val);
    updateUrlParams('filter', val);
  };

  const handleSortChange = (val: 'attention' | 'expiry' | 'plate' | 'recent') => {
    setSortBy(val);
    updateUrlParams('sort', val);
  };

  const handleViewChange = (val: 'folders' | 'list') => {
    setViewMode(val);
    updateUrlParams('view', val);
  };

  const [isAutoAssigning, setIsAutoAssigning] = useState(false);
  const [isAutoAssignModalOpen, setIsAutoAssignModalOpen] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [previewDoc, setPreviewDoc] = useState<EnrichedDocument | null>(null);
  const [folderSheetDocId, setFolderSheetDocId] = useState<string | null>(null);
  const [uploadMissingTarget, setUploadMissingTarget] = useState<{ row: OwnerFoldersSummaryRow; slotCode: string } | null>(null);
  const [docRotation, setDocRotation] = useState<number>(0);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isFolderChoiceOpen, setIsFolderChoiceOpen] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [isOwnerFolderPickerOpen, setIsOwnerFolderPickerOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [moveTargetDocIds, setMoveTargetDocIds] = useState<string[]>([]);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isExpiryModalOpen, setIsExpiryModalOpen] = useState(initialRadar);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[]>([]);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleExportDocs = (docs: MerconDocument[], format: 'excel' | 'pdf') => {
    if (!docs.length) return;
    const headers = ['Ref ID', 'Title', 'Document Type', 'Issue Date', 'Expiry Date', 'Status', 'Days Remaining', 'Owner Type', 'Owner ID'];
    const dataRows = docs.map((d) => {
      const expiry = d.expiry_date ? new Date(d.expiry_date) : null;
      const days = expiry ? Math.ceil((expiry.getTime() - new Date().getTime()) / (1000 * 3600 * 24)) : null;
      const remainingStr = days === null ? 'N/A' : days <= 0 ? 'Expired' : `${days} days`;

      return [
        (d as any).ref_id || d.id || '',
        (d as any).title || (d as any).document_number || '',
        d.doc_type || '',
        d.issue_date ? d.issue_date.slice(0, 10) : '',
        d.expiry_date ? d.expiry_date.slice(0, 10) : '',
        d.status || '',
        remainingStr,
        (d as any).owner_type || (d as any).entity_type || '',
        (d as any).owner_id || (d as any).entity_id || '',
      ];
    });

    const title = 'Documents Center Export';
    const filename = `documents_export_${new Date().toISOString().slice(0, 10)}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
    if (format === 'excel') {
      exportExcelTable(title, headers, dataRows, filename);
    } else {
      exportPDFTable(title, headers, dataRows, filename);
    }
  };

  // Sync state with URL params when they change
  useEffect(() => {
    const filterParam = searchParams.get('filter');
    if (filterParam && ['all', 'expired', 'critical', 'warning', 'valid'].includes(filterParam)) {
      setExpiryFilter(filterParam as any);
    }
    const catParam = searchParams.get('category');
    if (catParam === 'Operations' || catParam === 'Company') {
      setActiveCategory('Other');
    } else if (catParam && (CATEGORY_TABS as string[]).includes(catParam)) {
      setActiveCategory(catParam as PillCategory);
    }
    if (searchParams.get('radar') === 'open') {
      setIsExpiryModalOpen(true);
    }
  }, [searchParams]);

  // Reset page to 1 when filters or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeCategory, expiryFilter, search]);

  // Queries
  const { data: docs = [], isLoading, isError } = useQuery({
    queryKey: ['documents', 'all'],
    queryFn: async () => (await documentService.getAll({ per_page: 2000 })).data,
  });
  const { data: folders = [] } = useQuery({
    queryKey: ['folders'],
    queryFn: async () => (await folderService.getAll()).data,
  });
  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers', 'lookup'],
    queryFn: async () => (await driverService.getAll({ per_page: 1000, mode: 'lookup' })).data,
  });
  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles', 'lookup'],
    queryFn: async () => (await vehicleService.getAll({ per_page: 1000, mode: 'lookup' })).data,
  });
  const { data: trips = [] } = useQuery({
    queryKey: ['trips', 'lookup'],
    queryFn: async () => (await tripService.getAll({ per_page: 100 })).data,
  });
  const { data: customers = [] } = useQuery({
    queryKey: ['customers', 'lookup'],
    queryFn: async () => (await customerService.getAll({ per_page: 500, mode: 'lookup' })).data,
  });
  // Every Driver/Vehicle's mandatory checklist in one call each — powers the
  // owner-first folder cards below (includes owners with zero uploads, so
  // "Missing" is visible even before anything has ever been uploaded for them).
  const { data: driverFolders = [] } = useQuery({
    queryKey: ['documents', 'owner-folders', 'Driver'],
    queryFn: () => documentService.getOwnerFolders('Driver'),
  });
  const { data: vehicleFolders = [] } = useQuery({
    queryKey: ['documents', 'owner-folders', 'Vehicle'],
    queryFn: () => documentService.getOwnerFolders('Vehicle'),
  });
  const enrichedDriverFolders = useMemo(() => {
    return driverFolders.map((row) => {
      const matched = drivers.find((d: any) => d.id === row.ownerId || d.name === row.ownerName);
      const rawAvatar = row.avatar_url || matched?.avatar_url || null;
      return {
        ...row,
        avatar_url: rawAvatar ? resolveFileUrl(rawAvatar) : null,
      };
    });
  }, [driverFolders, drivers]);

  const filteredDriverFolders = useMemo(
    () => sortFoldersByAttentionFirst(enrichedDriverFolders.filter((r) => matchesSearch(search, [
      r.ownerName,
      r.ownerRef || '',
      r.relatedName || '',
      ...r.slots.map((s) => s.name),
      ...r.slots.map((s) => s.code),
    ]))),
    [enrichedDriverFolders, search],
  );
  const filteredVehicleFolders = useMemo(
    () => sortFoldersByAttentionFirst(vehicleFolders.filter((r) => matchesSearch(search, [
      r.ownerName,
      r.ownerRef || '',
      r.relatedName || '',
      ...r.slots.map((s) => s.name),
      ...r.slots.map((s) => s.code),
    ]))),
    [vehicleFolders, search]
  );

  const needAttentionTotal = useMemo(() => {
    return vehicleFolders.filter((r) => r.slots.some((s) => s.status === 'EXPIRED' || s.status === 'MISSING' || s.status === 'EXPIRING_SOON')).length;
  }, [vehicleFolders]);

  const folderStats = useMemo(() => {
    const foldersList = activeCategory === 'Vehicles' ? filteredVehicleFolders : filteredDriverFolders;
    
    let all = foldersList.length;
    let compliant = 0;
    let expiring = 0;
    let issues = 0;
    let missing = 0;

    foldersList.forEach((row) => {
      const summary = getOwnerCardSummary(row.slots);
      if (summary.isCompliant) {
        compliant++;
      }
      
      const hasIssues = row.slots.some(s => s.status === 'EXPIRED');
      const hasExpiring = row.slots.some(s => s.status === 'EXPIRING_SOON');
      const hasMissing = row.slots.some(s => s.status === 'MISSING');

      if (hasIssues) issues++;
      if (hasExpiring) expiring++;
      if (hasMissing) missing++;
    });

    return { all, compliant, expiring, issues, missing };
  }, [activeCategory, filteredVehicleFolders, filteredDriverFolders]);

  const finalFolders = useMemo(() => {
    const foldersList = activeCategory === 'Vehicles' ? filteredVehicleFolders : filteredDriverFolders;
    
    if (folderSubFilter === 'all') return foldersList;
    
    return foldersList.filter((row) => {
      const summary = getOwnerCardSummary(row.slots);
      if (folderSubFilter === 'compliant') return summary.isCompliant;
      if (folderSubFilter === 'issues') return row.slots.some(s => s.status === 'EXPIRED');
      if (folderSubFilter === 'expiring') return row.slots.some(s => s.status === 'EXPIRING_SOON');
      if (folderSubFilter === 'missing') return row.slots.some(s => s.status === 'MISSING');
      return true;
    });
  }, [activeCategory, filteredVehicleFolders, filteredDriverFolders, folderSubFilter]);

  const totalCount = finalFolders.length;
  const folderTotalPages = Math.ceil(totalCount / pageSize) || 1;
  const paginatedFolders = useMemo(() => {
    const from = (currentPage - 1) * pageSize;
    return finalFolders.slice(from, from + pageSize);
  }, [finalFolders, currentPage, pageSize]);

  const handleSelectCategory = (cat: PillCategory) => {
    setActiveCategory(cat);
    setCurrentPage(1);
    setFolderSubFilter('all');
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (cat === 'All') {
        next.delete('category');
      } else {
        next.set('category', cat);
      }
      return next;
    });
  };

  const [isAiOcrRunning, setIsAiOcrRunning] = useState(false);
  const [extractingRowId, setExtractingRowId] = useState<string | null>(null);

  const handleSingleDocAiOcr = async (docId: string, docLabel: string) => {
    setExtractingRowId(docId);
    toast.info(`Extracting metadata via Gemini AI Vision for ${docLabel}...`);
    try {
      await documentService.extractDocumentOcr(docId);
      toast.success(`Successfully extracted & saved AI metadata for ${docLabel}!`);
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      await queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    } catch (err: any) {
      toast.error('AI extraction error: ' + (err.message || 'Failed to extract metadata'));
    } finally {
      setExtractingRowId(null);
    }
  };

  const handleBulkExtractSelectedDocs = async (targetIds: string[]) => {
    if (!targetIds || targetIds.length === 0) {
      toast.error('Please select at least one document row');
      return;
    }
    setIsAiOcrRunning(true);
    try {
      toast.info(`Extracting AI metadata via Gemini Vision for ${targetIds.length} selected document(s)...`);
      const res = await documentService.bulkOcrExtract(false, targetIds.length, targetIds);
      toast.success(res.message || `Successfully extracted AI metadata for ${targetIds.length} document(s)!`);
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      await queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || err.message || 'AI OCR Extraction failed');
    } finally {
      setIsAiOcrRunning(false);
    }
  };

  const handleAutoAssignUnlinkedDocs = () => {
    setIsAutoAssignModalOpen(true);
  };

  const handleBulkDownload = async () => {
    if (selectedDocIds.length === 0) return;
    setIsDownloadingZip(true);
    try {
      const blob = await documentService.bulkDownloadZip(selectedDocIds);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `documents-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('Failed to download document archive');
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const handleSingleAssignEntity = async (docId: string, entityType: string, entityId: string) => {
    if (!docId || !entityType || !entityId || entityId === 'unassigned') return;
    try {
      toast.loading('Linking document to ' + entityType + '...', { id: 'assign-doc' });
      await documentService.confirmAutoAssign([{ docId, entityType, entityId }]);
      toast.success('Document entity updated successfully!', { id: 'assign-doc' });
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      await queryClient.invalidateQueries({ queryKey: ['folders'] });
      await queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      await queryClient.invalidateQueries({ queryKey: ['drivers'] });
      if (previewDoc && previewDoc.id === docId) {
        setPreviewDoc((prev) => prev ? { ...prev, entity_type: entityType, entity_id: entityId } : null);
      }
    } catch (err: any) {
      toast.error('Failed assigning document: ' + (err.message || 'Error'), { id: 'assign-doc' });
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['documents'] });
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Entity lookup name map
  const nameFor = useMemo(() => {
    const dMap = new Map(drivers.map((d) => [d.id, `${d.first_name} ${d.last_name}`.trim()]));
    const vMap = new Map(vehicles.map((v) => [v.id, v.plate_number || v.ref_id || '']));
    const tMap = new Map(trips.map((t) => [t.id, t.ref_id || `Trip #${t.id.slice(0, 8)}`]));
    const cMap = new Map(customers.map((c) => [c.id, c.name]));

    return (doc: MerconDocument): string => {
      if (doc.entity_type === 'Driver') return dMap.get(doc.entity_id) || 'Unknown Driver';
      if (doc.entity_type === 'Vehicle') return vMap.get(doc.entity_id) || 'Unknown Vehicle';
      if (doc.entity_type === 'Trip') return tMap.get(doc.entity_id) || 'Trip Operations';
      if (doc.entity_type === 'Customer') return cMap.get(doc.entity_id) || 'Customer Account';
      if (doc.entity_type === 'MaintenanceRecord') return vMap.get(doc.entity_id) || 'Maintenance Service';
      return doc.entity_type;
    };
  }, [drivers, vehicles, trips, customers]);

  // Grouped Folders by Category
  const foldersByCategory = useMemo(() => {
    const map: Record<DocCategory, { count: number; docTypes: string[] }> = {
      Drivers: { count: 0, docTypes: [] },
      Vehicles: { count: 0, docTypes: [] },
      Operations: { count: 0, docTypes: [] },
      Company: { count: 0, docTypes: [] },
    };

    for (const d of docs) {
      const cat = categoryForEntity(d.entity_type);
      map[cat].count += 1;
      if (!map[cat].docTypes.includes(d.doc_type)) {
        map[cat].docTypes.push(d.doc_type);
      }
    }
    return map;
  }, [docs]);

  // Enriched & Filtered Documents
  const filteredDocs = useMemo(() => {
    return docs
      .map((d) => ({
        ...d,
        entityName: nameFor(d),
        category: categoryForEntity(d.entity_type),
        expStatus: getExpiryStatus(d.expiry_date),
        daysLeft: daysUntil(d.expiry_date),
        issuer: REGULATORY_BODY[d.doc_type] || 'Saudi Authority',
      }))
      .filter((d) => {
        const vIds = new Set(vehicles.map((v) => v.id));
        const dIds = new Set(drivers.map((d) => d.id));
        const plateDigits = new Set(vehicles.map((v) => (v.plate_number || '').replace(/\D/g, '')).filter((s) => s.length >= 3));

        const fileUrlNorm = (d.file_url || '').toLowerCase();
        let hasPlateMatch = false;
        for (const digits of plateDigits) {
          if (fileUrlNorm.includes(digits)) {
            hasPlateMatch = true;
            break;
          }
        }

        const isUnlinked = (
          (d.entity_type === 'Vehicle' && !vIds.has(d.entity_id) && !hasPlateMatch) ||
          (d.entity_type === 'Driver' && !dIds.has(d.entity_id)) ||
          (!['Vehicle', 'Driver', 'Trip', 'Customer', 'Company', 'Operations'].includes(d.entity_type) && !hasPlateMatch)
        );

        const matchesCat = activeCategory === 'All'
          ? true
          : activeCategory === 'Unassigned'
            ? isUnlinked
            : activeCategory === 'Other'
              ? (d.category === 'Operations' || d.category === 'Company')
              : d.category === activeCategory;
        const matchesExpiry = expiryFilter === 'all' 
          ? true 
          : expiryFilter === 'warning' 
            ? (d.expStatus === 'warning' || d.expStatus === 'critical')
            : d.expStatus === expiryFilter;
        const matchesFolder = !selectedFolderId || d.folderId === selectedFolderId;
        const matchesTerm = matchesSearch(search, [
          documentDisplayName(d),
          d.entityName,
          d.issuer,
          d.id,
        ]);
        return matchesCat && matchesExpiry && matchesFolder && matchesTerm;
      });
  }, [docs, nameFor, activeCategory, expiryFilter, selectedFolderId, search]);

  // ── Calculated Real Vault Telematics ──────────────────────────────────────────
  const totalDocsCount = docs.length;

  // Overdue / expired: <= 0 days
  const expiredDocs = useMemo(() => docs.filter((d) => {
    const days = daysUntil(d.expiry_date);
    return days !== null && days <= 0;
  }), [docs]);
  const expiredCount = expiredDocs.length;

  // Critical: 1 to 7 days
  const criticalDocs = useMemo(() => docs.filter((d) => {
    const days = daysUntil(d.expiry_date);
    return days !== null && days > 0 && days <= 7;
  }), [docs]);
  const criticalCount = criticalDocs.length;

  // Warning / Due Soon: 8 to 30 days
  const warningDocs = useMemo(() => docs.filter((d) => {
    const days = daysUntil(d.expiry_date);
    return days !== null && days > 7 && days <= 30;
  }), [docs]);
  const warningCount = warningDocs.length;

  // Total expiring soon within 30 days (Critical + Warning, strictly > 0 and <= 30)
  const expiringSoonCount = criticalCount + warningCount;

  // Compliant & Valid: > 30 days or no expiry date (e.g. proof of delivery, customs, company records)
  const validDocs = useMemo(() => docs.filter((d) => {
    const days = daysUntil(d.expiry_date);
    return days === null || days > 30;
  }), [docs]);
  const safeCount = validDocs.length;

  // Total non-expired count
  const nonExpiredCount = Math.max(0, totalDocsCount - expiredCount);
  const compliancePct = totalDocsCount > 0 ? Math.round((nonExpiredCount / totalDocsCount) * 100) : 100;

  // Paginated Subset
  const totalPages = Math.ceil(filteredDocs.length / pageSize) || 1;
  const paginatedDocs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDocs.slice(start, start + pageSize);
  }, [filteredDocs, currentPage, pageSize]);

  const handleDeleteDocument = async () => {
    if (!deleteDocId) return;
    setIsDeleting(true);
    try {
      await documentService.delete(deleteDocId);
      toast.success('Document deleted successfully');
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      await queryClient.invalidateQueries({ queryKey: ['folders'] });
      setDeleteDocId(null);
    } catch (err) {
      toast.error('Failed to delete document');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkDeleteDocuments = async () => {
    if (bulkDeleteIds.length === 0) return;
    setIsDeleting(true);
    try {
      await documentService.bulkDelete(bulkDeleteIds);
      toast.success(`Successfully deleted ${bulkDeleteIds.length} document${bulkDeleteIds.length > 1 ? 's' : ''}`);
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      await queryClient.invalidateQueries({ queryKey: ['folders'] });
      setSelectedDocIds([]);
      setBulkDeleteIds([]);
      setIsBulkDeleteOpen(false);
    } catch (err) {
      toast.error('Failed to delete selected documents');
    } finally {
      setIsDeleting(false);
    }
  };

  // Selection handlers
  const toggleSelectAll = () => {
    if (selectedDocIds.length === filteredDocs.length) {
      setSelectedDocIds([]);
    } else {
      setSelectedDocIds(filteredDocs.map((d) => d.id));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedDocIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  // Group documents by Vehicle, Driver, Operations, Company
  const groupedEntityFolders = useMemo(() => {
    const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
    const driverMap = new Map(drivers.map((d) => [d.id, d]));

    const vehicleGroups = new Map<string, { vehicle: any; docs: EnrichedDocument[]; expiredCount: number }>();
    const driverGroups = new Map<string, { driver: any; docs: EnrichedDocument[]; expiredCount: number }>();
    const operationsDocs: EnrichedDocument[] = [];
    const companyDocs: EnrichedDocument[] = [];
    const unlinkedDocs: EnrichedDocument[] = [];

    const plateDigitsMap = new Map<string, any>();
    for (const v of vehicles) {
      const digits = (v.plate_number || '').replace(/\D/g, '');
      if (digits && digits.length >= 3) {
        plateDigitsMap.set(digits, v);
      }
    }

    for (const doc of filteredDocs) {
      const isExp = doc.daysLeft !== null && doc.daysLeft <= 0;

      let matchedVehicle = (doc.entity_type === 'Vehicle' && vehicleMap.has(doc.entity_id)) ? vehicleMap.get(doc.entity_id) : null;
      if (!matchedVehicle) {
        const fileUrlNorm = (doc.file_url || '').toLowerCase();
        for (const [digits, v] of plateDigitsMap.entries()) {
          if (fileUrlNorm.includes(digits)) {
            matchedVehicle = v;
            break;
          }
        }
      }

      if (matchedVehicle) {
        if (!vehicleGroups.has(matchedVehicle.id)) {
          vehicleGroups.set(matchedVehicle.id, { vehicle: matchedVehicle, docs: [], expiredCount: 0 });
        }
        const g = vehicleGroups.get(matchedVehicle.id)!;
        g.docs.push(doc);
        if (isExp) g.expiredCount += 1;
      } else if (doc.entity_type === 'Driver' && driverMap.has(doc.entity_id)) {
        const d = driverMap.get(doc.entity_id)!;
        if (!driverGroups.has(d.id)) {
          driverGroups.set(d.id, { driver: d, docs: [], expiredCount: 0 });
        }
        const g = driverGroups.get(d.id)!;
        g.docs.push(doc);
        if (isExp) g.expiredCount += 1;
      } else if (doc.category === 'Operations' || doc.entity_type === 'Trip') {
        operationsDocs.push(doc);
      } else if (doc.category === 'Company') {
        companyDocs.push(doc);
      } else {
        unlinkedDocs.push(doc);
      }
    }

    return {
      vehicles: Array.from(vehicleGroups.values()),
      drivers: Array.from(driverGroups.values()),
      operations: operationsDocs,
      company: companyDocs,
      unlinked: unlinkedDocs,
    };
  }, [filteredDocs, vehicles, drivers]);

  const hasFolderResults = useMemo(() => {
    if (activeCategory === 'Vehicles') return filteredVehicleFolders.length > 0;
    if (activeCategory === 'Drivers') return filteredDriverFolders.length > 0;
    if (activeCategory === 'Unassigned') return groupedEntityFolders.unlinked.length > 0;
    if (activeCategory === 'Other') return groupedEntityFolders.operations.length > 0 || groupedEntityFolders.company.length > 0;
    return (
      filteredVehicleFolders.length > 0 ||
      filteredDriverFolders.length > 0 ||
      groupedEntityFolders.operations.length > 0 ||
      groupedEntityFolders.company.length > 0 ||
      groupedEntityFolders.unlinked.length > 0
    );
  }, [activeCategory, filteredVehicleFolders, filteredDriverFolders, groupedEntityFolders]);

  const entityComboboxOptions = useMemo(() => {
    const opts: ComboboxOption[] = [
      {
        value: 'Vehicle:unassigned',
        label: 'Unassigned / Root',
        keywords: 'unassigned unlinked root none loose',
        group: 'Status',
      },
      ...vehicles.map((v) => ({
        value: `Vehicle:${v.id}`,
        label: `Vehicle ${v.plate_number || v.ref_id} (${v.ref_id || 'Truck'})`,
        keywords: `${v.plate_number} ${v.ref_id} vehicle truck ${v.trailer_number || ''}`,
        group: `Vehicles (${vehicles.length})`,
      })),
      ...drivers.map((d) => ({
        value: `Driver:${d.id}`,
        label: `${d.first_name} ${d.last_name} (${d.license_number || d.phone_primary || 'Driver'})`,
        keywords: `${d.first_name} ${d.last_name} ${d.license_number} driver ${d.phone_primary || ''}`,
        group: `Drivers (${drivers.length})`,
      })),
    ];
    return opts;
  }, [vehicles, drivers]);

  return (
    <DashboardLayout active="Documents" title="Documents Center">
      <div className="px-4 sm:px-6 pb-6 w-full flex flex-col animate-fade-in gap-5">

        <div className="flex flex-wrap items-center justify-between gap-4 shrink-0 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              Documents Center
            </h1>
            <p className="text-xs text-slate-505 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 font-medium">
              <span>{vehicleFolders.length} vehicles</span>
              <span className="text-slate-300 dark:text-slate-700 font-black">•</span>
              <span className="text-[#FA634E] font-bold">{needAttentionTotal} need attention</span>
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Export CSV Action */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-xs font-semibold border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 cursor-pointer rounded-xl"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export</span>
                  <ChevronDown className="h-3 w-3 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 p-1.5 shadow-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl z-50">
                <DropdownMenuItem
                  onClick={() => handleExportDocs(filteredDocs, 'excel')}
                  className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md flex items-center gap-2"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Excel (.xlsx)</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleExportDocs(filteredDocs, 'pdf')}
                  className="cursor-pointer text-xs font-semibold py-1.5 px-2 rounded-md flex items-center gap-2"
                >
                  <FileText className="h-3.5 w-3.5 text-rose-600" />
                  <span>PDF (.pdf)</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Coral Red Primary Button */}
            <Button
              size="sm"
              onClick={() => setIsUploadOpen(true)}
              className="h-9 gap-1.5 text-xs bg-[#FA634E] hover:bg-[#FA634E]/90 text-white font-extrabold shadow-xs rounded-xl px-4 cursor-pointer border-none"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Upload Document</span>
            </Button>
          </div>
        </div>

        {/* ── Category Navigation Tabs & Toolbar (Single Line, Right-Aligned Controls) ── */}
        <div className="flex items-center justify-between gap-3 w-full shrink-0 border-b border-slate-200/80 dark:border-slate-800 pb-3 overflow-x-auto scrollbar-none">
          {/* Left Category Tabs Container */}
          <div className="flex items-center gap-1 p-1 bg-[#F2F4F8] dark:bg-slate-900 rounded-full border border-slate-200/60 dark:border-slate-800/80 shrink-0">
            <button
              type="button"
              onClick={() => handleSelectCategory('Vehicles')}
              className={cn(
                "px-3.5 py-1.5 text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer border-none rounded-full whitespace-nowrap",
                activeCategory === 'Vehicles' || activeCategory === 'All'
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs border border-slate-200/50 dark:border-slate-700"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 hover:bg-white/40 dark:hover:bg-slate-800/40"
              )}
            >
              <FileText className={cn("w-3.5 h-3.5", (activeCategory === 'Vehicles' || activeCategory === 'All') ? "text-slate-700 dark:text-slate-200" : "text-slate-400")} />
              <span>Vehicle Documents</span>
              <span className="ml-0.5 text-slate-400 dark:text-slate-500 font-mono text-[11px] font-semibold">
                {vehicleFolders.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectCategory('Drivers')}
              className={cn(
                "px-3.5 py-1.5 text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer border-none rounded-full whitespace-nowrap",
                activeCategory === 'Drivers'
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs border border-slate-200/50 dark:border-slate-700"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 hover:bg-white/40 dark:hover:bg-slate-800/40"
              )}
            >
              <UserIcon className={cn("w-3.5 h-3.5", activeCategory === 'Drivers' ? "text-slate-700 dark:text-slate-200" : "text-slate-400")} />
              <span>Driver Documents</span>
              <span className="ml-0.5 text-slate-400 dark:text-slate-500 font-mono text-[11px] font-semibold">
                {driverFolders.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectCategory('Other')}
              className={cn(
                "px-3.5 py-1.5 text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer border-none rounded-full whitespace-nowrap",
                activeCategory === 'Other'
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs border border-slate-200/50 dark:border-slate-700"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 hover:bg-white/40 dark:hover:bg-slate-800/40"
              )}
            >
              <Building2 className={cn("w-3.5 h-3.5", activeCategory === 'Other' ? "text-slate-700 dark:text-slate-200" : "text-slate-400")} />
              <span>Company & Operations</span>
              <span className="ml-0.5 text-slate-400 dark:text-slate-500 font-mono text-[11px] font-semibold">
                {foldersByCategory.Operations.count + foldersByCategory.Company.count}
              </span>
            </button>
          </div>

          {/* Right Side Control Bar: Search Input + Status Dropdown + View Switcher (Positioned on the Right Side) */}
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search vehicle, plate, driver..."
                className="h-8.5 text-xs pl-8 pr-7 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FA634E]/30 w-44 sm:w-52"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => handleSearchChange('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status Dropdown */}
            <Select value={expiryFilter} onValueChange={(val: any) => handleFilterChange(val)}>
              <SelectTrigger className="h-8.5 text-xs font-extrabold w-32 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-full text-slate-800 dark:text-slate-200">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="warning">Needs Attention</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="critical">Critical &lt;7d</SelectItem>
                <SelectItem value="valid">Compliant</SelectItem>
              </SelectContent>
            </Select>

            {/* View Switcher (Folders vs Ledger) */}
            <div className="flex items-center p-0.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => handleViewChange('folders')}
                className={cn(
                  'px-3 py-1 text-xs font-extrabold rounded-full transition-all flex items-center gap-1.5 cursor-pointer',
                  viewMode === 'folders'
                    ? 'bg-[#0F172A] text-white shadow-2xs'
                    : 'text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                )}
              >
                <LayoutGrid className="w-3.5 h-3.5 text-amber-500" />
                <span>Folders</span>
              </button>
              <button
                type="button"
                onClick={() => handleViewChange('list')}
                className={cn(
                  'px-3 py-1 text-xs font-extrabold rounded-full transition-all flex items-center gap-1.5 cursor-pointer',
                  viewMode === 'list'
                    ? 'bg-[#0F172A] text-white shadow-2xs'
                    : 'text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                )}
              >
                <List className="w-3.5 h-3.5" />
                <span>Ledger</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filter Pills row (Matching Screenshot) */}
        {viewMode === 'folders' && (activeCategory === 'Vehicles' || activeCategory === 'Drivers') && (
          <div className="flex flex-wrap items-center gap-2 pb-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                setFolderSubFilter('all');
                setCurrentPage(1);
              }}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-bold transition-all border cursor-pointer flex items-center gap-1.5",
                folderSubFilter === 'all'
                  ? "bg-[#FFEAEA] border-rose-200/80 text-[#FA4D56]"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
              )}
            >
              <span>All</span>
              <span className="font-mono text-[11px] opacity-80">{folderStats.all}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFolderSubFilter('compliant');
                setCurrentPage(1);
              }}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-bold transition-all border cursor-pointer flex items-center gap-1.5",
                folderSubFilter === 'compliant'
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                  : "bg-white dark:bg-slate-900 border-emerald-200/80 text-emerald-600 hover:bg-emerald-50/50"
              )}
            >
              <span>Compliant</span>
              <span className="font-mono text-[11px] opacity-80">{folderStats.compliant}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFolderSubFilter('expiring');
                setCurrentPage(1);
              }}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-bold transition-all border cursor-pointer flex items-center gap-1.5",
                folderSubFilter === 'expiring'
                  ? "bg-amber-50 text-amber-700 border-amber-300"
                  : "bg-white dark:bg-slate-900 border-amber-200/80 text-amber-600 hover:bg-amber-50/50"
              )}
            >
              <span>Expiring Soon</span>
              <span className="font-mono text-[11px] opacity-80">{folderStats.expiring}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFolderSubFilter('issues');
                setCurrentPage(1);
              }}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-bold transition-all border cursor-pointer flex items-center gap-1.5",
                folderSubFilter === 'issues'
                  ? "bg-rose-50 text-rose-700 border-rose-300"
                  : "bg-white dark:bg-slate-900 border-rose-200/80 text-rose-500 hover:bg-rose-50/50"
              )}
            >
              <span>Issues</span>
              <span className="font-mono text-[11px] opacity-80">{folderStats.issues}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFolderSubFilter('missing');
                setCurrentPage(1);
              }}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-bold transition-all border cursor-pointer flex items-center gap-1.5",
                folderSubFilter === 'missing'
                  ? "bg-slate-100 text-slate-800 border-slate-300"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50"
              )}
            >
              <span>Missing</span>
              <span className="font-mono text-[11px] opacity-80">{folderStats.missing}</span>
            </button>
          </div>
        )}

        {/* ── Document Vault Area (Grouped Folders vs Ledger Matrix View) ────────── */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            <RotateCw className="w-8 h-8 animate-spin text-[#FA634E] opacity-70" />
            <p className="text-xs font-medium">Loading compliance repository...</p>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            <AlertTriangle className="w-8 h-8 text-rose-400 opacity-70" />
            <p className="text-xs text-rose-500 font-medium">Failed to load repository files.</p>
          </div>
        ) : viewMode === 'folders' ? (
          !hasFolderResults ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <FolderOpen className="w-7 h-7 text-slate-300 dark:text-slate-600" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  {search ? `No compliance folders matching "${search}"` : 'No compliance folders found'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">Try clearing your search query or status filter</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 1. Vehicles Group Section */}
              {(activeCategory === 'All' || activeCategory === 'Vehicles') && (
                <FolderCardSection
                  title="Vehicle Compliance Folders"
                  icon={<Truck className="w-4 h-4 text-emerald-600" />}
                  noun="Vehicles"
                  rows={activeCategory === 'All' ? filteredVehicleFolders : paginatedFolders}
                  onOpenRow={(row) => navigate(`/documents/vehicles/${row.ownerId}`)}
                  onPreviewDocument={setFolderSheetDocId}
                  onUploadMissing={(row, slotCode) => setUploadMissingTarget({ row, slotCode })}
                  isOverview={activeCategory === 'All'}
                  onViewAll={() => handleSelectCategory('Vehicles')}
                />
              )}

              {/* 2. Drivers Group Section */}
              {(activeCategory === 'All' || activeCategory === 'Drivers') && (
                <FolderCardSection
                  title="Driver Compliance Folders"
                  icon={<UserIcon className="w-4 h-4 text-blue-600" />}
                  noun="Drivers"
                  rows={activeCategory === 'All' ? filteredDriverFolders : paginatedFolders}
                  onOpenRow={(row) => navigate(`/documents/drivers/${row.ownerId}`)}
                  onPreviewDocument={setFolderSheetDocId}
                  onUploadMissing={(row, slotCode) => setUploadMissingTarget({ row, slotCode })}
                  isOverview={activeCategory === 'All'}
                  onViewAll={() => handleSelectCategory('Drivers')}
                />
              )}

              {/* 3. Other / Company & Operations Group Section */}
              {(activeCategory === 'All' || activeCategory === 'Other') && (groupedEntityFolders.company.length > 0 || groupedEntityFolders.operations.length > 0) && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 tracking-wider uppercase flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-violet-600" />
                      <span>Company & Operations Documents ({groupedEntityFolders.company.length + groupedEntityFolders.operations.length} Records)</span>
                    </h3>
                    {activeCategory === 'All' && (
                      <button
                        onClick={() => handleSelectCategory('Other')}
                        className="text-xs font-bold text-brand hover:text-brand-hover flex items-center gap-1 cursor-pointer"
                      >
                        <span>View all other docs</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {(activeCategory === 'All'
                      ? [...groupedEntityFolders.company, ...groupedEntityFolders.operations].slice(0, 4)
                      : [...groupedEntityFolders.company, ...groupedEntityFolders.operations]
                    ).map((doc) => {
                      const DocIcon = DOC_TYPE_ICON[doc.doc_type] ?? FileText;
                      const catCfg = CATEGORY_CONFIG[doc.category];
                      return (
                        <Card
                          key={doc.id}
                          onClick={() => setPreviewDoc(doc)}
                          className="border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between group"
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={cn('w-9 h-9 rounded-xl border flex items-center justify-center shrink-0', catCfg?.iconBg || 'bg-slate-100 dark:bg-slate-800 text-slate-600')}>
                                  <DocIcon className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <h4 className="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate group-hover:text-brand transition-colors">
                                    {documentDisplayName(doc)}
                                  </h4>
                                  <span className="text-[10px] text-slate-400 font-mono truncate block">
                                    {doc.entityName}
                                  </span>
                                </div>
                              </div>
                              <Badge className={cn('text-[10px] font-mono font-bold px-2 py-0.5 border-0 shrink-0', EXPIRY_BADGE[doc.expStatus]?.className)}>
                                {EXPIRY_BADGE[doc.expStatus]?.label || doc.expStatus}
                              </Badge>
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-2">
                              <span className="text-[10px] text-slate-400">{doc.issuer}</span>
                              <span className="text-[10px] font-mono text-slate-400">#DOC-{doc.id.slice(0, 6)}</span>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Pagination footer */}
              {activeCategory !== 'All' && folderTotalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Showing {Math.min(totalCount, (currentPage - 1) * pageSize + 1)} to {Math.min(totalCount, currentPage * pageSize)} of {totalCount} {activeCategory === 'Vehicles' ? 'vehicles' : 'drivers'}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-lg cursor-pointer border-slate-200 dark:border-slate-700 bg-white"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4 text-slate-500" />
                    </Button>
                    {Array.from({ length: folderTotalPages }).map((_, idx) => {
                      const pageNum = idx + 1;
                      const isCurrent = currentPage === pageNum;
                      return (
                        <Button
                          key={pageNum}
                          variant={isCurrent ? 'default' : 'outline'}
                          size="sm"
                          className={cn(
                            "h-8 w-8 p-0 rounded-lg text-xs font-bold transition-all cursor-pointer border-slate-200 dark:border-slate-700",
                            isCurrent
                              ? "bg-[#FA634E] hover:bg-[#FA634E]/90 text-white border-[#FA634E]"
                              : "bg-white hover:bg-slate-50 text-slate-650"
                          )}
                          onClick={() => setCurrentPage(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-lg cursor-pointer border-slate-200 dark:border-slate-700 bg-white"
                      disabled={currentPage === folderTotalPages}
                      onClick={() => setCurrentPage((p) => Math.min(folderTotalPages, p + 1))}
                    >
                      <ChevronRight className="h-4 w-4 text-slate-500" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        ) : (
          /* ── Matrix Ledger View (Exact screenshot layout) ── */
          <DocumentsLedgerMatrixView
            activeCategory={activeCategory}
            search={search}
            onSearchChange={handleSearchChange}
            expiryFilter={expiryFilter}
            onExpiryFilterChange={handleFilterChange}
            vehicleFolders={filteredVehicleFolders}
            driverFolders={filteredDriverFolders}
            otherDocs={[...groupedEntityFolders.company, ...groupedEntityFolders.operations]}
            onUploadClick={() => setIsUploadOpen(true)}
            onPreviewDoc={(id) => {
              const d = filteredDocs.find((x) => x.id === id);
              if (d) setPreviewDoc(d);
            }}
            tz={tz}
            vehicles={vehicles}
            drivers={drivers}
          />
        )}

      </div>

      {/* ── Document Details & Intelligence Center Modal ────────────────────── */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => {
        if (!open) {
          setPreviewDoc(null);
          setDocRotation(0);
        }
      }}>
        <DialogContent className="max-w-6xl sm:max-w-6xl w-[94vw] sm:w-[90vw] h-[88vh] max-h-[88vh] flex flex-col p-0 overflow-hidden border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl bg-white dark:bg-slate-900">
          
          {/* Pinned Header */}
          <DialogHeader className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 border border-indigo-200/60 dark:border-indigo-800/60 shadow-xs">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                    {previewDoc ? documentDisplayName(previewDoc) : 'Document Details'}
                  </DialogTitle>
                  {previewDoc && (
                    <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800 font-bold text-[10px] px-2.5 py-0.5 rounded-full">
                      {categoryForEntity(previewDoc.entity_type)}
                    </Badge>
                  )}
                </div>
                {previewDoc && (
                  <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2 font-mono">
                    <span>ID: #{previewDoc.id.slice(0, 12)}...</span>
                    <span>•</span>
                    <span>Owner: {nameFor(previewDoc)}</span>
                  </DialogDescription>
                )}
              </div>
            </div>
          </DialogHeader>

          {previewDoc && (() => {
            const resolvedUrl = resolveFileUrl(previewDoc.file_url);
            const expBadge = EXPIRY_BADGE[previewDoc.expStatus];
            const isExtractingThis = extractingRowId === previewDoc.id;

            return (
              <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 min-h-0 overflow-hidden bg-slate-100/40 dark:bg-slate-950/40">
                
                {/* Left Column (58%): Interactive File & Image Viewer with Rotation */}
                <div className="lg:col-span-7 flex flex-col bg-charcoal-strong/5 dark:bg-slate-950/50 p-4 border-r border-slate-200/80 dark:border-slate-800/80 justify-between min-h-0">
                  
                  {/* Media Viewer Toolbar */}
                  <div className="flex items-center justify-between pb-2 text-xs text-slate-500 font-medium shrink-0">
                    <span className="flex items-center gap-1.5 truncate">
                      <FileCheck size={14} className="text-indigo-600 dark:text-indigo-400" />
                      <span className="truncate">{previewDoc.mime_type || 'Document File'}</span>
                    </span>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDocRotation((prev) => (prev + 90) % 360)}
                        className="h-7 px-2.5 text-[11px] font-bold gap-1.5 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-2xs text-slate-700 dark:text-slate-200 hover:bg-slate-50"
                        title="Rotate document image 90 degrees"
                      >
                        <RotateCw size={12} /> Rotate 90°
                      </Button>

                      <a
                        href={resolvedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-7 px-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-slate-50 flex items-center gap-1 shrink-0 shadow-2xs"
                      >
                        <ExternalLink size={12} /> Open Fullscreen
                      </a>
                    </div>
                  </div>

                  {/* Main File Viewer Container */}
                  <div className="w-full flex-1 rounded-xl bg-charcoal/10 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 overflow-hidden flex items-center justify-center relative p-3 shadow-inner min-h-0">
                    {previewDoc.mime_type?.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(resolvedUrl) ? (
                      <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                        <img
                          src={resolvedUrl}
                          alt={documentDisplayName(previewDoc)}
                          style={{ transform: `rotate(${docRotation}deg)` }}
                          className="max-h-full max-w-full object-contain rounded-lg transition-transform duration-300 shadow-md"
                        />
                      </div>
                    ) : previewDoc.mime_type === 'application/pdf' || /\.pdf$/i.test(resolvedUrl) ? (
                      <iframe
                        src={`${resolvedUrl}#toolbar=0`}
                        title="PDF Document Preview"
                        className="w-full h-full rounded-lg border-none min-h-[380px]"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                          <FileText className="w-8 h-8" />
                        </div>
                        <div>
                          <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                            {documentDisplayName(previewDoc)}
                          </h4>
                          <p className="text-xs text-slate-400 font-mono mt-1">
                            {previewDoc.mime_type || 'Binary Document'}
                          </p>
                        </div>
                        <a
                          href={resolvedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white font-extrabold text-xs shadow-xs hover:bg-indigo-700 transition-all"
                        >
                          <ExternalLink size={13} /> Open File Link
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Footer Info */}
                  <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400 font-mono shrink-0">
                    <span>MIME: {previewDoc.mime_type || 'application/pdf'}</span>
                    <span>Created: {previewDoc.createdAt ? formatInDeploymentTz(previewDoc.createdAt, tz, 'MM/dd/yyyy, HH:mm:ss') : 'N/A'}</span>
                  </div>
                </div>

                {/* Right Column (42%): Fully Scrollable Intelligence Ledger & Details */}
                <div className="lg:col-span-5 flex flex-col h-full overflow-y-auto custom-scrollbar p-6 space-y-5 bg-white dark:bg-slate-900 min-h-0">
                  
                  {/* Status & Compliance Pill Header */}
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Compliance Status</span>
                      <span className={cn('inline-flex items-center gap-1.5 text-xs font-extrabold px-3 py-1 rounded-full border shadow-2xs', expBadge.className)}>
                        {expBadge.label}
                      </span>
                    </div>

                    {previewDoc.daysLeft !== null && (
                      <div className="text-right space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Validity</span>
                        <span className={cn(
                          'text-xs font-mono font-extrabold block',
                          previewDoc.daysLeft <= 0 ? 'text-rose-600' : previewDoc.daysLeft <= 30 ? 'text-amber-600' : 'text-emerald-600'
                        )}>
                          {previewDoc.daysLeft <= 0 ? `${Math.abs(previewDoc.daysLeft)} days overdue` : `${previewDoc.daysLeft} days remaining`}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Interactive Entity Re-assignment Control Card */}
                  <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                        <Truck size={14} className="text-indigo-600 dark:text-indigo-400" />
                        <span>Assigned Fleet Entity Owner</span>
                      </span>
                      <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300 font-mono font-bold text-[10px] px-2 py-0.5 border-0">
                        {previewDoc.entity_type}
                      </Badge>
                    </div>

                    <Combobox
                      options={entityComboboxOptions}
                      value={`${previewDoc.entity_type}:${previewDoc.entity_id}`}
                      onChange={(val) => {
                        const [type, id] = val.split(':');
                        if (type && id) {
                          handleSingleAssignEntity(previewDoc.id, type, id);
                        }
                      }}
                      placeholder="Search vehicle plate or driver name..."
                      searchPlaceholder="Type plate number, ref ID, or driver..."
                      emptyText="No matching vehicles or drivers found."
                      triggerClassName="h-9 text-xs font-extrabold bg-white dark:bg-slate-800 border-indigo-300 dark:border-indigo-700 shadow-2xs text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  {/* Gemini AI Vision OCR Extracted Intelligence Card */}
                  <div className="p-4 rounded-2xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 space-y-3.5 shadow-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-950 dark:text-amber-200">
                        <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Gemini Vision AI Extracted Metadata</span>
                      </div>
                      {previewDoc.ai_extracted_json?.confidence && (
                        <Badge className="bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 font-mono font-bold text-[10px] px-2.5 py-0.5 border-0">
                          {Math.round((previewDoc.ai_extracted_json.confidence > 1 ? previewDoc.ai_extracted_json.confidence / 100 : previewDoc.ai_extracted_json.confidence) * 100)}% Confidence
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 text-xs">
                      <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-amber-200/60 dark:border-slate-700 shadow-2xs">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1">
                          <Hash size={10} /> Doc / Policy #
                        </span>
                        <span className="font-mono font-extrabold text-indigo-600 dark:text-indigo-400 block truncate mt-0.5 text-xs">
                          {previewDoc.ai_extracted_json?.document_number || `DOC-${previewDoc.id.slice(0, 8)}`}
                        </span>
                      </div>

                      <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-amber-200/60 dark:border-slate-700 shadow-2xs">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1">
                          <Truck size={10} /> Vehicle Plate
                        </span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200 block truncate mt-0.5 text-xs">
                          {previewDoc.ai_extracted_json?.vehicle_plate || nameFor(previewDoc)}
                        </span>
                      </div>

                      <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-amber-200/60 dark:border-slate-700 shadow-2xs col-span-2">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1">
                          <Building2 size={10} /> Authority / Issuer (Bilingual)
                        </span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block truncate mt-0.5 text-xs">
                          {formatBilingualAuthority(previewDoc.ai_extracted_json?.issuing_authority || REGULATORY_BODY[previewDoc.doc_type])}
                        </span>
                      </div>

                      <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-amber-200/60 dark:border-slate-700 shadow-2xs col-span-2">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1">
                          <Calendar size={10} /> Expiry Date (Gregorian)
                        </span>
                        <span className="font-mono font-extrabold text-rose-600 dark:text-rose-400 block truncate mt-0.5 text-xs">
                          {previewDoc.expiry_date ? formatInDeploymentTz(previewDoc.expiry_date, tz, 'EEE, MMMM d, yyyy') : 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Extra Extracted Document Attributes (Issue ID, Chassis #, Owner Name, etc.) */}
                    {previewDoc.ai_extracted_json?.extra_details && Object.keys(previewDoc.ai_extracted_json.extra_details).length > 0 && (
                      <div className="pt-2 border-t border-amber-200/60 dark:border-amber-900/40 space-y-1.5">
                        <span className="text-[9px] font-extrabold text-amber-900 dark:text-amber-300 uppercase tracking-wider block">
                          Extracted Document Attributes (Issue ID & Details)
                        </span>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          {Object.entries(previewDoc.ai_extracted_json.extra_details).map(([k, v]) => (
                            v ? (
                              <div key={k} className="bg-white/80 dark:bg-slate-800/80 p-2 rounded-lg border border-amber-200/40 dark:border-slate-700/60">
                                <span className="text-[9px] text-slate-400 font-bold uppercase block truncate">
                                  {k.replace(/_/g, ' ')}
                                </span>
                                <span className="font-mono font-bold text-slate-800 dark:text-slate-200 block truncate">
                                  {String(v)}
                                </span>
                              </div>
                            ) : null
                          ))}
                        </div>
                      </div>
                    )}

                    {previewDoc.ai_extracted_json?.notes && (
                      <div className="p-3 rounded-xl bg-amber-100/60 dark:bg-amber-900/30 border border-amber-200/80 dark:border-amber-800/50 text-[11px] text-amber-950 dark:text-amber-200 italic leading-relaxed">
                        "{previewDoc.ai_extracted_json.notes}"
                      </div>
                    )}

                    {/* AI Re-Extract Button */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSingleDocAiOcr(previewDoc.id, documentDisplayName(previewDoc))}
                      disabled={isExtractingThis}
                      className="w-full h-8.5 text-xs font-extrabold bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800 gap-2 rounded-xl mt-1 shadow-2xs"
                    >
                      {isExtractingThis ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-600" />}
                      <span>Run Gemini AI Vision Re-Scan</span>
                    </Button>
                  </div>

                  {/* Metadata Key-Value System Ledger */}
                  <div className="space-y-3 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 bg-slate-50/50 dark:bg-slate-900/50 text-xs">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block border-b border-slate-200/60 dark:border-slate-800 pb-2">
                      System Metadata Ledger
                    </span>

                    <div className="grid grid-cols-2 gap-3.5 pt-1">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Entity Type</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{previewDoc.entity_type}</span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Entity Owner</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{nameFor(previewDoc)}</span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Folder Placement</span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400 truncate block">
                          {previewDoc.folder?.name || 'Unassigned Root'}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Confidentiality</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1">
                          {previewDoc.is_confidential ? (
                            <>
                              <Lock className="w-3 h-3 text-amber-600" />
                              <span>Restricted</span>
                            </>
                          ) : (
                            <>
                              <Globe className="w-3 h-3 text-slate-400" />
                              <span>Standard</span>
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Action Tools */}
                  <div className="pt-1 grid grid-cols-2 gap-2.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setMoveTargetDocIds([previewDoc.id]);
                        setIsMoveModalOpen(true);
                      }}
                      className="text-xs font-bold gap-1.5 rounded-xl border-slate-200 dark:border-slate-700 h-9"
                    >
                      <FolderInput size={13} /> Move Folder
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteDocId(previewDoc.id)}
                      className="text-xs font-bold gap-1.5 rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 h-9"
                    >
                      <Trash2 size={13} /> Delete File
                    </Button>
                  </div>

                </div>
              </div>
            );
          })()}

          {/* Pinned Footer */}
          <DialogFooter className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 flex items-center justify-between shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPreviewDoc(null);
                setDocRotation(0);
              }}
              className="text-xs font-bold rounded-xl"
            >
              Close
            </Button>
            {previewDoc && (
              <a
                href={resolveFileUrl(previewDoc.file_url)}
                download
                className="h-8.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-md inline-flex items-center gap-2 transition-all"
              >
                <Download size={14} /> Download Source File
              </a>
            )}
          </DialogFooter>

        </DialogContent>
      </Dialog>

      {/* ── Create Folder: Owner Folder vs General Folder chooser ─────────── */}
      <CreateFolderChoiceModal
        isOpen={isFolderChoiceOpen}
        onClose={() => setIsFolderChoiceOpen(false)}
        onChooseOwner={() => {
          setIsFolderChoiceOpen(false);
          setIsOwnerFolderPickerOpen(true);
        }}
        onChooseGeneral={() => {
          setIsFolderChoiceOpen(false);
          setIsCreateFolderOpen(true);
        }}
      />
      <OwnerFolderPickerModal
        isOpen={isOwnerFolderPickerOpen}
        onClose={() => setIsOwnerFolderPickerOpen(false)}
      />
      <CreateFolderModal
        isOpen={isCreateFolderOpen}
        onClose={() => setIsCreateFolderOpen(false)}
      />

      {/* ── Owner-folder document preview sheet (Drivers/Vehicles cards) ─── */}
      <DocumentPreviewSheet
        documentId={folderSheetDocId}
        onClose={() => setFolderSheetDocId(null)}
        showOpenFolder
      />

      {/* ── Missing-slot upload (clicking a Missing row on a Driver/Vehicle card) ─── */}
      {uploadMissingTarget && (() => {
        const slot = uploadMissingTarget.row.slots.find((s) => s.code === uploadMissingTarget.slotCode);
        return (
          <UploadDocumentModal
            isOpen
            onClose={() => setUploadMissingTarget(null)}
            entityType={uploadMissingTarget.row.ownerType}
            entityId={uploadMissingTarget.row.ownerId}
            documentTypeId={slot?.documentTypeId}
            documentTypeName={slot?.name}
            lockOwner
            ownerDisplayName={uploadMissingTarget.row.ownerName}
            onUploadSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['documents', 'owner-folders'] });
              queryClient.invalidateQueries({ queryKey: ['documents'] });
              setUploadMissingTarget(null);
            }}
          />
        );
      })()}

      {/* ── Move to Folder Modal ────────────────────────────────────────── */}
      <MoveToFolderModal
        isOpen={isMoveModalOpen}
        onClose={() => {
          setIsMoveModalOpen(false);
          setMoveTargetDocIds([]);
        }}
        documentIds={moveTargetDocIds}
      />

      {/* ── Staged import: upload → AI reads → review → confirm ──────────── */}
      <ImportReviewModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImported={() => {
          queryClient.invalidateQueries({ queryKey: ['documents'] });
          queryClient.invalidateQueries({ queryKey: ['ownerFolders'] });
        }}
      />

      {/* ── Upload Document Modal ────────────────────────────────────────── */}
      <UploadDocumentModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        folderId={selectedFolderId || undefined}
        onUploadSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['documents'] });
          queryClient.invalidateQueries({ queryKey: ['folders'] });
        }}
      />


      {/* ── Expiry Radar Modal ───────────────────────────────────────────── */}
      <ExpiryRadarModal
        isOpen={isExpiryModalOpen}
        onClose={() => setIsExpiryModalOpen(false)}
      />

      {/* ── Confirm Bulk Delete Documents Modal ─────────────────────────── */}
      <ConfirmModal
        isOpen={isBulkDeleteOpen}
        onClose={() => {
          setIsBulkDeleteOpen(false);
          setBulkDeleteIds([]);
        }}
        onConfirm={handleBulkDeleteDocuments}
        title="Delete Selected Documents"
        message={`Are you sure you want to permanently delete ${bulkDeleteIds.length} selected document${bulkDeleteIds.length > 1 ? 's' : ''} from the compliance vault? This action cannot be undone.`}
        confirmLabel="Delete Documents"
        isDestructive={true}
        isLoading={isDeleting}
      />

      {/* ── Confirm Delete Document Modal ────────────────────────────────── */}
      <ConfirmModal
        isOpen={!!deleteDocId}
        onClose={() => setDeleteDocId(null)}
        onConfirm={handleDeleteDocument}
        title="Delete Vault Document"
        message="Are you sure you want to permanently delete this document record from the compliance vault? This action cannot be undone."
        confirmLabel="Delete Document"
        isDestructive={true}
        isLoading={isDeleting}
      />

      {/* ── Confirm Delete Folder Modal ──────────────────────────────────── */}
      <ConfirmModal
        isOpen={!!deleteFolderId}
        onClose={() => setDeleteFolderId(null)}
        onConfirm={async () => {
          if (!deleteFolderId) return;
          setIsDeleting(true);
          try {
            await folderService.delete(deleteFolderId);
            toast.success('Folder deleted successfully');
            await queryClient.invalidateQueries({ queryKey: ['folders'] });
            await queryClient.invalidateQueries({ queryKey: ['documents'] });
            if (selectedFolderId === deleteFolderId) setSelectedFolderId(null);
            setDeleteFolderId(null);
          } catch (err) {
            toast.error('Failed to delete folder');
          } finally {
            setIsDeleting(false);
          }
        }}
        title="Delete Folder"
        message="Are you sure you want to delete this folder? Documents inside this folder will not be deleted; they will be moved to unassigned root."
        confirmLabel="Delete Folder"
        isDestructive={true}
        isLoading={isDeleting}
      />
      <AutoAssignModal
        isOpen={isAutoAssignModalOpen}
        onClose={() => setIsAutoAssignModalOpen(false)}
        onSuccess={async () => {
          await queryClient.invalidateQueries({ queryKey: ['documents'] });
          await queryClient.invalidateQueries({ queryKey: ['folders'] });
          await queryClient.invalidateQueries({ queryKey: ['vehicles'] });
          await queryClient.invalidateQueries({ queryKey: ['drivers'] });
        }}
      />
    </DashboardLayout>
  );
}
