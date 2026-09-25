import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wrench, Plus, Check, Search, ChevronsUpDown, X, Tag } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { maintenanceService } from '@/services/maintenanceService';
import { cn } from '@/lib/utils';

interface WorkDoneSelectProps {
  value: string;
  onChange: (text: string) => void;
}

export default function WorkDoneSelect({ value, onChange }: WorkDoneSelectProps) {
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Add custom item dialog
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('General');
  const [saveError, setSaveError] = useState('');

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

  const { data: workItems = [] } = useQuery({
    queryKey: ['workItems'],
    queryFn: () => maintenanceService.getWorkItems(),
    staleTime: 30_000,
  });

  const saveWorkItemMutation = useMutation({
    mutationFn: (payload: { title: string; category?: string }) =>
      maintenanceService.createWorkItem(payload),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['workItems'] });
      toggleItem(saved.title);
      setIsAddDialogOpen(false);
      setNewTitle('');
      setSaveError('');
      setSearchQuery('');
    },
    onError: (err: any) => {
      setSaveError(err.response?.data?.error?.message || 'Failed to save service item.');
    },
  });

  // Convert current comma-separated value string into an array of titles
  const selectedItems = value
    ? value
        .split(/,\s*|\n+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const toggleItem = (title: string) => {
    let updated: string[];
    if (selectedItems.includes(title)) {
      updated = selectedItems.filter((item) => item !== title);
    } else {
      updated = [...selectedItems, title];
    }
    onChange(updated.join(', '));
  };

  const removeItem = (titleToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = selectedItems.filter((item) => item !== titleToRemove);
    onChange(updated.join(', '));
  };

  const handleSaveNewItem = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Stop React synthetic event bubbling to parent form
    if (!newTitle.trim()) {
      setSaveError('Service title is required.');
      return;
    }
    saveWorkItemMutation.mutate({
      title: newTitle.trim(),
      category: newCategory.trim() || 'General',
    });
  };

  const filteredWorkItems = workItems.filter(
    (item) =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.category && item.category.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div ref={containerRef} className="relative space-y-2 w-full">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-bold text-slate-800 dark:text-slate-200">
          Work Done / Service Details *
        </Label>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="text-xs font-semibold text-brand hover:underline cursor-pointer flex items-center gap-1"
        >
          <Wrench className="w-3 h-3" />
          {isOpen ? 'Close suggestions' : 'Browse common service items'}
        </button>
      </div>

      {/* Selected Tags Pills */}
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl">
          {selectedItems.map((title) => (
            <span
              key={title}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-orange-50 dark:bg-orange-950/40 text-brand dark:text-orange-400 border border-orange-200 dark:border-orange-900/60"
            >
              <span>{title}</span>
              <button
                type="button"
                onClick={(e) => removeItem(title, e)}
                className="hover:text-rose-600 cursor-pointer ml-0.5 p-0.5 rounded"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Direct Editable Textarea */}
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsOpen(true)}
        placeholder="Enter work performed (e.g., Oil & Filter replacement, Brake Inspection, Tire Puncture Repair)..."
        rows={3}
        className="w-full text-xs font-medium bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl focus-visible:ring-2 focus-visible:ring-brand/30 resize-y"
      />

      {/* Dropdown Panel of Predefined Items */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 w-full min-w-[320px] sm:min-w-[440px] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl bg-white dark:bg-slate-900 overflow-hidden z-[9999] flex flex-col max-h-[320px] animate-in fade-in-0 zoom-in-95 duration-100">
          
          {/* Search Header */}
          <div className="shrink-0 p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search common service items..."
              className="h-8 text-xs border-none shadow-none focus-visible:ring-0 bg-transparent p-0"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Items List */}
          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
            {filteredWorkItems.map((item) => {
              const isSelected = selectedItems.includes(item.title);
              return (
                <div
                  key={item.id}
                  onClick={() => toggleItem(item.title)}
                  className={cn(
                    'w-full px-3 py-2 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-colors text-left select-none',
                    isSelected
                      ? 'bg-orange-50/80 dark:bg-orange-950/30 text-brand dark:text-orange-300 font-bold'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-200'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'w-4 h-4 rounded border flex items-center justify-center transition-colors',
                        isSelected
                          ? 'bg-brand border-brand text-white'
                          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800'
                      )}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span>{item.title}</span>
                  </div>

                  {item.category && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                      {item.category}
                    </span>
                  )}
                </div>
              );
            })}

            {filteredWorkItems.length === 0 && (
              <div className="p-4 text-center text-xs text-slate-400">
                No matching service items found. Type details directly into the text area above!
              </div>
            )}
          </div>

          {/* Footer Action */}
          <div className="shrink-0 p-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setNewTitle(searchQuery.trim());
                setIsAddDialogOpen(true);
              }}
              className="h-7 text-xs font-bold text-brand border-orange-200 dark:border-orange-900/50 hover:bg-orange-50 cursor-pointer"
            >
              <Plus className="w-3 h-3 mr-1" />
              + Add Custom Item
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="h-7 text-xs font-bold bg-charcoal dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white px-3 cursor-pointer rounded-lg shadow-xs inline-flex items-center gap-1"
            >
              <span>Done {selectedItems.length > 0 ? `(${selectedItems.length})` : ''}</span>
              <Check className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Add Custom Work Item Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2.5 text-brand mb-1">
              <Tag className="w-5 h-5 text-orange-600 dark:text-orange-400 shrink-0" />
              <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                Add New Service Detail Item
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500">
              Create a reusable service item (e.g. Engine Overhaul, Brake Pad Replacement).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveNewItem} className="space-y-3.5 py-2">
            {saveError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {saveError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Service Title *
              </Label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Hydraulic Cylinder Seal Replacement"
                className="h-9 text-xs"
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Category
              </Label>
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="e.g. Engine, Brakes, Transmission, Body"
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
                disabled={saveWorkItemMutation.isPending}
                className="text-xs font-bold bg-brand hover:bg-brand-hover text-white"
              >
                {saveWorkItemMutation.isPending ? 'Saving...' : 'Save & Select'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
