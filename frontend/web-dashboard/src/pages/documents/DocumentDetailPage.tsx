import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Download, Trash2, Sparkles, Loader2, Plus, XCircle, CheckCircle2, MoreHorizontal,
  Pencil, RefreshCw, Lock, Truck, User as UserIcon, Building2, ArrowUpRight, X, History, Activity,
} from 'lucide-react';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import DocumentCanvasViewer from '@/components/ui/DocumentCanvasViewer';
import UploadDocumentModal from '@/components/ui/UploadDocumentModal';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { documentService, type DocStatus, type DocumentActivityEntry } from '@/services/documentService';
import { documentTypeService, type DocOwnerType } from '@/services/documentTypeService';
import { vehicleService } from '@/services/vehicleService';
import { driverService } from '@/services/driverService';
import { customerService } from '@/services/customerService';
import { documentDisplayName, daysUntil, formatDocDate, formatBilingualAuthority, resolveFileUrl } from '@/lib/documents';
import { ROW_STATE_STYLE, VERIFICATION_STYLE, docState, relativeExpiry } from '@/lib/documentLibrary';
import { cn } from '@/lib/utils';
import { useDeploymentTimezone, formatInDeploymentTz } from '@/lib/datetime';

const TYPED_OWNERS: DocOwnerType[] = ['Driver', 'Vehicle', 'Trip', 'Customer', 'Company', 'Other'];

const STATE_PILL: Record<string, string> = {
  expired: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  expiring: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  valid: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  none: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  missing: 'bg-slate-100 text-slate-600',
};

const FIELD_LABEL: Record<string, string> = {
  type: 'type', issue_date: 'issue date', expiry_date: 'expiry date', document_number: 'number',
  is_confidential: 'confidentiality', folder: 'folder',
};

function describeActivity(e: DocumentActivityEntry): string {
  switch (e.action) {
    case 'DOCUMENT_UPLOADED': return 'Uploaded';
    case 'DOCUMENT_UPDATED': {
      const keys = Object.keys(e.details?.changes || {});
      if (keys.length === 1 && keys[0] === 'expiry_date') {
        const c = e.details.changes.expiry_date;
        return `Changed expiry ${c.from ? formatDocDate(c.from) : 'none'} → ${c.to ? formatDocDate(c.to) : 'none'}`;
      }
      return keys.length ? `Changed ${keys.map((k) => FIELD_LABEL[k] || k).join(', ')}` : 'Edited';
    }
    case 'DOCUMENT_STATUS_CHANGED': {
      const s = e.details?.status as DocStatus | undefined;
      return s === 'Verified' ? 'Marked verified' : s === 'Rejected' ? 'Rejected' : 'Marked not verified';
    }
    case 'DOCUMENT_TRASHED': return 'Deleted';
    case 'DOCUMENT_RESTORED': return 'Restored';
    case 'DOCUMENT_PAGE_ADDED': return 'Added a page';
    case 'DOCUMENT_PAGE_REMOVED': return 'Removed a page';
    default: return e.action.replace(/^DOCUMENT_/, '').replace(/_/g, ' ').toLowerCase();
  }
}

const toDay = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');

export default function DocumentDetailPage() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tz = useDeploymentTimezone();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ typeId: '', number: '', issue: '', expiry: '', confidential: false });
  const [saving, setSaving] = useState(false);
  const [isRenewOpen, setIsRenewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: doc, isLoading, isError } = useQuery({
    queryKey: ['documents', 'detail', docId],
    queryFn: () => documentService.getById(docId!),
    enabled: !!docId,
  });
  const { data: versions = [] } = useQuery({
    queryKey: ['documents', 'versions', docId],
    queryFn: () => documentService.getVersions(docId!),
    enabled: !!doc,
  });
  const { data: activity = [] } = useQuery({
    queryKey: ['documents', 'activity', docId],
    queryFn: () => documentService.getActivity(docId!),
    enabled: !!doc,
  });
  const ownerTypeForTypes = doc && (TYPED_OWNERS as string[]).includes(doc.entity_type) ? (doc.entity_type as DocOwnerType) : null;
  const { data: types = [] } = useQuery({
    queryKey: ['document-types', ownerTypeForTypes],
    queryFn: async () => (await documentTypeService.getAll({ ownerType: ownerTypeForTypes! })).data,
    enabled: !!ownerTypeForTypes,
  });
  const { data: vehicle } = useQuery({
    queryKey: ['vehicle', doc?.entity_id, 'lookup'],
    queryFn: () => vehicleService.getById(doc!.entity_id, { lookup: true }),
    enabled: doc?.entity_type === 'Vehicle',
  });
  const { data: driver } = useQuery({
    queryKey: ['driver', doc?.entity_id, 'lookup'],
    queryFn: () => driverService.getById(doc!.entity_id, { lookup: true }),
    enabled: doc?.entity_type === 'Driver',
  });
  const { data: customer } = useQuery({
    queryKey: ['customer', doc?.entity_id],
    queryFn: () => customerService.getById(doc!.entity_id),
    enabled: doc?.entity_type === 'Customer',
  });

  useEffect(() => setEditing(false), [docId]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['documents'] });

  const owner = useMemo(() => {
    if (!doc) return null;
    if (doc.entity_type === 'Vehicle') return {
      icon: Truck, name: vehicle?.plate_number || vehicle?.ref_id || 'Vehicle', sub: vehicle?.ref_id || null,
      folder: `/documents/vehicles/${doc.entity_id}`, folderLabel: `${vehicle?.plate_number || 'Vehicle'} folder`,
    };
    if (doc.entity_type === 'Driver') return {
      icon: UserIcon, name: driver ? `${driver.first_name} ${driver.last_name}`.trim() : 'Driver', sub: driver?.ref_id || null,
      folder: `/documents/drivers/${doc.entity_id}`, folderLabel: `${driver ? driver.first_name : 'Driver'}'s folder`,
    };
    return {
      icon: Building2,
      name: doc.entity_type === 'Customer' ? customer?.name || 'Customer' : doc.entity_type === 'MaintenanceRecord' ? 'Maintenance record' : 'Company',
      sub: doc.entity_type === 'Customer' ? 'Customer' : null,
      folder: '/documents?tab=Company', folderLabel: 'Company documents',
    };
  }, [doc, vehicle, driver, customer]);

  if (isLoading) {
    return (
      <DashboardLayout active="Documents" title="Document">
        <div className="flex items-center justify-center min-h-[60vh] gap-2 text-slate-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading document…
        </div>
      </DashboardLayout>
    );
  }

  if (isError || !doc || !owner) {
    return (
      <DashboardLayout active="Documents" title="Document not found">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center">
          <XCircle className="w-10 h-10 text-rose-400" />
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">This document isn't available</h2>
          <p className="text-xs text-slate-500 max-w-sm">It may have been deleted. Deleted documents can be restored from Recently deleted for 30 days.</p>
          <div className="flex gap-2">
            <Button onClick={() => navigate('/documents')} variant="outline" size="sm" className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Documents</Button>
            <Button onClick={() => navigate('/documents?tab=Deleted')} variant="outline" size="sm" className="gap-1.5"><Trash2 className="w-4 h-4" /> Recently deleted</Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const files = doc.files && doc.files.length > 0
    ? doc.files
    : [{ id: 'primary', file_url: doc.file_url, mime_type: doc.mime_type, label: null }];
  const realFiles = (doc.files || []).filter((f) => f.id !== 'primary');
  const canAddPages = doc.documentType?.allowsMultipleFiles !== false;
  const state = docState(doc);
  const days = daysUntil(doc.expiry_date);
  const ai = doc.ai_extracted_json || null;
  const isCurrent = versions.length === 0 || versions[0]?.id === doc.id;
  const confidence = typeof ai?.confidence === 'number' ? Math.round((ai.confidence > 1 ? ai.confidence / 100 : ai.confidence) * 100) : null;
  const OwnerIcon = owner.icon;

  const startEdit = () => {
    setForm({
      typeId: doc.documentTypeId || '',
      number: ai?.document_number || '',
      issue: toDay(doc.issue_date),
      expiry: toDay(doc.expiry_date),
      confidential: doc.is_confidential,
    });
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await documentService.update(doc.id, {
        ...(ownerTypeForTypes && form.typeId ? { document_type_id: form.typeId } : {}),
        document_number: form.number || null,
        issue_date: form.issue || null,
        expiry_date: form.expiry || null,
        is_confidential: form.confidential,
      });
      toast.success('Saved');
      setEditing(false);
      await refresh();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || "Couldn't save the changes");
    } finally {
      setSaving(false);
    }
  };

  const setVerification = async (status: DocStatus) => {
    setBusy('verify');
    try {
      await documentService.updateStatus(doc.id, status);
      await refresh();
    } catch {
      toast.error("Couldn't update");
    } finally {
      setBusy(null);
    }
  };

  const rescan = async () => {
    setBusy('scan');
    try {
      await documentService.extractDocumentOcr(doc.id);
      toast.success('Read again with AI');
      await refresh();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || "AI couldn't read this file");
    } finally {
      setBusy(null);
    }
  };

  const addPage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('page');
    try {
      await documentService.addFile(doc.id, file);
      toast.success('Page added');
      await refresh();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || "Couldn't add the page");
    } finally {
      setBusy(null);
    }
  };

  const removePage = async (fileId: string) => {
    if (realFiles.length <= 1) return;
    try {
      await documentService.deleteFile(doc.id, fileId);
      toast.success('Page removed');
      await refresh();
    } catch {
      toast.error("Couldn't remove the page");
    }
  };

  const remove = async () => {
    setBusy('delete');
    try {
      await documentService.delete(doc.id);
      const id = doc.id;
      toast.success('Moved to Recently deleted', {
        action: { label: 'Undo', onClick: async () => { await documentService.restore([id]); refresh(); navigate(`/documents/doc/${id}`); } },
      });
      await refresh();
      navigate(owner.folder);
    } catch {
      toast.error("Couldn't delete");
      setBusy(null);
    }
  };

  const onRenewed = async () => {
    setIsRenewOpen(false);
    await refresh();
    const latest = await documentService.getVersions(doc.id).catch(() => []);
    if (latest[0] && latest[0].id !== doc.id) {
      toast.success('New version uploaded — the old one is kept in Versions');
      navigate(`/documents/doc/${latest[0].id}`, { replace: true });
    }
  };

  const verification = doc.status;

  return (
    <DashboardLayout active="Documents" title={documentDisplayName(doc)}>
      <div className="px-4 sm:px-6 pb-10 w-full max-w-[1600px] mx-auto flex flex-col gap-4">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button onClick={() => navigate(owner.folder)} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer">
            <ArrowLeft className="w-3.5 h-3.5" /> {owner.folderLabel}
          </button>
          <span className="text-slate-300 dark:text-slate-700">/</span>
          <h1 className="text-lg font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">{documentDisplayName(doc)}</h1>
          <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-semibold', STATE_PILL[state])}>
            {state === 'none' ? 'No expiry' : relativeExpiry(days) || ROW_STATE_STYLE[state].label}
          </span>
          <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-semibold', VERIFICATION_STYLE[verification].className)}>
            {VERIFICATION_STYLE[verification].label}
          </span>
          {doc.is_confidential && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Confidential
            </span>
          )}
          {!isCurrent && (
            <button onClick={() => navigate(`/documents/doc/${versions[0].id}`)} className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 cursor-pointer">
              Older version — open current
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <a href={resolveFileUrl(doc.file_url)} download target="_blank" rel="noreferrer"
              className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" /> Download
            </a>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" aria-label="More actions">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={startEdit} className="text-xs gap-2"><Pencil className="w-3.5 h-3.5" /> Edit details</DropdownMenuItem>
                <DropdownMenuItem onClick={rescan} className="text-xs gap-2"><Sparkles className="w-3.5 h-3.5 text-amber-500" /> Read again with AI</DropdownMenuItem>
                {owner.folder.startsWith('/documents/') && !owner.folder.includes('?') && (
                  <DropdownMenuItem onClick={() => navigate(owner.folder)} className="text-xs gap-2"><ArrowUpRight className="w-3.5 h-3.5" /> Open folder</DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setIsDeleteOpen(true)} className="text-xs gap-2 text-rose-600 focus:text-rose-600"><Trash2 className="w-3.5 h-3.5" /> Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={() => setIsRenewOpen(true)} className="h-9 gap-1.5 text-xs bg-[#FA634E] hover:bg-[#FA634E]/90 text-white font-bold rounded-xl px-4 border-none">
              <RefreshCw className="w-3.5 h-3.5" /> Renew
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* ── File ───────────────────────────────────────────────────── */}
          <div className="lg:col-span-7 flex flex-col gap-2">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <DocumentCanvasViewer files={files} title={documentDisplayName(doc)} canvasHeightClassName="h-[62vh] min-h-[420px]" />
            </div>
            {(canAddPages || realFiles.length > 1) && (
              <div className="flex items-center gap-2 flex-wrap text-[11px]">
                <span className="font-semibold text-slate-500">{realFiles.length || 1} page{(realFiles.length || 1) === 1 ? '' : 's'}</span>
                {realFiles.length > 1 && realFiles.map((f, i) => (
                  <span key={f.id} className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                    {f.label || `Page ${i + 1}`}
                    <button onClick={() => removePage(f.id)} className="p-0.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer" aria-label={`Remove ${f.label || `page ${i + 1}`}`}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {canAddPages && (
                  <label className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 hover:text-slate-800 cursor-pointer">
                    {busy === 'page' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Add page
                    <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.gif" onChange={addPage} />
                  </label>
                )}
              </div>
            )}
          </div>

          {/* ── Details, check, versions, activity ────────────────────── */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Details</h2>
                {!editing ? (
                  <button onClick={startEdit} className="text-xs font-semibold text-[#FA634E] hover:underline flex items-center gap-1 cursor-pointer">
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="h-7 text-xs">Cancel</Button>
                    <Button size="sm" onClick={save} disabled={saving} className="h-7 text-xs bg-charcoal hover:bg-charcoal-strong text-white">
                      {saving && <Loader2 className="w-3 h-3 animate-spin mr-1" />} Save
                    </Button>
                  </div>
                )}
              </div>

              {!editing ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  <Field label="Type" value={documentDisplayName(doc)} sub={doc.documentType?.requirementStatus === 'MANDATORY' ? 'Mandatory' : undefined} />
                  <Field label="Number" value={ai?.document_number || '—'} mono />
                  <Field label="Issued" value={doc.issue_date ? formatDocDate(doc.issue_date) : '—'} />
                  <Field label="Expires" value={doc.expiry_date ? formatDocDate(doc.expiry_date) : 'No expiry'} valueClass={ROW_STATE_STYLE[state].text} />
                  <div>
                    <dt className="text-[11px] text-slate-400">Belongs to</dt>
                    <dd>
                      <button onClick={() => navigate(owner.folder)} className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200 hover:text-[#FA634E] cursor-pointer">
                        <OwnerIcon className="w-3.5 h-3.5 text-slate-400" /> {owner.name}
                      </button>
                      {owner.sub && <span className="text-[11px] text-slate-400">{owner.sub}</span>}
                    </dd>
                  </div>
                  <Field label="Issued by" value={ai?.issuing_authority ? formatBilingualAuthority(ai.issuing_authority) : '—'} />
                </dl>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {ownerTypeForTypes && (
                    <label className="col-span-2 flex flex-col gap-1">
                      <span className="text-[11px] text-slate-500">Type</span>
                      <Select value={form.typeId} onValueChange={(v) => setForm((f) => ({ ...f, typeId: v }))}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Pick a type" /></SelectTrigger>
                        <SelectContent>
                          {types.filter((t) => t.requirementStatus !== 'DISABLED' || t.id === doc.documentTypeId).map((t) => (
                            <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                  )}
                  <label className="col-span-2 flex flex-col gap-1">
                    <span className="text-[11px] text-slate-500">Number</span>
                    <input
                      value={form.number}
                      onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                      placeholder="POL-88213"
                      className="h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[#FA634E]/30"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-slate-500">Issued</span>
                    <DatePicker value={form.issue || null} onChange={(_, s) => setForm((f) => ({ ...f, issue: s }))} clearable placeholder="No date" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-slate-500">Expires</span>
                    <DatePicker value={form.expiry || null} onChange={(_, s) => setForm((f) => ({ ...f, expiry: s }))} clearable placeholder="No expiry" />
                  </label>
                  <label className="col-span-2 flex items-center justify-between gap-2 pt-1">
                    <span className="text-[11px] text-slate-500 flex items-center gap-1"><Lock className="w-3 h-3" /> Confidential</span>
                    <Switch checked={form.confidential} onCheckedChange={(v) => setForm((f) => ({ ...f, confidential: v }))} />
                  </label>
                </div>
              )}

              {ai && !editing && (
                <p className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  Read by AI{confidence !== null ? ` · ${confidence}% sure` : ''}{ai && (ai as any).document_number_edited ? ' · number corrected by hand' : ''}
                  <button onClick={rescan} disabled={busy === 'scan'} className="ml-auto font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer flex items-center gap-1">
                    {busy === 'scan' && <Loader2 className="w-3 h-3 animate-spin" />} Read again
                  </button>
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Check</h2>
                <p className="text-[11px] text-slate-500">
                  {verification === 'Verified' ? 'Checked against the original.' : verification === 'Rejected' ? 'Marked as wrong or unreadable — renew it.' : 'Has someone checked this against the original?'}
                </p>
              </div>
              {verification === 'Verified' || verification === 'Rejected' ? (
                <Button size="sm" variant="ghost" disabled={busy === 'verify'} onClick={() => setVerification('PendingReview')} className="h-8 text-xs">Undo</Button>
              ) : (
                <>
                  <Button size="sm" variant="outline" disabled={busy === 'verify'} onClick={() => setVerification('Verified')} className="h-8 text-xs gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-900">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Verify
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === 'verify'} onClick={() => setVerification('Rejected')} className="h-8 text-xs gap-1 text-rose-700 border-rose-200 hover:bg-rose-50 dark:text-rose-400 dark:border-rose-900">
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </Button>
                </>
              )}
            </section>

            {versions.length > 0 && (
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 mb-2">
                  <History className="w-3.5 h-3.5 text-slate-400" /> Versions
                </h2>
                <ul className="flex flex-col">
                  {versions.map((v, i) => (
                    <li key={v.id}>
                      <button
                        onClick={() => v.id !== doc.id && navigate(`/documents/doc/${v.id}`)}
                        className={cn(
                          'w-full flex items-center justify-between gap-2 py-1.5 px-2 -mx-2 rounded-md text-xs text-left',
                          v.id === doc.id ? 'bg-slate-50 dark:bg-slate-800/60' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer',
                        )}
                      >
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          v{versions.length - i}
                          <span className="font-normal text-slate-400"> · {v.isCurrent ? 'current' : 'replaced'}</span>
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {v.issue_date ? formatDocDate(v.issue_date) : formatDocDate(v.createdAt)} – {v.expiry_date ? formatDocDate(v.expiry_date) : 'no expiry'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {versions.length === 1 && <p className="text-[11px] text-slate-400 mt-1">Renewing keeps this copy here as history.</p>}
              </section>
            )}

            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 mb-2">
                <Activity className="w-3.5 h-3.5 text-slate-400" /> Activity
              </h2>
              {activity.length === 0 ? (
                <p className="text-[11px] text-slate-400">No activity yet.</p>
              ) : (
                <ol className="flex flex-col gap-1.5 max-h-56 overflow-y-auto custom-scrollbar">
                  {activity.map((e) => (
                    <li key={e.id} className="flex items-start justify-between gap-3 text-xs">
                      <span className="text-slate-700 dark:text-slate-300">
                        {describeActivity(e)}
                        {e.by && <span className="text-slate-400"> · {e.by}</span>}
                      </span>
                      <span className="text-[11px] text-slate-400 whitespace-nowrap">{formatInDeploymentTz(e.at, tz, 'd MMM yyyy, HH:mm')}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>
      </div>

      {isRenewOpen && (
        <UploadDocumentModal
          isOpen
          onClose={() => setIsRenewOpen(false)}
          entityType={doc.entity_type}
          entityId={doc.entity_id}
          documentTypeId={doc.documentTypeId || undefined}
          documentTypeName={documentDisplayName(doc)}
          lockOwner
          ownerDisplayName={owner.name}
          onUploadSuccess={onRenewed}
        />
      )}

      <ConfirmModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={remove}
        isLoading={busy === 'delete'}
        isDestructive
        title="Delete this document?"
        message="It'll move to Recently deleted. You can restore it for 30 days."
        confirmLabel="Delete"
      />
    </DashboardLayout>
  );
}

function Field({ label, value, sub, mono, valueClass }: { label: string; value: React.ReactNode; sub?: string; mono?: boolean; valueClass?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-slate-400">{label}</dt>
      <dd className={cn('font-semibold text-slate-800 dark:text-slate-200 truncate', mono && 'font-mono', valueClass)}>{value}</dd>
      {sub && <span className="text-[11px] text-slate-400">{sub}</span>}
    </div>
  );
}
