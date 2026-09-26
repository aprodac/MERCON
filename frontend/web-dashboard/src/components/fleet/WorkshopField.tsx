import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wrench, Plus, Building2, Phone, ChevronsUpDown, Check, X, Trash2, CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PhoneInput from '@/components/ui/PhoneInput';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { maintenanceService, Workshop } from '@/services/maintenanceService';
import { cn } from '@/lib/utils';
import ConfirmModal from '@/components/ui/ConfirmModal';

interface WorkshopFieldProps {
  value: string;
  onChange: (name: string) => void;
  onPick?: (workshop: Workshop) => void;
  placeholder?: string;
  className?: string;
}

export default function WorkshopField({
  value,
  onChange,
  onPick,
  placeholder = 'Select or enter workshop name',
  className,
}: WorkshopFieldProps) {
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newWorkshopName, setNewWorkshopName] = useState('');
  const [newWorkshopPhone, setNewWorkshopPhone] = useState('');
  const [newWorkshopAddress, setNewWorkshopAddress] = useState('');
  const [saveError, setSaveError] = useState('');

  const [checkedForDeleteNames, setCheckedForDeleteNames] = useState<Set<string>>(new Set());
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const { data: workshops = [], isLoading } = useQuery({
    queryKey: ['workshops'],
    queryFn: () => maintenanceService.getWorkshops(),
    staleTime: 30_000,
  });

  const saveWorkshopMutation = useMutation({
    mutationFn: (payload: { name: string; contact_phone?: string; address?: string }) =>
      maintenanceService.createWorkshop(payload),
    onSuccess: (saved: any) => {
      queryClient.invalidateQueries({ queryKey: ['workshops'] });
      const contactVal = saved.contact_phone || saved.contact || newWorkshopPhone.trim() || null;
      onChange(saved.name);
      onPick?.({
        id: saved.id,
        name: saved.name,
        contact: contactVal,
        address: saved.address || newWorkshopAddress.trim() || null,
        order_count: 0,
        is_saved: true,
      });
      setIsAddDialogOpen(false);
      setIsOpen(false);
      setNewWorkshopName('');
      setNewWorkshopPhone('');
      setNewWorkshopAddress('');
      setSaveError('');
    },
    onError: (err: any) => {
      setSaveError(err.response?.data?.error?.message || 'Failed to save workshop.');
    },
  });

  const deleteWorkshopsMutation = useMutation({
    mutationFn: (targets: Workshop[]) =>
      Promise.all(
        targets.map((w) =>
          w.id ? maintenanceService.deleteWorkshop(w.id) : maintenanceService.clearWorkshopName(w.name)
        )
      ),
    onSuccess: (_data, targets) => {
      queryClient.invalidateQueries({ queryKey: ['workshops'] });
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      const deletedNames = targets.map((w) => w.name);
      if (deletedNames.includes(value)) onChange('');
      setCheckedForDeleteNames(new Set());
      setIsConfirmDeleteOpen(false);
    },
  });

  const toggleCheckedForDelete = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCheckedForDeleteNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const checkedWorkshops = workshops.filter((w) => checkedForDeleteNames.has(w.name));

  const handleSelectWorkshop = (w: Workshop) => {
    onChange(w.name);
    onPick?.(w);
    setIsOpen(false);
  };

  const handleInputChange = (typedValue: string) => {
    onChange(typedValue);
    const matched = workshops.find((w) => w.name.toLowerCase() === typedValue.trim().toLowerCase());
    if (matched) {
      onPick?.(matched);
    } else {
      onPick?.({
        name: typedValue,
        contact: null,
        address: null,
        order_count: 0,
        is_saved: false,
      });
    }
    if (!isOpen) setIsOpen(true);
  };

  const openAddDialogWith = (initialName: string = '') => {
    setNewWorkshopName(initialName || value);
    setNewWorkshopPhone('');
    setNewWorkshopAddress('');
    setSaveError('');
    setIsAddDialogOpen(true);
  };

  const handleSaveNewWorkshop = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Stop React event bubbling to parent form
    if (!newWorkshopName.trim()) {
      setSaveError('Workshop name is required.');
      return;
    }
    saveWorkshopMutation.mutate({
      name: newWorkshopName.trim(),
      contact_phone: newWorkshopPhone.trim() || undefined,
      address: newWorkshopAddress.trim() || undefined,
    });
  };

  const filteredWorkshops = workshops.filter(
    (w) =>
      w.name.toLowerCase().includes((value || '').toLowerCase()) ||
      (w.contact && w.contact.toLowerCase().includes((value || '').toLowerCase())) ||
      (w.address && w.address.toLowerCase().includes((value || '').toLowerCase()))
  );

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Combobox Direct Input Field */}
      <div className="relative flex items-center w-full">
        <Building2 className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-brand shrink-0 pointer-events-none z-10" />
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={isLoading ? 'Loading workshops...' : placeholder}
          className={cn(
            'h-9.5 text-xs pl-8 pr-14 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl font-semibold focus-visible:ring-2 focus-visible:ring-brand/30',
            className
          )}
        />

        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                onPick?.({
                  name: '',
                  contact: null,
                  address: null,
                  order_count: 0,
                  is_saved: false,
                });
                inputRef.current?.focus();
              }}
              title="Clear workshop"
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer rounded-md"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            title="Toggle suggestions list"
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer rounded-md"
          >
            <ChevronsUpDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Suggestions Dropdown Panel */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 w-full min-w-[320px] sm:min-w-[400px] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl bg-white dark:bg-slate-900 overflow-hidden z-[9999] flex flex-col max-h-[300px] animate-in fade-in-0 zoom-in-95 duration-100">
          
          {/* List Content */}
          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
            {filteredWorkshops.map((w) => {
              const isSelected = value?.trim().toLowerCase() === w.name.trim().toLowerCase();
              const isCheckedForDelete = checkedForDeleteNames.has(w.name);
              return (
                <div
                  key={w.name}
                  onClick={() => handleSelectWorkshop(w)}
                  className={cn(
                    'w-full px-3 py-2.5 rounded-xl text-xs flex items-center justify-between transition-all select-none cursor-pointer group text-left border',
                    isSelected
                      ? 'bg-orange-50/90 dark:bg-orange-950/40 text-brand dark:text-orange-300 font-bold border-orange-200/80 dark:border-orange-900/60'
                      : isCheckedForDelete
                      ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200/60'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-800 dark:text-slate-200 border-transparent'
                  )}
                >
                  <div className="flex-1 flex items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={(e) => toggleCheckedForDelete(w.name, e)}
                      title={isCheckedForDelete ? 'Unselect for deletion' : 'Select for deletion'}
                      className={cn(
                        'w-4 h-4 rounded shrink-0 flex items-center justify-center border transition-colors cursor-pointer',
                        isCheckedForDelete
                          ? 'bg-rose-500 border-rose-500 text-white'
                          : 'border-slate-300 dark:border-slate-600 hover:border-rose-400 bg-white dark:bg-slate-800'
                      )}
                    >
                      {isCheckedForDelete && <Check className="w-3 h-3 stroke-[3]" />}
                    </button>

                    <Building2 className={cn("w-4 h-4 shrink-0", isSelected ? "text-brand" : "text-amber-500")} />
                    
                    <div className="flex flex-col min-w-0">
                      <span className="truncate font-semibold text-slate-900 dark:text-slate-100">
                        {w.name}
                      </span>
                      {w.address && (
                        <span className="text-[10px] text-slate-400 truncate">
                          {w.address}
                        </span>
                      )}
                    </div>

                    {!w.id && (
                      <span className="text-[9px] text-slate-400 font-medium shrink-0 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">
                        history
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 pl-2">
                    {w.contact && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                        <Phone className="w-2.5 h-2.5 text-slate-400" />
                        {w.contact}
                      </span>
                    )}
                    {isSelected && (
                      <Check className="w-5 h-5 text-brand shrink-0" />
                    )}
                  </div>
                </div>
              );
            })}

            {filteredWorkshops.length === 0 && (
              <div className="p-3 text-center text-xs text-slate-500">
                {value.trim() ? (
                  <span>Using custom workshop name: "<strong>{value}</strong>"</span>
                ) : (
                  <span>No saved workshops found. Type above or click + Save New Workshop.</span>
                )}
              </div>
            )}
          </div>

          {/* Footer Action */}
          <div className="shrink-0 p-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={checkedForDeleteNames.size === 0}
                onClick={() => setIsConfirmDeleteOpen(true)}
                className="h-7 px-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-30 text-xs font-semibold cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                {checkedForDeleteNames.size > 0 ? `Delete (${checkedForDeleteNames.size})` : 'Delete'}
              </Button>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openAddDialogWith(value)}
                className="h-7 text-xs font-bold text-brand border-orange-200 dark:border-orange-900/50 hover:bg-orange-50 cursor-pointer"
              >
                <Plus className="w-3 h-3 mr-1" />
                + Save New Workshop
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-7 text-xs font-bold bg-charcoal dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white px-2.5 cursor-pointer rounded-lg shadow-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Workshop Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2.5 text-brand mb-1">
              <Wrench className="w-4 h-4 text-slate-600 shrink-0" />
              <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                Save New Workshop / Service Center
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500">
              Save this garage to your company directory so it is suggested in all future maintenance records.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveNewWorkshop} className="space-y-3.5 py-2">
            {saveError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {saveError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Workshop Name *
              </Label>
              <Input
                value={newWorkshopName}
                onChange={(e) => setNewWorkshopName(e.target.value)}
                placeholder="e.g. Al-Jazeera Truck Service Center"
                className="h-9 text-xs"
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Contact Phone / WhatsApp
              </Label>
              <PhoneInput
                value={newWorkshopPhone}
                onChange={(val) => setNewWorkshopPhone(val)}
                placeholder="50 000 0000"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Location / Yard Address
              </Label>
              <Input
                value={newWorkshopAddress}
                onChange={(e) => setNewWorkshopAddress(e.target.value)}
                placeholder="e.g. Industrial Area 2, Riyadh"
                className="h-9 text-xs"
              />
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsAddDialogOpen(false)}
                className="text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={saveWorkshopMutation.isPending}
                className="text-xs font-bold bg-brand hover:bg-brand-hover text-white"
              >
                {saveWorkshopMutation.isPending ? 'Saving...' : 'Save & Select'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm Deletion Modal */}
      <ConfirmModal
        isOpen={isConfirmDeleteOpen}
        onClose={() => setIsConfirmDeleteOpen(false)}
        onConfirm={() => deleteWorkshopsMutation.mutate(checkedWorkshops)}
        title="Delete Workshop(s)"
        message={`Are you sure you want to remove ${
          checkedWorkshops.length === 1
            ? `"${checkedWorkshops[0]?.name}"`
            : `${checkedWorkshops.length} selected workshops`
        } from the suggestions directory? Past maintenance records will preserve their logged names.`}
        confirmLabel={deleteWorkshopsMutation.isPending ? 'Deleting...' : 'Delete'}
        isDestructive={true}
      />
    </div>
  );
}
