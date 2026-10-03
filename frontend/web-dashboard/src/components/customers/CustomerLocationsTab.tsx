import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Edit2, MapPin, Plus, Search, Trash2, UploadCloud } from 'lucide-react';

import { locationService, type Location } from '@/services/locationService';
import LocationFormDialog from '@/components/locations/LocationFormDialog';
import ExcelImportDialog from '@/components/fleet/ExcelImportDialog';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { Input } from '@/components/ui/input';
import { useModuleEnabled } from '@/components/auth/RequireModule';
import { LOCATION_COLUMNS } from '@/utils/importUtils';
import { cn } from '@/lib/utils';
import { isExactPin } from '@/components/locations/PinChip';
import { Badge, EmptyBlock, Panel, ui, type UiTone } from '@/components/customers/customerUi';

// Same two states as everywhere else (PinChip): exact, or a pin is still needed.
const PIN_EXACT: { tone: UiTone; label: string } = { tone: 'emerald', label: 'Exact' };
const PIN_NEEDED: { tone: UiTone; label: string } = { tone: 'amber', label: 'Pin needed' };

/** Customer → Locations: their saved pickup / delivery places, used by quotations and trips. */
export default function CustomerLocationsTab({ customerId, locations }: { customerId: string; locations: Location[] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const locationsModule = useModuleEnabled('locations');

  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Location | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Location | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => locationService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations', customerId] });
      setDeleteTarget(null);
      toast.success('Location deleted');
    },
    onError: (err: any) => {
      setDeleteTarget(null);
      toast.error(err?.response?.data?.error?.message || "Couldn't delete the location.");
    },
  });

  const q = search.trim().toLowerCase();
  const shown = q
    ? locations.filter((l) => [l.name, l.code, l.address, l.city].some((v) => (v || '').toLowerCase().includes(q)))
    : locations;

  return (
    <Panel
      title="Saved locations"
      description="Pickup and delivery places used on this customer's quotations and trips"
      icon={MapPin}
      tone="blue"
      flush
      action={
        <>
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search locations" className={cn(ui.input, 'h-8 pl-9')} aria-label="Search locations" />
          </div>
          <button type="button" onClick={() => setImportOpen(true)} className={cn(ui.btn, ui.btnOutline, 'h-8')}>
            <UploadCloud className="size-4" /> Import
          </button>
          <button type="button" onClick={() => { setEditTarget(null); setFormOpen(true); }} className={cn(ui.btn, ui.btnPrimary, 'h-8')}>
            <Plus className="size-4" /> Add location
          </button>
        </>
      }
    >
      {shown.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyBlock icon={MapPin} title={q ? 'No locations match' : 'No saved locations yet'} text="Saved places fill in pickup and delivery stops on quotations and trips." />
        </div>
      ) : (
        <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50/80 dark:bg-slate-800/40">
              <tr>
                <th className={cn(ui.th, 'pl-5')}>Location</th>
                <th className={ui.th}>Address</th>
                <th className={ui.th}>Pin</th>
                <th className={cn(ui.th, 'text-right')}>Trip stops</th>
                <th className={cn(ui.th, 'pr-5')}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {shown.map((l) => {
                const p = isExactPin(l.coordinate_precision, l.lat, l.lng) ? PIN_EXACT : PIN_NEEDED;
                return (
                  <tr
                    key={l.id}
                    onClick={locationsModule ? () => navigate(`/locations/${l.id}`) : undefined}
                    className={cn('group', locationsModule && 'cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/40')}
                  >
                    <td className={cn(ui.td, 'pl-5')}>
                      <p className="font-medium text-slate-900 group-hover:text-[#E5533F] dark:text-white">{l.name}</p>
                      <p className="text-xs text-slate-500">{l.code}</p>
                    </td>
                    <td className={cn(ui.td, 'max-w-[320px] truncate text-slate-600 dark:text-slate-300')} title={l.address || undefined}>
                      {[l.address, l.city].filter(Boolean).join(', ') || <span className="text-slate-400">—</span>}
                    </td>
                    <td className={ui.td}><Badge tone={p.tone} dot>{p.label}</Badge></td>
                    <td className={cn(ui.td, 'text-right text-slate-900 tabular-nums dark:text-white')}>{l._count?.tripStops ?? '—'}</td>
                    <td className={cn(ui.td, 'pr-5')}>
                      <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => { setEditTarget(l); setFormOpen(true); }} className={ui.iconBtn} aria-label={`Edit ${l.name}`} title="Edit">
                          <Edit2 className="size-4" />
                        </button>
                        <button type="button" onClick={() => setDeleteTarget(l)} className={cn(ui.iconBtn, 'hover:bg-rose-50 hover:text-rose-600')} aria-label={`Delete ${l.name}`} title="Delete">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <LocationFormDialog
        isOpen={formOpen}
        onClose={() => { setFormOpen(false); setEditTarget(null); }}
        location={editTarget}
        defaultCustomerId={customerId}
      />

      <ExcelImportDialog
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        entityLabel="Locations"
        columns={LOCATION_COLUMNS}
        requiredFields={['customer_name', 'name']}
        preferSheet="locations"
        templateUrl="/templates/MERCON_Locations_Import_Template.xlsx"
        matchLabel="customer + name"
        onImport={(rows) => locationService.importRows(rows)}
        invalidateKeys={[['locations', customerId]]}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
        isLoading={remove.isPending}
        title="Delete location?"
        message={`Delete ${deleteTarget?.name ?? 'this location'}? A location still used by trips or quotations can't be deleted.`}
        confirmLabel="Delete"
        isDestructive
      />
    </Panel>
  );
}
