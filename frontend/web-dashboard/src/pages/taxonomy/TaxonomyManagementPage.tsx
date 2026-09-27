import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, RefreshCw, Download, Search, Check, Edit2, Trash2, SlidersHorizontal, Tag, Truck, Zap, Calendar
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TaxonomyBadge } from '@/components/common/TaxonomyBadge';
import ConfirmModal from '@/components/ui/ConfirmModal';
import {
  getAllTaxonomyOptions,
  TaxonomyOption,
  TaxonomyCategory,
  COLOR_PALETTES,
  saveCustomTaxonomyOption,
  toggleTaxonomyOptionActiveStatus,
  deleteCustomTaxonomyOption,
  TAXONOMY_UPDATED_EVENT
} from '@/utils/taxonomyRegistry';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import VehicleCompatibilitySection from '@/components/taxonomy/VehicleCompatibilitySection';
import { Label } from '@/components/ui/label';

export default function TaxonomyManagementPage() {
  const [options, setOptions] = useState<TaxonomyOption[]>([]);
  const [search, setSearch] = useState('');
  
  // Default active tab to VEHICLE_CLASS (No "ALL" tab per request)
  const [activeTab, setActiveTab] = useState<TaxonomyCategory>('VEHICLE_CLASS');

  // Modal State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<TaxonomyOption | null>(null);

  // Form Fields
  const [formCategory, setFormCategory] = useState<TaxonomyCategory>('VEHICLE_CLASS');
  const [formCode, setFormCode] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formColorId, setFormColorId] = useState(COLOR_PALETTES[0].id);
  const [formIsActive, setFormIsActive] = useState(true);

  // Delete Confirm Modal State
  const [deletingOption, setDeletingOption] = useState<TaxonomyOption | null>(null);

  const loadData = () => {
    setOptions(getAllTaxonomyOptions());
  };

  useEffect(() => {
    loadData();
    window.addEventListener(TAXONOMY_UPDATED_EVENT, loadData);
    return () => {
      window.removeEventListener(TAXONOMY_UPDATED_EVENT, loadData);
    };
  }, []);

  const handleOpenAddModal = (initialCategory: TaxonomyCategory = activeTab) => {
    setEditingOption(null);
    setFormCategory(initialCategory === 'OPERATION_TYPE' ? 'BILLING_TYPE' : initialCategory);
    setFormCode('');
    setFormLabel('');
    setFormColorId(COLOR_PALETTES[0].id);
    setFormIsActive(true);
    setIsDialogOpen(true);
  };

  const handleOpenEditModal = (opt: TaxonomyOption) => {
    setEditingOption(opt);
    setFormCategory(opt.category === 'OPERATION_TYPE' ? 'BILLING_TYPE' : opt.category);
    setFormCode(opt.code);
    setFormLabel(opt.label);
    setFormColorId(opt.colorTheme.id);
    setFormIsActive(opt.isActive !== false);
    setIsDialogOpen(true);
  };

  const handleSaveOption = () => {
    if (!formLabel.trim()) return;

    try {
      saveCustomTaxonomyOption({
        id: editingOption?.id,
        label: formLabel,
        category: formCategory,
        colorThemeId: formColorId,
        code: formCode || undefined,
        isActive: formIsActive,
      });

      setIsDialogOpen(false);
      loadData();
    } catch (e) {
      console.error('Failed to save taxonomy option', e);
    }
  };

  const handleToggleStatus = (opt: TaxonomyOption) => {
    toggleTaxonomyOptionActiveStatus(opt.id, opt.code, opt.category, opt.isActive !== false);
    loadData();
  };

  const handleDeleteConfirm = () => {
    if (!deletingOption) return;
    deleteCustomTaxonomyOption(deletingOption.id);
    setDeletingOption(null);
    loadData();
  };

  // Filtered options for currently active tab only
  const currentCategoryOptions = useMemo(() => {
    return options.filter(item => {
      if (activeTab === 'BILLING_TYPE' || activeTab === 'OPERATION_TYPE') {
        if (item.category !== 'BILLING_TYPE' && item.category !== 'OPERATION_TYPE') return false;
      } else if (item.category !== activeTab) {
        return false;
      }

      if (!search.trim()) return true;
      const term = search.toLowerCase();
      return (
        item.label.toLowerCase().includes(term) ||
        item.code.toLowerCase().includes(term)
      );
    });
  }, [options, activeTab, search]);

  const counts = useMemo(() => {
    const vc = options.filter(o => o.category === 'VEHICLE_CLASS').length;
    const lt = options.filter(o => o.category === 'LINE_TYPE').length;
    const bt = options.filter(o => o.category === 'BILLING_TYPE' || o.category === 'OPERATION_TYPE').length;
    return { vc, lt, bt };
  }, [options]);

  const vehicleClassOptions = useMemo(() => {
    return options.filter((o) => o.category === 'VEHICLE_CLASS');
  }, [options]);

  const activeCategoryMeta = useMemo(() => {
    switch (activeTab) {
      case 'VEHICLE_CLASS':
        return {
          title: 'Vehicle Classes',
          subtitle: 'Tonnage capacities and truck class specifications (e.g. 3-4 TON, 10 TON, 40 FEET)',
          icon: Truck,
          count: counts.vc,
        };
      case 'LINE_TYPE':
        return {
          title: 'Line Types',
          subtitle: 'Service movement types and duty shift definitions (e.g. Single Trip, Round Trip, 10 Hours Duty)',
          icon: Zap,
          count: counts.lt,
        };
      case 'BILLING_TYPE':
      case 'OPERATION_TYPE':
      default:
        return {
          title: 'Billing Types',
          subtitle: 'Commercial contract billing terms (e.g. Monthly, Extra)',
          icon: Calendar,
          count: counts.bt,
        };
    }
  }, [activeTab, counts]);

  const IconComponent = activeCategoryMeta.icon;

  return (
    <DashboardLayout active="/taxonomy" title="Settings">
      <div className="space-y-5 px-4 sm:px-6 pt-5 pb-12 w-full">
        {/* Crisp White Header Card */}
        <div className="bg-white dark:bg-[#1E1C1D] border border-slate-200/70 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-foreground">Taxonomy</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                The vehicle classes, line types and billing types every dropdown in trips, quotations and rate cards uses, with their badge colours.
              </p>
            </div>

            {/* Actions Group */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const json = JSON.stringify(options, null, 2);
                  const blob = new Blob([json], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `taxonomy-${Date.now()}.json`;
                  a.click();
                }}
                className="h-9 px-3 text-xs font-semibold rounded-xl border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 gap-1.5"
              >
                <Download size={14} className="text-slate-500" />
                Export JSON
              </Button>

              <Button
                size="sm"
                onClick={() => handleOpenAddModal(activeTab)}
                className="h-9 px-4 text-xs font-bold bg-[#FA634E] hover:bg-[#DF4834] text-white rounded-xl shadow-xs gap-1.5 transition-all"
              >
                <Plus size={15} strokeWidth={2.5} />
                Add option
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={loadData}
                title="Refresh master data"
                className="h-9 w-9 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <RefreshCw size={14} />
              </Button>
            </div>
          </div>

          {/* 3 Main Category Tabs (No "ALL" tab per request) */}
          <div className="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <Tabs
              value={activeTab === 'OPERATION_TYPE' ? 'BILLING_TYPE' : activeTab}
              onValueChange={(val: any) => setActiveTab(val)}
              className="w-full sm:w-auto"
            >
              <TabsList className="h-10 p-1 bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 rounded-xl gap-1 w-full sm:w-auto grid grid-cols-3 sm:flex">
                <TabsTrigger
                  value="VEHICLE_CLASS"
                  className="text-xs font-extrabold px-4 h-8 rounded-lg transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-[#2D2B2C] data-[state=active]:text-[#FA634E] data-[state=active]:shadow-xs"
                >
                  <Truck size={13} className="mr-1.5 inline-block" />
                  Vehicle Classes ({counts.vc})
                </TabsTrigger>
                <TabsTrigger
                  value="LINE_TYPE"
                  className="text-xs font-extrabold px-4 h-8 rounded-lg transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-[#2D2B2C] data-[state=active]:text-[#FA634E] data-[state=active]:shadow-xs"
                >
                  <Zap size={13} className="mr-1.5 inline-block" />
                  Line Types ({counts.lt})
                </TabsTrigger>
                <TabsTrigger
                  value="BILLING_TYPE"
                  className="text-xs font-extrabold px-4 h-8 rounded-lg transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-[#2D2B2C] data-[state=active]:text-[#FA634E] data-[state=active]:shadow-xs"
                >
                  <Calendar size={13} className="mr-1.5 inline-block" />
                  Billing Types ({counts.bt})
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Search Input Bar */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Search ${activeCategoryMeta.title.toLowerCase()}...`}
                className="pl-9 h-10 text-xs bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 rounded-xl focus-visible:ring-[#FA634E]"
              />
            </div>
          </div>
        </div>

        {/* Crisp White Category Table Container */}
        <div className="bg-white dark:bg-[#1E1C1D] border border-slate-200/70 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
          {/* Table Header Bar */}
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/20">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-orange-50 dark:bg-orange-950/40 text-[#FA634E] flex items-center justify-center">
                <IconComponent size={15} />
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-[#3E3C3D] dark:text-white leading-tight">
                  {activeCategoryMeta.title}
                </h2>
                <p className="text-[11px] text-slate-400 font-medium hidden sm:block">
                  {activeCategoryMeta.subtitle}
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleOpenAddModal(activeTab)}
              className="h-7 px-2.5 text-xs font-bold text-[#FA634E] border-[#FA634E]/30 hover:bg-[#FA634E]/10 rounded-lg gap-1"
            >
              <Plus size={13} strokeWidth={2.5} />
              Add Option
            </Button>
          </div>

          {/* Clean Ledger Data Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/60 dark:bg-slate-800/30">
                  <th className="py-3 px-5 w-12">#</th>
                  <th className="py-3 px-5">Code / Identifier</th>
                  <th className="py-3 px-5">Display Label</th>
                  <th className="py-3 px-5 text-center">Universal Badge Preview</th>
                  <th className="py-3 px-5">Color Swatch</th>
                  <th className="py-3 px-5">Origin</th>
                  <th className="py-3 px-5">Status</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-medium">
                {currentCategoryOptions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                          <SlidersHorizontal size={18} />
                        </div>
                        <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                          No {activeCategoryMeta.title.toLowerCase()} found
                        </p>
                        <p className="text-[11px] text-slate-400 max-w-xs">
                          {search ? 'Try clearing your search query or add a new option.' : 'Click "+ Add Option" above to create one.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  currentCategoryOptions.map((row, idx) => {
                    const isActive = row.isActive !== false;

                    return (
                      <tr key={row.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-5 font-mono text-slate-400 text-[11px]">
                          {idx + 1}
                        </td>

                        <td className="py-3 px-5 font-mono font-bold text-[#3E3C3D] dark:text-slate-100">
                          {row.code}
                        </td>

                        <td className="py-3 px-5 font-bold text-slate-800 dark:text-slate-200 text-xs">
                          {row.label}
                        </td>

                        <td className="py-3 px-5 text-center">
                          <TaxonomyBadge category={activeTab} value={row.code} size="default" />
                        </td>

                        <td className="py-3 px-5">
                          <div className="inline-flex items-center gap-2 px-2 py-1 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                            <span
                              className="w-3 h-3 rounded-full border border-black/10 shrink-0 shadow-2xs"
                              style={{ backgroundColor: row.colorTheme.hex }}
                            />
                            <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300 font-bold uppercase">
                              {row.colorTheme.hex}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-5">
                          {row.isCustom ? (
                            <Badge className="bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800 text-[10px] font-bold px-2 py-0.5">
                              Custom
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 px-2 py-0.5">
                              Canonical
                            </Badge>
                          )}
                        </td>

                        <td className="py-3 px-5">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(row)}
                            className="flex items-center gap-2 group cursor-pointer"
                          >
                            <span
                              className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                isActive ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                  isActive ? 'translate-x-4' : 'translate-x-0'
                                }`}
                              />
                            </span>
                            <span className={`text-[11px] font-bold ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                              {isActive ? 'Active' : 'Inactive'}
                            </span>
                          </button>
                        </td>

                        <td className="py-3 px-5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenEditModal(row)}
                              className="h-7 px-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg gap-1"
                            >
                              <Edit2 size={12} /> Edit
                            </Button>

                            {row.isCustom && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeletingOption(row)}
                                className="h-7 w-7 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
                                title="Delete Custom Option"
                              >
                                <Trash2 size={13} />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }))}
                </tbody>
              </table>
            </div>
          </div>

        {/* Vehicle Operational Assignment Rules Section */}
        {activeTab === 'VEHICLE_CLASS' && (
          <VehicleCompatibilitySection vehicleClassOptions={vehicleClassOptions} />
        )}
      </div>

      {/* Add / Edit Option Dialog Modal */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-[#1E1C1D] border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold text-[#3E3C3D] dark:text-white">
              {editingOption ? 'Edit Taxonomy Option' : 'Add Taxonomy Option'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 py-1 text-xs">
            {/* Category Selector */}
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Category *</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['VEHICLE_CLASS', 'LINE_TYPE', 'BILLING_TYPE'] as TaxonomyCategory[]).map(cat => {
                  const label = cat === 'VEHICLE_CLASS' ? 'Vehicle Class' : cat === 'LINE_TYPE' ? 'Line Type' : 'Billing Type';
                  const isSelected = formCategory === cat || (cat === 'BILLING_TYPE' && formCategory === 'OPERATION_TYPE');
                  return (
                    <button
                      key={cat}
                      type="button"
                      disabled={Boolean(editingOption && !editingOption.isCustom)}
                      onClick={() => setFormCategory(cat)}
                      className={`py-2 px-2 rounded-xl text-[11px] font-extrabold border transition-all ${
                        isSelected
                          ? 'bg-[#FA634E] text-white border-[#FA634E] shadow-2xs'
                          : 'bg-slate-50 dark:bg-[#2D2B2C] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Code / Identifier */}
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Code / Identifier *</Label>
              <Input
                value={formCode}
                onChange={e => setFormCode(e.target.value)}
                disabled={Boolean(editingOption && !editingOption.isCustom)}
                placeholder="e.g. 15 TON, DEDICATED_DAILY"
                className="h-9 text-xs font-mono font-bold rounded-xl"
              />
              {editingOption && !editingOption.isCustom && (
                <span className="text-[10px] text-slate-400 font-medium">Canonical system identifier cannot be modified.</span>
              )}
            </div>

            {/* Display Label */}
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Display Label *</Label>
              <Input
                value={formLabel}
                onChange={e => setFormLabel(e.target.value)}
                placeholder="e.g. 15 TON, Dedicated Daily"
                className="h-9 text-xs font-semibold rounded-xl"
              />
            </div>

            {/* Color Swatch Picker */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Universal Badge Color Theme
              </Label>
              <div className="grid grid-cols-4 gap-2 max-h-36 overflow-y-auto p-1.5 border border-slate-200 dark:border-slate-800 rounded-xl">
                {COLOR_PALETTES.map(palette => {
                  const isSelected = formColorId === palette.id;
                  return (
                    <button
                      key={palette.id}
                      type="button"
                      onClick={() => setFormColorId(palette.id)}
                      className={`flex flex-col items-center justify-center p-1.5 rounded-lg border transition-all text-center relative ${palette.bg} ${palette.border} ${
                        isSelected
                          ? 'ring-2 ring-[#FA634E] ring-offset-1 border-[#FA634E]'
                          : 'opacity-80 hover:opacity-100'
                      }`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full border mb-0.5 shadow-2xs"
                        style={{ backgroundColor: palette.hex }}
                      />
                      <span className={`text-[9px] font-bold truncate max-w-full ${palette.text}`}>
                        {palette.name.split(' ')[0]}
                      </span>
                      {isSelected && (
                        <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-[#FA634E] text-white flex items-center justify-center">
                          <Check size={6} strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Status Switch */}
            <div className="flex items-center justify-between pt-1">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Status Active</Label>
              <button
                type="button"
                onClick={() => setFormIsActive(!formIsActive)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  formIsActive ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    formIsActive ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              className="h-8.5 text-xs font-bold rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveOption}
              disabled={!formLabel.trim()}
              className="h-8.5 text-xs font-bold bg-[#FA634E] hover:bg-[#DF4834] text-white rounded-xl shadow-2xs"
            >
              {editingOption ? 'Save Changes' : 'Create Option'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deletingOption)}
        onClose={() => setDeletingOption(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Custom Option"
        message={`Are you sure you want to delete custom option "${deletingOption?.label}"? This action cannot be undone.`}
        confirmLabel="Delete Option"
        isDestructive
      />
    </DashboardLayout>
  );
}
