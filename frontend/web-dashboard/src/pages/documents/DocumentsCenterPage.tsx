import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  UploadCloud, Download, ChevronDown, FileSpreadsheet, FileText, Search, X, Truck, User as UserIcon,
  Building2, Trash2, LayoutGrid, List, CheckCircle2, FileArchive, RotateCcw, Settings2, Loader2,
} from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import ConfirmModal from '@/components/ui/ConfirmModal';
import UploadDocumentModal from '@/components/ui/UploadDocumentModal';
import ExpiryRadarModal from '@/components/ui/ExpiryRadarModal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FigureStrip, Figure } from '@/components/finance/kit/FigureStrip';
import FolderCardSection from '@/components/documents/FolderCardSection';
import DocumentPreviewSheet from '@/components/documents/DocumentPreviewSheet';
import DocumentsTable, { type DocTableRow } from '@/components/documents/center/DocumentsTable';
import SelectionBar, { SelectionAction } from '@/components/documents/center/SelectionBar';

import {
  documentService, type DocStatus, type MerconDocument, type OwnerFoldersSummaryRow, type TrashedDocument,
} from '@/services/documentService';
import { documentTypeService } from '@/services/documentTypeService';
import { driverService } from '@/services/driverService';
import { vehicleService } from '@/services/vehicleService';
import { customerService } from '@/services/customerService';
import { authStore } from '@/store/authStore';
import { documentDisplayName, daysUntil, formatDocDate, sortFoldersByAttentionFirst } from '@/lib/documents';
import {
  type LibraryTab, type StatusFilter, STATUS_FILTER_LABEL, ROW_STATE_STYLE, VERIFICATION_STYLE,
  currentDocuments, docState, folderMatches, rowMatchesStatus, slotState, isVerified,
} from '@/lib/documentLibrary';
import { exportExcelTable, exportPDFTable } from '@/utils/exportUtils';
import { matchesSearch } from '@/lib/search';
import { cn } from '@/lib/utils';

const TABS: Array<{ id: LibraryTab; label: string; icon: React.ElementType }> = [
  { id: 'Vehicles', label: 'Vehicles', icon: Truck },
  { id: 'Drivers', label: 'Drivers', icon: UserIcon },
  { id: 'Company', label: 'Company', icon: Building2 },
  { id: 'Deleted', label: 'Recently deleted', icon: Trash2 },
];

const OWNER_TYPE: Record<'Vehicles' | 'Drivers', 'Vehicle' | 'Driver'> = { Vehicles: 'Vehicle', Drivers: 'Driver' };

const FOLDER_FILTERS: StatusFilter[] = ['all', 'action', 'expired', 'expiring', 'missing', 'compliant', 'unverified'];
const COMPANY_FILTERS: StatusFilter[] = ['all', 'action', 'expired', 'expiring', 'compliant', 'unverified'];

const FILTER_CHIP_TONE: Partial<Record<StatusFilter, string>> = {
  action: 'data-[on=true]:bg-rose-50 data-[on=true]:text-rose-700 data-[on=true]:border-rose-200 dark:data-[on=true]:bg-rose-950/40 dark:data-[on=true]:text-rose-300 dark:data-[on=true]:border-rose-900',
  expired: 'data-[on=true]:bg-rose-50 data-[on=true]:text-rose-700 data-[on=true]:border-rose-200 dark:data-[on=true]:bg-rose-950/40 dark:data-[on=true]:text-rose-300 dark:data-[on=true]:border-rose-900',
  expiring: 'data-[on=true]:bg-amber-50 data-[on=true]:text-amber-700 data-[on=true]:border-amber-200 dark:data-[on=true]:bg-amber-950/40 dark:data-[on=true]:text-amber-300 dark:data-[on=true]:border-amber-900',
  compliant: 'data-[on=true]:bg-emerald-50 data-[on=true]:text-emerald-700 data-[on=true]:border-emerald-200 dark:data-[on=true]:bg-emerald-950/40 dark:data-[on=true]:text-emerald-300 dark:data-[on=true]:border-emerald-900',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Older links: ?category=Other|Operations, ?filter=warning|critical|valid. */
function tabFromParams(p: URLSearchParams): LibraryTab {
  const t = p.get('tab') || p.get('category');
  if (t === 'Drivers') return 'Drivers';
  if (t === 'Company' || t === 'Other' || t === 'Operations') return 'Company';
  if (t === 'Deleted') return 'Deleted';
  return 'Vehicles';
}
function statusFromParams(p: URLSearchParams): StatusFilter {
  const s = p.get('status') || p.get('filter');
  if (s === 'warning' || s === 'critical') return 'expiring';
  if (s === 'valid') return 'compliant';
  return (FOLDER_FILTERS as string[]).includes(s || '') ? (s as StatusFilter) : 'all';
}

function documentNumber(d: MerconDocument): string | null {
  return d.ai_extracted_json?.document_number || null;
}

export default function DocumentsCenterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = authStore.getUser()?.role === 'Admin';

  const tab = tabFromParams(searchParams);
  const status = statusFromParams(searchParams);
  const view: 'folders' | 'table' = searchParams.get('view') === 'table' || searchParams.get('view') === 'list' ? 'table' : 'folders';
  const typeId = searchParams.get('type') || null;
  const [search, setSearch] = useState(searchParams.get('q') || searchParams.get('search') || '');

  const setParam = (updates: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const legacy of ['category', 'filter', 'search']) next.delete(legacy);
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === '' || (k === 'status' && v === 'all') || (k === 'tab' && v === 'Vehicles') || (k === 'view' && v === 'folders')) next.delete(k);
        else next.set(k, v);
      }
      return next;
    }, { replace: true });
  };

  const [selectedOwners, setSelectedOwners] = useState<Set<string>>(new Set());
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const clearSelection = () => { setSelectedOwners(new Set()); setSelectedDocs(new Set()); };
  useEffect(clearSelection, [tab, view]);

  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isRadarOpen, setIsRadarOpen] = useState(searchParams.get('radar') === 'open');
  const [uploadTarget, setUploadTarget] = useState<{ ownerType: string; ownerId: string; ownerName: string; typeId: string | null; typeName: string } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'purge'; ids: string[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // ─── Data ──────────────────────────────────────────────────────────────────
  const { data: docs = [], isLoading: docsLoading, isError } = useQuery({
    queryKey: ['documents', 'library'],
    queryFn: async () => (await documentService.getAll({ scope: 'library', per_page: 5000 })).data,
  });
  const { data: vehicleFolders = [], isLoading: vfLoading } = useQuery({
    queryKey: ['documents', 'owner-folders', 'Vehicle'],
    queryFn: () => documentService.getOwnerFolders('Vehicle'),
  });
  const { data: driverFolders = [], isLoading: dfLoading } = useQuery({
    queryKey: ['documents', 'owner-folders', 'Driver'],
    queryFn: () => documentService.getOwnerFolders('Driver'),
  });
  const { data: trash = [] } = useQuery({
    queryKey: ['documents', 'trash'],
    queryFn: () => documentService.getTrash(),
  });
  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers', 'lookup'],
    queryFn: async () => (await driverService.getAll({ per_page: 1000, mode: 'lookup' })).data,
  });
  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles', 'lookup'],
    queryFn: async () => (await vehicleService.getAll({ per_page: 1000, mode: 'lookup' })).data,
  });
  const { data: customers = [] } = useQuery({
    queryKey: ['customers', 'lookup'],
    queryFn: async () => (await customerService.getAll({ per_page: 500, mode: 'lookup' })).data,
  });
  const { data: documentTypes = [] } = useQuery({
    queryKey: ['document-types', 'all'],
    queryFn: async () => (await documentTypeService.getAll()).data,
  });

  // Old deep links pass a document id as ?search= — open that document.
  useEffect(() => {
    const q = searchParams.get('search');
    if (q && UUID_RE.test(q)) navigate(`/documents/doc/${q}`, { replace: true });
  }, [searchParams, navigate]);

  const refreshAll = () => queryClient.invalidateQueries({ queryKey: ['documents'] });

  // ─── Derived ───────────────────────────────────────────────────────────────
  const statusByDocId = useMemo(() => new Map<string, DocStatus>(docs.map((d) => [d.id, d.status])), [docs]);
  const current = useMemo(() => currentDocuments(docs), [docs]);
  const versionCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docs) if (d.documentTypeId) {
      const k = `${d.entity_type}:${d.entity_id}:${d.documentTypeId}`;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }, [docs]);

  const driverPhoto = useMemo(() => new Map<string, string | null>(drivers.map((d: any) => [d.id, d.avatar_url || null])), [drivers]);
  const ownerFolders = useMemo<OwnerFoldersSummaryRow[]>(() => {
    if (tab === 'Vehicles') return vehicleFolders;
    if (tab !== 'Drivers') return [];
    return driverFolders.map((r) => (r.avatar_url ? r : { ...r, avatar_url: driverPhoto.get(r.ownerId) ?? null }));
  }, [tab, driverFolders, vehicleFolders, driverPhoto]);
  const ownerType = tab === 'Vehicles' || tab === 'Drivers' ? OWNER_TYPE[tab] : null;
  const folderById = useMemo(() => new Map(ownerFolders.map((r) => [r.ownerId, r])), [ownerFolders]);

  const customerName = useMemo(() => new Map(customers.map((c: any) => [c.id, c.name])), [customers]);
  const driverName = useMemo(() => new Map(drivers.map((d: any) => [d.id, `${d.first_name} ${d.last_name}`.trim()])), [drivers]);
  const vehicleName = useMemo(() => new Map(vehicles.map((v: any) => [v.id, v.plate_number || v.ref_id])), [vehicles]);

  const typesForTab = useMemo(() => {
    const want = ownerType ?? null;
    return documentTypes
      .filter((t) => t.requirementStatus !== 'DISABLED' && (want ? t.ownerType === want : t.ownerType !== 'Driver' && t.ownerType !== 'Vehicle'))
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }, [documentTypes, ownerType]);

  const companyDocs = useMemo(() => current.filter((d) => d.entity_type !== 'Vehicle' && d.entity_type !== 'Driver'), [current]);
  const ownerDocs = useMemo(() => (ownerType ? current.filter((d) => d.entity_type === ownerType) : []), [current, ownerType]);

  const toRow = (d: MerconDocument | TrashedDocument): DocTableRow => {
    const folder = folderById.get(d.entity_id);
    let ownerName: string;
    let ownerSub: string | null = null;
    if (d.entity_type === 'Vehicle' || d.entity_type === 'Driver') {
      ownerName = folder?.ownerName
        || (d.entity_type === 'Vehicle' ? vehicleName.get(d.entity_id) : driverName.get(d.entity_id))
        || `Removed ${d.entity_type.toLowerCase()}`;
      ownerSub = folder ? [folder.ownerRef, folder.relatedName].filter(Boolean).join(' · ') || null : null;
    } else if (d.entity_type === 'Customer') {
      ownerName = customerName.get(d.entity_id) || 'Customer';
      ownerSub = 'Customer';
    } else if (d.entity_type === 'MaintenanceRecord') {
      ownerName = 'Maintenance record';
    } else {
      ownerName = d.entity_type === 'Company' ? 'Company' : d.entity_type;
    }
    return {
      key: d.id,
      docId: d.id,
      typeId: d.documentTypeId ?? null,
      typeName: documentDisplayName(d),
      number: documentNumber(d),
      ownerType: d.entity_type,
      ownerId: d.entity_id,
      ownerName,
      ownerSub,
      expiry: d.expiry_date,
      days: daysUntil(d.expiry_date),
      state: docState(d),
      verification: d.status,
      uploadedAt: d.createdAt,
      deletedAt: (d as TrashedDocument).deletedAt ?? null,
      fileUrl: d.file_url,
      isConfidential: d.is_confidential,
      versionCount: d.documentTypeId ? versionCount.get(`${d.entity_type}:${d.entity_id}:${d.documentTypeId}`) : undefined,
    };
  };

  const textMatch = (r: DocTableRow) => matchesSearch(search, [r.typeName, r.number || '', r.ownerName, r.ownerSub || '']);

  // Vehicles / Drivers — folder cards
  const visibleFolders = useMemo(() => {
    const rows = ownerFolders.filter((r) =>
      matchesSearch(search, [r.ownerName, r.ownerRef || '', r.relatedName || '', ...r.slots.map((s) => s.name)])
      && folderMatches(r, status, typeId, statusByDocId));
    return sortFoldersByAttentionFirst(rows);
  }, [ownerFolders, search, status, typeId, statusByDocId]);

  // Vehicles / Drivers — table rows: current documents plus missing mandatory slots
  const ownerRows = useMemo(() => {
    if (!ownerType) return [];
    const rows: DocTableRow[] = ownerDocs.map(toRow);
    for (const f of ownerFolders) {
      for (const s of f.slots) {
        if (s.status !== 'MISSING') continue;
        rows.push({
          key: `missing:${f.ownerId}:${s.documentTypeId}`, docId: null, typeId: s.documentTypeId, typeName: s.name, number: null,
          ownerType, ownerId: f.ownerId, ownerName: f.ownerName,
          ownerSub: [f.ownerRef, f.relatedName].filter(Boolean).join(' · ') || null,
          expiry: null, days: null, state: 'missing', verification: null, uploadedAt: null,
        });
      }
    }
    return rows.filter((r) => (!typeId || r.typeId === typeId) && rowMatchesStatus(r.state, r.verification, status) && textMatch(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerDocs, ownerFolders, ownerType, typeId, status, search, folderById, versionCount]);

  const companyRows = useMemo(
    () => companyDocs.map(toRow).filter((r) => (!typeId || r.typeId === typeId) && rowMatchesStatus(r.state, r.verification, status) && textMatch(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [companyDocs, typeId, status, search, customerName, versionCount],
  );

  const trashRows = useMemo(
    () => trash.map(toRow).filter(textMatch),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trash, search, folderById, customerName, driverName, vehicleName],
  );

  // ─── Headline figures for the open tab ─────────────────────────────────────
  const figures = useMemo(() => {
    if (ownerType) {
      let expired = 0, expiring = 0, missing = 0, compliantOwners = 0;
      for (const f of ownerFolders) {
        let ok = true;
        for (const s of f.slots) {
          const st = slotState(s.status);
          if (st === 'expired') expired++;
          if (st === 'expiring') expiring++;
          if (st === 'missing') missing++;
          if (st !== 'valid') ok = false;
        }
        if (ok) compliantOwners++;
      }
      const unverified = ownerDocs.filter((d) => !isVerified(d.status)).length;
      const pct = ownerFolders.length ? Math.round((compliantOwners / ownerFolders.length) * 100) : 100;
      return { expired, expiring, missing, unverified, compliantPct: pct, compliantOwners, owners: ownerFolders.length, total: ownerDocs.length };
    }
    const states = companyDocs.map((d) => docState(d));
    return {
      expired: states.filter((s) => s === 'expired').length,
      expiring: states.filter((s) => s === 'expiring').length,
      missing: 0,
      unverified: companyDocs.filter((d) => !isVerified(d.status)).length,
      compliantPct: null as number | null,
      compliantOwners: 0,
      owners: 0,
      total: companyDocs.length,
    };
  }, [ownerType, ownerFolders, ownerDocs, companyDocs]);

  const actionCount = (rows: OwnerFoldersSummaryRow[]) =>
    rows.filter((r) => r.slots.some((s) => s.status !== 'VALID')).length;
  const tabBadge: Record<LibraryTab, { count: number; alert: number }> = {
    Vehicles: { count: vehicleFolders.length, alert: actionCount(vehicleFolders) },
    Drivers: { count: driverFolders.length, alert: actionCount(driverFolders) },
    Company: { count: companyDocs.length, alert: companyDocs.filter((d) => ['expired', 'expiring'].includes(docState(d))).length },
    Deleted: { count: trash.length, alert: 0 },
  };

  // ─── Selection → document ids ──────────────────────────────────────────────
  const selectedDocIds = useMemo(() => {
    if (view === 'folders' && ownerType) {
      return ownerDocs.filter((d) => selectedOwners.has(d.entity_id)).map((d) => d.id);
    }
    return Array.from(selectedDocs);
  }, [view, ownerType, ownerDocs, selectedOwners, selectedDocs]);

  const selectionLabel = view === 'folders' && ownerType
    ? `${selectedOwners.size} folder${selectedOwners.size === 1 ? '' : 's'} · ${selectedDocIds.length} document${selectedDocIds.length === 1 ? '' : 's'}`
    : `${selectedDocIds.length} selected`;
  const hasSelection = view === 'folders' && ownerType ? selectedOwners.size > 0 : selectedDocs.size > 0;

  const toggleOwner = (row: OwnerFoldersSummaryRow) => setSelectedOwners((prev) => {
    const next = new Set(prev);
    if (next.has(row.ownerId)) next.delete(row.ownerId); else next.add(row.ownerId);
    return next;
  });
  const allFoldersSelected = visibleFolders.length > 0 && visibleFolders.every((r) => selectedOwners.has(r.ownerId));
  const someFoldersSelected = visibleFolders.some((r) => selectedOwners.has(r.ownerId));
  const toggleAllFolders = () => setSelectedOwners(allFoldersSelected ? new Set() : new Set(visibleFolders.map((r) => r.ownerId)));

  // ─── Actions ───────────────────────────────────────────────────────────────
  const downloadZip = async (ids: string[]) => {
    if (!ids.length) return toast.error('Nothing uploaded in the selected folders yet');
    setBusy('zip');
    try {
      const blob = await documentService.bulkDownloadZip(ids);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `documents-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Couldn't build the download. Try fewer documents.");
    } finally {
      setBusy(null);
    }
  };

  const markVerified = async (ids: string[]) => {
    if (!ids.length) return;
    setBusy('verify');
    try {
      await documentService.bulkUpdateStatus(ids, 'Verified');
      toast.success(`${ids.length} document${ids.length === 1 ? '' : 's'} marked verified`);
      await refreshAll();
    } catch {
      toast.error("Couldn't update the documents");
    } finally {
      setBusy(null);
    }
  };

  const restore = async (ids: string[]) => {
    try {
      const n = await documentService.restore(ids);
      toast.success(`${n} document${n === 1 ? '' : 's'} restored`);
      setSelectedDocs(new Set());
      await refreshAll();
    } catch {
      toast.error("Couldn't restore");
    }
  };

  const runConfirmed = async () => {
    if (!confirm) return;
    setBusy('confirm');
    try {
      if (confirm.kind === 'delete') {
        await documentService.bulkDelete(confirm.ids);
        const ids = confirm.ids;
        toast.success(`${ids.length} document${ids.length === 1 ? '' : 's'} moved to Recently deleted`, {
          action: { label: 'Undo', onClick: () => restore(ids) },
        });
      } else {
        const n = await documentService.purge(confirm.ids);
        toast.success(`${n} document${n === 1 ? '' : 's'} deleted for good`);
      }
      clearSelection();
      setConfirm(null);
      await refreshAll();
    } catch {
      toast.error("Couldn't delete");
    } finally {
      setBusy(null);
    }
  };

  const exportRows = (rows: DocTableRow[], format: 'excel' | 'pdf') => {
    if (!rows.length) return toast.error('Nothing to export');
    const headers = ['Document', 'Number', 'Owner', 'Expiry', 'State', 'Check', 'Uploaded'];
    const data = rows.map((r) => [
      r.typeName, r.number || '', r.ownerName, r.expiry ? formatDocDate(r.expiry) : '',
      ROW_STATE_STYLE[r.state].label, r.verification ? VERIFICATION_STYLE[r.verification].label : '',
      r.uploadedAt ? formatDocDate(r.uploadedAt) : '',
    ]);
    const name = `documents-${tab.toLowerCase()}-${new Date().toISOString().slice(0, 10)}`;
    if (format === 'excel') exportExcelTable(`${tab} documents`, headers, data, `${name}.xlsx`);
    else exportPDFTable(`${tab} documents`, headers, data, `${name}.pdf`);
  };

  /** What the header Export button exports: the rows the open tab shows. */
  const exportableRows = (): DocTableRow[] => {
    if (tab === 'Company') return companyRows;
    if (tab === 'Deleted') return trashRows;
    if (view === 'table') return ownerRows;
    const owners = new Set(visibleFolders.map((r) => r.ownerId));
    return ownerRows.filter((r) => owners.has(r.ownerId));
  };
  const selectedRows = (): DocTableRow[] => {
    const ids = new Set(selectedDocIds);
    return [...ownerDocs, ...companyDocs].filter((d) => ids.has(d.id)).map(toRow);
  };

  const openOwner = (r: { ownerType: string; ownerId: string }) => {
    if (r.ownerType === 'Vehicle') navigate(`/documents/vehicles/${r.ownerId}`);
    else if (r.ownerType === 'Driver') navigate(`/documents/drivers/${r.ownerId}`);
  };

  const loading = docsLoading || (tab === 'Vehicles' && vfLoading) || (tab === 'Drivers' && dfLoading);
  const filters = tab === 'Company' ? COMPANY_FILTERS : FOLDER_FILTERS;

  return (
    <DashboardLayout active="Documents" title="Documents">
      <div className="px-4 sm:px-6 pb-24 w-full flex flex-col gap-3 animate-fade-in">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">Documents</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {current.length} documents · {vehicleFolders.length} vehicles · {driverFolders.length} drivers
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={() => navigate('/settings/document-types')} className="h-9 gap-1.5 text-xs font-semibold text-slate-500">
                <Settings2 className="w-3.5 h-3.5" /> Document types
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs font-semibold rounded-xl">
                  <Download className="w-3.5 h-3.5" /> Export <ChevronDown className="w-3 h-3 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => exportRows(exportableRows(), 'excel')} className="text-xs gap-2">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportRows(exportableRows(), 'pdf')} className="text-xs gap-2">
                  <FileText className="w-3.5 h-3.5 text-rose-600" /> PDF (.pdf)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={() => setIsUploadOpen(true)} className="h-9 gap-1.5 text-xs bg-[#FA634E] hover:bg-[#FA634E]/90 text-white font-bold rounded-xl px-4 border-none">
              <UploadCloud className="w-4 h-4" /> Upload
            </Button>
          </div>
        </div>

        {/* ── Headline figures (click to filter) ─────────────────────────── */}
        {tab !== 'Deleted' && (
          <FigureStrip className="flex-none">
            <Figure label="Expired" dot="bg-rose-500" value={figures.expired} tone={figures.expired ? 'text-rose-600 dark:text-rose-400' : null}
              onClick={() => setParam({ status: status === 'expired' ? 'all' : 'expired' })} active={status === 'expired'} loading={loading} />
            <Figure label="Expiring in 30 days" dot="bg-amber-500" value={figures.expiring} tone={figures.expiring ? 'text-amber-600 dark:text-amber-400' : null}
              onClick={() => setParam({ status: status === 'expiring' ? 'all' : 'expiring' })} active={status === 'expiring'} loading={loading} />
            {ownerType && (
              <Figure label="Missing" dot="bg-slate-400" value={figures.missing}
                onClick={() => setParam({ status: status === 'missing' ? 'all' : 'missing' })} active={status === 'missing'} loading={loading} />
            )}
            <Figure label="Not verified" dot="bg-sky-500" value={figures.unverified} sub={`of ${figures.total} documents`}
              onClick={() => setParam({ status: status === 'unverified' ? 'all' : 'unverified' })} active={status === 'unverified'} loading={loading} />
            {figures.compliantPct !== null && (
              <Figure label={`${tab} fully compliant`} dot="bg-emerald-500"
                value={`${figures.compliantPct}%`} tone="text-emerald-600 dark:text-emerald-400"
                sub={`${figures.compliantOwners} of ${figures.owners}`}
                onClick={() => setParam({ status: status === 'compliant' ? 'all' : 'compliant' })} active={status === 'compliant'} loading={loading} />
            )}
          </FigureStrip>
        )}

        {/* ── Tabs + search ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-5 overflow-x-auto no-scrollbar" role="tablist">
            {TABS.map((t) => {
              const Icon = t.icon;
              const on = tab === t.id;
              const b = tabBadge[t.id];
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={on}
                  onClick={() => { setParam({ tab: t.id, status: null, type: null }); }}
                  className={cn(
                    'flex items-center gap-1.5 pb-2 pt-1 text-xs font-bold whitespace-nowrap border-b-2 -mb-px cursor-pointer transition-colors',
                    on ? 'border-charcoal text-slate-900 dark:border-slate-200 dark:text-slate-100' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                  <span className="font-mono text-[11px] font-semibold text-slate-400">{b.count}</span>
                  {b.alert > 0 && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" title={`${b.alert} need action`} />}
                </button>
              );
            })}
          </div>
          <span className="hidden lg:inline pb-2 text-[11px] text-slate-400">Trip photos and POD are on each trip</span>
        </div>

        {/* ── Filters ────────────────────────────────────────────────────── */}
        {tab !== 'Deleted' ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setParam({ q: e.target.value }); }}
                placeholder={tab === 'Drivers' ? 'Driver, ID, document number…' : tab === 'Vehicles' ? 'Plate, driver, document number…' : 'Document, owner, number…'}
                className="h-8 w-60 text-xs pl-8 pr-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FA634E]/30"
              />
              {search && (
                <button type="button" onClick={() => { setSearch(''); setParam({ q: null }); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer" aria-label="Clear search">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {ownerType && view === 'folders' && (
              <label className="flex items-center gap-1.5 pr-2 mr-1 border-r border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 cursor-pointer">
                <Checkbox
                  checked={allFoldersSelected ? true : someFoldersSelected ? 'indeterminate' : false}
                  onCheckedChange={toggleAllFolders}
                  aria-label="Select all folders"
                  className="border-slate-300 dark:border-slate-600 data-[state=checked]:bg-charcoal data-[state=checked]:border-charcoal data-[state=checked]:text-white data-[state=indeterminate]:bg-charcoal data-[state=indeterminate]:text-white"
                />
                All
              </label>
            )}
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                data-on={status === f}
                onClick={() => setParam({ status: f })}
                className={cn(
                  'px-3 py-1 rounded-full text-[11px] font-semibold border cursor-pointer transition-colors',
                  'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800',
                  'data-[on=true]:bg-charcoal data-[on=true]:text-white data-[on=true]:border-charcoal',
                  FILTER_CHIP_TONE[f],
                )}
              >
                {STATUS_FILTER_LABEL[f]}
              </button>
            ))}
            <Select value={typeId ?? 'all'} onValueChange={(v) => setParam({ type: v === 'all' ? null : v })}>
              <SelectTrigger className="h-7 w-auto min-w-[140px] text-[11px] font-semibold rounded-full border-slate-200 dark:border-slate-700">
                <SelectValue placeholder="Any document type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Any document type</SelectItem>
                {typesForTab.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">
                    {t.name}{t.requirementStatus === 'MANDATORY' ? ' · mandatory' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {ownerType && (
              <div className="ml-auto flex items-center p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                {([['folders', LayoutGrid, 'Folders'], ['table', List, 'Table']] as const).map(([v, Icon, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setParam({ view: v })}
                    className={cn(
                      'px-2.5 py-1 text-[11px] font-semibold rounded-md flex items-center gap-1.5 cursor-pointer',
                      view === v ? 'bg-charcoal text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setParam({ q: e.target.value }); }}
                placeholder="Document, owner, number…"
                className="h-8 w-60 text-xs pl-8 pr-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FA634E]/30"
              />
              {search && (
                <button type="button" onClick={() => { setSearch(''); setParam({ q: null }); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer" aria-label="Clear search">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Deleted documents stay here for 30 days, then they're removed for good. Restore one to put it back in its folder.
            </p>
          </div>
        )}

        {/* ── Content ────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-slate-400 text-xs">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading documents…
          </div>
        ) : isError ? (
          <div className="py-20 text-center text-xs text-rose-500">Couldn't load documents. Refresh to try again.</div>
        ) : tab === 'Deleted' ? (
          <DocumentsTable
            rows={trashRows}
            mode="deleted"
            ownerLabel="Owner"
            selected={selectedDocs}
            onSelectionChange={setSelectedDocs}
            onRestore={(id) => restore([id])}
            onPurge={(id) => setConfirm({ kind: 'purge', ids: [id] })}
            emptyText="Nothing deleted in the last 30 days"
          />
        ) : tab === 'Company' ? (
          <DocumentsTable
            rows={companyRows}
            ownerLabel="Belongs to"
            selected={selectedDocs}
            onSelectionChange={setSelectedDocs}
            onPreview={setPreviewDocId}
            onOpen={(id) => navigate(`/documents/doc/${id}`)}
            onDelete={(id) => setConfirm({ kind: 'delete', ids: [id] })}
            emptyText={search || status !== 'all' || typeId ? 'No company documents match these filters' : 'No company documents yet — upload contracts, licences and registrations here'}
          />
        ) : view === 'table' ? (
          <DocumentsTable
            rows={ownerRows}
            ownerLabel={ownerType === 'Vehicle' ? 'Vehicle' : 'Driver'}
            selected={selectedDocs}
            onSelectionChange={setSelectedDocs}
            onPreview={setPreviewDocId}
            onOpen={(id) => navigate(`/documents/doc/${id}`)}
            onOpenOwner={openOwner}
            onUploadMissing={(r) => setUploadTarget({ ownerType: r.ownerType, ownerId: r.ownerId, ownerName: r.ownerName, typeId: r.typeId, typeName: r.typeName })}
            onDelete={(id) => setConfirm({ kind: 'delete', ids: [id] })}
            emptyText="No documents match these filters"
          />
        ) : visibleFolders.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-14 text-center">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No {tab.toLowerCase()} match these filters</p>
            <p className="text-xs text-slate-400 mt-1">Clear the search or pick another status.</p>
          </div>
        ) : (
          <FolderCardSection
            noun={tab.toLowerCase()}
            rows={visibleFolders}
            onOpenRow={(row) => openOwner(row)}
            onPreviewDocument={setPreviewDocId}
            onUploadMissing={(row, slotCode) => {
              const slot = row.slots.find((s) => s.code === slotCode);
              setUploadTarget({ ownerType: row.ownerType, ownerId: row.ownerId, ownerName: row.ownerName, typeId: slot?.documentTypeId ?? null, typeName: slot?.name ?? '' });
            }}
            selectedIds={selectedOwners}
            onToggleSelect={toggleOwner}
            highlightTypeId={typeId}
          />
        )}
      </div>

      {/* ── Bulk actions ───────────────────────────────────────────────────── */}
      {hasSelection && (
        <SelectionBar label={selectionLabel} onClear={clearSelection}>
          {tab === 'Deleted' ? (
            <>
              <SelectionAction icon={<RotateCcw className="w-3.5 h-3.5" />} label="Restore" onClick={() => restore(selectedDocIds)} />
              <SelectionAction icon={<Trash2 className="w-3.5 h-3.5" />} label="Delete for good" danger onClick={() => setConfirm({ kind: 'purge', ids: selectedDocIds })} />
            </>
          ) : (
            <>
              <SelectionAction icon={busy === 'zip' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileArchive className="w-3.5 h-3.5" />} label="Download zip" busy={busy === 'zip'} onClick={() => downloadZip(selectedDocIds)} />
              <SelectionAction icon={<FileSpreadsheet className="w-3.5 h-3.5" />} label="Export" onClick={() => exportRows(selectedRows(), 'excel')} />
              <SelectionAction icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="Mark verified" busy={busy === 'verify'} onClick={() => markVerified(selectedDocIds)} />
              <SelectionAction
                icon={<Trash2 className="w-3.5 h-3.5" />}
                label="Delete"
                danger
                onClick={() => (selectedDocIds.length ? setConfirm({ kind: 'delete', ids: selectedDocIds }) : toast.error('Nothing uploaded in the selected folders yet'))}
              />
            </>
          )}
        </SelectionBar>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <ConfirmModal
        isOpen={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirmed}
        isLoading={busy === 'confirm'}
        isDestructive
        title={confirm?.kind === 'purge' ? 'Delete for good?' : `Delete ${confirm?.ids.length === 1 ? 'this document' : `${confirm?.ids.length} documents`}?`}
        message={confirm?.kind === 'purge'
          ? `${confirm.ids.length === 1 ? 'This document' : `These ${confirm.ids.length} documents`} can't be restored after this.`
          : "They'll move to Recently deleted. You can restore them for 30 days."}
        confirmLabel={confirm?.kind === 'purge' ? 'Delete for good' : 'Delete'}
      />

      <DocumentPreviewSheet
        documentId={previewDocId}
        onClose={() => setPreviewDocId(null)}
        showOpenFolder
        onDeleted={refreshAll}
      />

      {uploadTarget && (
        <UploadDocumentModal
          isOpen
          onClose={() => setUploadTarget(null)}
          entityType={uploadTarget.ownerType}
          entityId={uploadTarget.ownerId}
          documentTypeId={uploadTarget.typeId ?? undefined}
          documentTypeName={uploadTarget.typeName}
          lockOwner
          ownerDisplayName={uploadTarget.ownerName}
          onUploadSuccess={() => { refreshAll(); setUploadTarget(null); }}
        />
      )}

      <UploadDocumentModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        entityType={ownerType ?? 'Company'}
        onUploadSuccess={refreshAll}
      />


      <ExpiryRadarModal isOpen={isRadarOpen} onClose={() => { setIsRadarOpen(false); setParam({ radar: null }); }} />
    </DashboardLayout>
  );
}
