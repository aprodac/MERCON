import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Sparkles, RotateCw, CheckCircle2, AlertCircle, FileText, Truck, UserIcon, 
  Search, ShieldAlert, ArrowRight, Check, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { documentService } from '@/services/documentService';
import { Combobox } from '@/components/ui/combobox';
import { toast } from 'sonner';

interface ProposalItem {
  docId: string;
  fileName: string;
  docType: string;
  fileUrl?: string;
  entityType: string;
  entityId: string;
  proposedType: 'Vehicle' | 'Driver' | null;
  proposedId: string | null;
  proposedName: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  matchReason: string;
}

interface VehicleOption {
  id: string;
  plate_number: string;
  ref_id?: string;
}

interface DriverOption {
  id: string;
  first_name: string;
  last_name: string;
  license_number?: string;
}

interface AutoAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AutoAssignModal: React.FC<AutoAssignModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [proposals, setProposals] = useState<ProposalItem[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  
  // Custom user assignments: map of docId -> { entityType, entityId, isSelected }
  const [userAssignments, setUserAssignments] = useState<
    Record<string, { entityType: 'Vehicle' | 'Driver'; entityId: string; isSelected: boolean }>
  >({});
  
  const [search, setSearch] = useState('');
  const [confidenceFilter, setConfidenceFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'UNLINKED'>('ALL');

  useEffect(() => {
    if (isOpen) {
      loadProposals();
    }
  }, [isOpen]);

  const loadProposals = async () => {
    setIsLoading(true);
    try {
      const res = await documentService.previewAutoAssign();
      const rawProposals: ProposalItem[] = res.data || [];
      const vList: VehicleOption[] = res.vehicles || [];
      const dList: DriverOption[] = res.drivers || [];

      setProposals(rawProposals);
      setVehicles(vList);
      setDrivers(dList);

      // Initialize user assignments map
      const initialMap: Record<string, { entityType: 'Vehicle' | 'Driver'; entityId: string; isSelected: boolean }> = {};
      for (const item of rawProposals) {
        const hasProposal = Boolean(item.proposedType && item.proposedId);
        initialMap[item.docId] = {
          entityType: item.proposedType || 'Vehicle',
          entityId: item.proposedId || (vList[0]?.id || ''),
          isSelected: hasProposal, // Auto-check if backend proposed a match
        };
      }
      setUserAssignments(initialMap);
    } catch (err: any) {
      toast.error('Failed scanning document proposals: ' + (err.message || 'Error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleSelect = (docId: string) => {
    setUserAssignments((prev) => ({
      ...prev,
      [docId]: {
        ...prev[docId],
        isSelected: !prev[docId]?.isSelected,
      },
    }));
  };

  const handleSelectAllHighConfidence = () => {
    setUserAssignments((prev) => {
      const updated = { ...prev };
      for (const item of proposals) {
        if (item.confidence === 'HIGH' && item.proposedId) {
          updated[item.docId] = {
            ...updated[item.docId],
            isSelected: true,
          };
        }
      }
      return updated;
    });
    toast.success('Selected all high-confidence AI proposals');
  };

  const handleSelectAll = (select: boolean) => {
    setUserAssignments((prev) => {
      const updated = { ...prev };
      for (const item of proposals) {
        if (updated[item.docId]) {
          updated[item.docId].isSelected = select;
        }
      }
      return updated;
    });
  };

  const handleEntityChange = (docId: string, entityType: 'Vehicle' | 'Driver', entityId: string) => {
    setUserAssignments((prev) => ({
      ...prev,
      [docId]: {
        entityType,
        entityId,
        isSelected: true, // Auto select when user manually assigns an entity
      },
    }));
  };

  const handleConfirmAssignments = async () => {
    const selectedPayload = Object.entries(userAssignments)
      .filter(([_, value]) => value.isSelected && value.entityId)
      .map(([docId, value]) => ({
        docId,
        entityType: value.entityType,
        entityId: value.entityId,
      }));

    if (selectedPayload.length === 0) {
      toast.warning('Please select at least one document match to assign');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await documentService.confirmAutoAssign(selectedPayload);
      toast.success(res.message || `Successfully linked ${selectedPayload.length} documents!`);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error('Failed applying assignments: ' + (err.message || 'Error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredProposals = useMemo(() => {
    return proposals.filter((p) => {
      const assignment = userAssignments[p.docId];
      const matchSearch =
        p.fileName.toLowerCase().includes(search.toLowerCase()) ||
        (p.proposedName || '').toLowerCase().includes(search.toLowerCase()) ||
        p.docType.toLowerCase().includes(search.toLowerCase());

      if (!matchSearch) return false;

      if (confidenceFilter === 'HIGH') return p.confidence === 'HIGH';
      if (confidenceFilter === 'MEDIUM') return p.confidence === 'MEDIUM';
      if (confidenceFilter === 'UNLINKED') return !p.proposedId;
      return true;
    });
  }, [proposals, search, confidenceFilter, userAssignments]);

  const selectedCount = useMemo(() => {
    return Object.values(userAssignments).filter((u) => u.isSelected && u.entityId).length;
  }, [userAssignments]);

  const highConfidenceCount = useMemo(() => {
    return proposals.filter((p) => p.confidence === 'HIGH' && p.proposedId).length;
  }, [proposals]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-[94vw] max-h-[90vh] p-0 flex flex-col gap-0 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl bg-white dark:bg-slate-900">
        
        {/* Header Bar */}
        <DialogHeader className="px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 shrink-0 flex flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <DialogTitle className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>Interactive AI Auto-Assigner</span>
                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[10px] font-mono font-bold px-2 py-0.5 border-0">
                  OCR Matching Engine
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Review proposed document matches, customize vehicle/driver links, and approve assignments.
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={loadProposals}
              disabled={isLoading}
              className="h-8 text-xs font-bold gap-1.5 border-slate-200 dark:border-slate-700 shadow-2xs"
            >
              <RotateCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
              <span>Rescan</span>
            </Button>
          </div>
        </DialogHeader>

        {/* Toolbar & Filters Bar */}
        <div className="px-6 py-3 bg-slate-100/60 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search file name, plate, or driver..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className={cn('h-8 text-xs font-bold px-2.5 rounded-lg', confidenceFilter === 'ALL' && 'bg-slate-200 dark:bg-slate-800')}
              onClick={() => setConfidenceFilter('ALL')}
            >
              All ({proposals.length})
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={cn('h-8 text-xs font-bold px-2.5 rounded-lg text-emerald-600', confidenceFilter === 'HIGH' && 'bg-emerald-50 dark:bg-emerald-950/50')}
              onClick={() => setConfidenceFilter('HIGH')}
            >
              High ({highConfidenceCount})
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={cn('h-8 text-xs font-bold px-2.5 rounded-lg text-amber-600', confidenceFilter === 'MEDIUM' && 'bg-amber-50 dark:bg-amber-950/50')}
              onClick={() => setConfidenceFilter('MEDIUM')}
            >
              Medium
            </Button>

            <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-1" />

            <Button
              size="sm"
              variant="outline"
              onClick={handleSelectAllHighConfidence}
              className="h-8 text-xs font-bold text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300 gap-1.5 shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Select High Confidence</span>
            </Button>
          </div>
        </div>

        {/* Modal Scrollable Content Ledger */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 min-h-[350px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
              <RotateCw className="w-8 h-8 animate-spin text-amber-500 opacity-70" />
              <p className="text-xs font-medium">Scanning vault & analyzing document metadata against fleet database...</p>
            </div>
          ) : filteredProposals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 opacity-80" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No matching proposals found</p>
              <p className="text-[11px] text-slate-400">Try clearing your search term or confidence filter</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredProposals.map((item) => {
                const userChoice = userAssignments[item.docId];
                const isChecked = userChoice?.isSelected || false;
                const currentEntityType = userChoice?.entityType || item.proposedType || 'Vehicle';
                const currentEntityId = userChoice?.entityId || item.proposedId || '';

                return (
                  <div
                    key={item.docId}
                    className={cn(
                      'p-4 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4',
                      isChecked
                        ? 'border-brand/40 bg-brand-light/30 dark:bg-brand/5 shadow-2xs'
                        : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                    )}
                  >
                    {/* Checkbox & File Info */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => handleToggleSelect(item.docId)}
                        className="mt-1 shrink-0"
                      />

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                          <h4 className="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate">
                            {item.fileName}
                          </h4>
                          <Badge variant="outline" className="text-[10px] font-mono px-2 py-0.2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {item.docType}
                          </Badge>
                        </div>

                        {/* Match Reason & AI Insight */}
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className={cn(
                            'font-bold px-1.5 py-0.2 rounded text-[10px] font-mono',
                            item.confidence === 'HIGH' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
                            item.confidence === 'MEDIUM' && 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
                            item.confidence === 'NONE' && 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          )}>
                            {item.confidence} CONFIDENCE
                          </span>
                          <span className="text-slate-500 dark:text-slate-400 truncate">{item.matchReason}</span>
                        </div>
                      </div>
                    </div>

                    {/* Proposed Match & Interactive Override Controls */}
                    <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                      {/* Entity Type Selector (Vehicle / Driver) */}
                      <Select
                        value={currentEntityType}
                        onValueChange={(v) => {
                          const val = v as 'Vehicle' | 'Driver';
                          const defaultId = val === 'Vehicle' ? vehicles[0]?.id || '' : drivers[0]?.id || '';
                          handleEntityChange(item.docId, val, defaultId);
                        }}
                      >
                        <SelectTrigger className="h-8 w-28 text-xs font-bold bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Vehicle" className="text-xs font-bold">
                            <span className="flex items-center gap-1.5">
                              <Truck className="w-3.5 h-3.5 text-emerald-600" /> Vehicle
                            </span>
                          </SelectItem>
                          <SelectItem value="Driver" className="text-xs font-bold">
                            <span className="flex items-center gap-1.5">
                              <UserIcon className="w-3.5 h-3.5 text-blue-600" /> Driver
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      {/* Specific Vehicle or Driver Searchable Combobox */}
                      <Combobox
                        options={
                          currentEntityType === 'Vehicle'
                            ? vehicles.map((v) => ({
                                value: v.id,
                                label: v.plate_number || v.ref_id || 'Vehicle',
                                keywords: `${v.plate_number} ${v.ref_id}`,
                              }))
                            : drivers.map((d) => ({
                                value: d.id,
                                label: `${d.first_name} ${d.last_name}`,
                                keywords: `${d.first_name} ${d.last_name} ${d.license_number || ''}`,
                              }))
                        }
                        value={currentEntityId}
                        onChange={(val) => handleEntityChange(item.docId, currentEntityType, val)}
                        placeholder="Select target..."
                        searchPlaceholder={`Search ${currentEntityType.toLowerCase()}...`}
                        triggerClassName="h-8 w-48 text-xs font-semibold bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions Bar */}
        <DialogFooter className="px-6 py-4 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 shrink-0 flex flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-400">
            <span>Selected: <strong className="text-brand font-mono text-sm">{selectedCount}</strong> doc(s)</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px] p-0 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
              onClick={() => handleSelectAll(true)}
            >
              Select All
            </Button>
            <span>•</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px] p-0 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
              onClick={() => handleSelectAll(false)}
            >
              Deselect All
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onClose} disabled={isSubmitting} className="h-9 px-4 text-xs font-bold">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmAssignments}
              disabled={isSubmitting || selectedCount === 0}
              className="h-9 px-5 text-xs font-bold bg-brand hover:bg-brand-hover text-white shadow-xs gap-1.5"
            >
              {isSubmitting ? <RotateCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>Confirm & Link {selectedCount} Document(s)</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
