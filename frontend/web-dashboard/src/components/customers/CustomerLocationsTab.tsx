import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Edit2, MapPin, Plus, Search, Trash2, UploadCloud } from 'lucide-react';

import { locationService, type Location } from '@/services/locationService';
import LocationFormDialog from '@/components/locations/LocationFormDialog';
import ExcelImportDialog from '@/components/fleet/ExcelImportDialog';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useModuleEnabled } from '@/components/auth/RequireModule';
import { LOCATION_COLUMNS } from '@/utils/importUtils';
import { cn } from '@/lib/utils';
import { dk, EMPTY, StatusPill, type Tone } from '@/components/details/DetailKit';

const PRECISION: Record<string, { tone: Tone; label: string }> = {
  EXACT: { tone: 'green', label: 'Exact GPS' },
  APPROXIMATE: { tone: 'blue', label: 'Area' },
  UNKNOWN: { tone: 'amber', label: 'Not pinned' },
};

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
    <section className={cn(dk.card, 'p-4 sm:p-5 flex flex-col gap-3')}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
          <MapPin className="w-4 h-4 text-[#FA634E]" /> Saved locations
          <span className="text-xs font-semibold text-slate-400">{locations.length}</span>
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search locations…" className="h-8 pl-8 text-xs rounded-xl" aria-label="Search locations" />
          </div>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="h-8 rounded-xl text-xs font-bold gap-1.5">
            <UploadCloud className="w-3.5 h-3.5" /> Import
          </Button>
          <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }} className="h-8 rounded-xl text-xs font-bold gap-1.5 bg-[#FA634E] hover:bg-[#e0523d] text-white">
            <Plus className="w-3.5 h-3.5" /> Add location
          </Button>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="py-10 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
          <MapPin className="w-7 h-7 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{q ? 'No locations match' : 'No saved locations yet'}</p>
          <p className="text-xs text-slate-400 mt-0.5">Saved places fill in pickup and delivery stops on quotations and trips.</p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-extrabold uppercase text-slate-400 tracking-widest">
                <th className="py-2.5 px-2">Location</th>
                <th className="py-2.5 px-2">Address</th>
                <th className="py-2.5 px-2">Pin</th>
                <th className="py-2.5 px-2 text-right">Used in trips</th>
                <th className="py-2.5 px-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {shown.map((l) => {
                const p = PRECISION[l.coordinate_precision || (l.lat != null && l.lng != null ? 'EXACT' : 'UNKNOWN')] ?? PRECISION.UNKNOWN;
                return (
                  <tr
                    key={l.id}
                    onClick={locationsModule ? () => navigate(`/locations/${l.id}`) : undefined}
                    className={cn('group', locationsModule && 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50')}
                  >
                    <td className="py-2.5 px-2">
                      <span className="block font-bold text-slate-900 dark:text-white group-hover:text-[#FA634E]">{l.name}</span>
                      <span className="block font-mono text-[10.5px] text-slate-400">{l.code}</span>
                    </td>
                    <td className="py-2.5 px-2 text-slate-600 dark:text-slate-400 max-w-[320px] truncate" title={l.address || undefined}>
                      {[l.address, l.city].filter(Boolean).join(', ') || EMPTY}
                    </td>
                    <td className="py-2.5 px-2"><StatusPill tone={p.tone}>{p.label}</StatusPill></td>
                    <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-900 dark:text-white">{l._count?.tripStops ?? EMPTY}</td>
                    <td className="py-2.5 px-2">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => { setEditTarget(l); setFormOpen(true); }} className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-slate-500 hover:text-amber-600 hover:bg-amber-50 cursor-pointer" aria-label={`Edit ${l.name}`} title="Edit">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteTarget(l)} className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer" aria-label={`Delete ${l.name}`} title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
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
    </section>
  );
}
