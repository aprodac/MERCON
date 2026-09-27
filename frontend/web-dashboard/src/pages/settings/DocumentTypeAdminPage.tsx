import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { SettingsPage } from '@/components/settings/SettingsKit';
import DataTable from '@/components/ui/DataTable';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import Btn from '@/components/ui/Btn';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { documentTypeService, type DocumentType, type DocOwnerType, type DocRequirement } from '@/services/documentTypeService';

const OWNER_TYPES: DocOwnerType[] = ['Driver', 'Vehicle', 'Trip', 'Customer', 'Company', 'Other'];
const REQUIREMENTS: DocRequirement[] = ['MANDATORY', 'OPTIONAL', 'DISABLED'];

const emptyForm = {
  code: '',
  name: '',
  ownerType: 'Driver' as DocOwnerType,
  requirementStatus: 'OPTIONAL' as DocRequirement,
  requiresIssueDate: false,
  requiresExpiryDate: true,
  allowsMultipleFiles: false,
};

export default function DocumentTypeAdminPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentType | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: types = [], isLoading } = useQuery({
    queryKey: ['document-types', 'admin'],
    queryFn: async () => (await documentTypeService.getAll()).data,
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (t: DocumentType) => {
    setEditing(t);
    setForm({
      code: t.code,
      name: t.name,
      ownerType: t.ownerType,
      requirementStatus: t.requirementStatus,
      requiresIssueDate: t.requiresIssueDate,
      requiresExpiryDate: t.requiresExpiryDate,
      allowsMultipleFiles: t.allowsMultipleFiles,
    });
    setIsModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        return documentTypeService.update(editing.id, {
          name: form.name,
          requirementStatus: form.requirementStatus,
          requiresIssueDate: form.requiresIssueDate,
          requiresExpiryDate: form.requiresExpiryDate,
          allowsMultipleFiles: form.allowsMultipleFiles,
        });
      }
      return documentTypeService.create({
        code: form.code.trim(),
        name: form.name.trim(),
        ownerType: form.ownerType,
        requirementStatus: form.requirementStatus,
        requiresIssueDate: form.requiresIssueDate,
        requiresExpiryDate: form.requiresExpiryDate,
        allowsMultipleFiles: form.allowsMultipleFiles,
      });
    },
    onSuccess: () => {
      toast.success(editing ? 'Document type updated' : 'Document type created');
      queryClient.invalidateQueries({ queryKey: ['document-types'] });
      setIsModalOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to save document type');
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (t: DocumentType) => documentTypeService.update(t.id, { isActive: !t.isActive } as any),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['document-types'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => documentTypeService.delete(id),
    onSuccess: () => {
      toast.success('Document type deleted');
      queryClient.invalidateQueries({ queryKey: ['document-types'] });
      setDeleteId(null);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to delete — it may still be in use');
      setDeleteId(null);
    },
  });

  return (
    <SettingsPage
      wide
      title="Document types"
      description="The documents each driver, vehicle or trip needs. Required types show up as missing in the Documents Center until uploaded."
      actions={<Btn label="Add document type" icon={<Plus size={14} />} onClick={openCreate} />}
    >
        <DataTable<DocumentType>
          data={types}
          isLoading={isLoading}
          columns={[
            {
              header: 'Document',
              accessor: (t) => (
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{t.name}</p>
                  {t.code.toLowerCase() !== t.name.replace(/\s+/g, '').toLowerCase() && <p className="text-[11px] text-muted-foreground">{t.code}</p>}
                </div>
              ),
            },
            { header: 'For', accessor: (t) => <span className="text-muted-foreground">{t.ownerType}</span> },
            {
              header: 'Requirement',
              accessor: (t) => (
                <span className={t.requirementStatus === 'MANDATORY' ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
                  {t.requirementStatus === 'MANDATORY' ? 'Required' : t.requirementStatus === 'OPTIONAL' ? 'Optional' : 'Not used'}
                </span>
              ),
            },
            {
              header: 'Asks for',
              accessor: (t) => (
                <span className="text-muted-foreground">
                  {[t.requiresExpiryDate && 'Expiry date', t.allowsMultipleFiles && 'Several files'].filter(Boolean).join(' · ') || '—'}
                </span>
              ),
            },
            {
              header: 'In use',
              accessor: (t) => (
                <Switch
                  checked={t.isActive}
                  onCheckedChange={() => toggleActiveMutation.mutate(t)}
                  aria-label={`${t.isActive ? 'Disable' : 'Enable'} ${t.name}`}
                />
              ),
            },
            {
              header: '',
              headerClassName: 'text-right',
              className: 'text-right',
              accessor: (t) => (
                <div className="flex items-center justify-end gap-1">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label={`Edit ${t.name}`} onClick={() => openEdit(t)}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-[#DC2626]" aria-label={`Delete ${t.name}`} onClick={() => setDeleteId(t.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ),
            },
          ]}
        />

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Document Type' : 'Add Document Type'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Document Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full h-9 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 text-xs font-semibold outline-none"
                placeholder="e.g. Medical Certificate"
              />
            </div>
            {!editing && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Code (unique, no spaces)</label>
                <input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.replace(/\s+/g, '') }))}
                  className="w-full h-9 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 text-xs font-mono outline-none"
                  placeholder="e.g. MedicalCertificate"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Applies To</label>
                <select
                  value={form.ownerType}
                  disabled={!!editing}
                  onChange={(e) => setForm((f) => ({ ...f, ownerType: e.target.value as DocOwnerType }))}
                  className="w-full h-9 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 text-xs font-semibold outline-none"
                >
                  {OWNER_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Requirement</label>
                <select
                  value={form.requirementStatus}
                  onChange={(e) => setForm((f) => ({ ...f, requirementStatus: e.target.value as DocRequirement }))}
                  className="w-full h-9 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 text-xs font-semibold outline-none"
                >
                  {REQUIREMENTS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={form.requiresExpiryDate} onChange={(e) => setForm((f) => ({ ...f, requiresExpiryDate: e.target.checked }))} />
                Requires expiry date
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={form.requiresIssueDate} onChange={(e) => setForm((f) => ({ ...f, requiresIssueDate: e.target.checked }))} />
                Requires issue date
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={form.allowsMultipleFiles} onChange={(e) => setForm((f) => ({ ...f, allowsMultipleFiles: e.target.checked }))} />
                Allows multiple files
              </label>
            </div>
          </div>
          <DialogFooter>
            <Btn label="Cancel" variant="outline" onClick={() => setIsModalOpen(false)} />
            <Btn
              label={saveMutation.isPending ? 'Saving...' : 'Save'}
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.name || (!editing && !form.code)}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title="Delete Document Type"
        message="This can only be deleted if no documents use it. Otherwise, disable it instead."
        isLoading={deleteMutation.isPending}
      />
    </SettingsPage>
  );
}
