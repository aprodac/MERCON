import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, RotateCcw, RefreshCw, Download, Truck, Users, Car, Wrench, Building2, ReceiptText, CreditCard } from 'lucide-react';

import { SettingsPage } from '@/components/settings/SettingsKit';
import Btn from '@/components/ui/Btn';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { trashService, TrashItem } from '@/services/trashService';
import ConfirmModal from '@/components/ui/ConfirmModal';
import DataTable from '@/components/ui/DataTable';
import { cn } from '@/lib/utils';
import { authStore } from '@/store/authStore';


type EntityFilter = 'ALL' | 'Trip' | 'Driver' | 'Vehicle' | 'MaintenanceRecord' | 'Customer' | 'FINANCIALS';

export default function RecycleBinPage() {
  // Deleting for good can't be undone — Admins only (the API enforces it too).
  const role = authStore.getUser()?.role;
  const canPurge = role === 'Admin' || role === 'SuperAdmin';
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<EntityFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'type' | 'name'>('newest');

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    isDestructive?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    isDestructive: false,
  });

  // Query soft-deleted trash items
  const { data: trashItems = [], isLoading, isRefetching } = useQuery({
    queryKey: ['trash'],
    queryFn: trashService.getAll,
    refetchInterval: 30000,
  });

  // Mutations
  const restoreMutation = useMutation({
    mutationFn: (payload: { type: string; id: string }) => trashService.restore(payload.type, payload.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash'] });
    },
    onError: (err: any) => {
      alert(err.response?.data?.error?.message || err.message || 'Failed to restore item.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (payload: { type: string; id: string }) => trashService.permanentDelete(payload.type, payload.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash'] });
    },
    onError: (err: any) => {
      alert(err.response?.data?.error?.message || err.message || 'Failed to permanently delete item.');
    },
  });

  // Categorized counts calculation
  const counts = useMemo(() => {
    const tripCount = trashItems.filter(i => i.type === 'Trip').length;
    const driverCount = trashItems.filter(i => i.type === 'Driver').length;
    const vehicleCount = trashItems.filter(i => i.type === 'Vehicle').length;
    const maintenanceCount = trashItems.filter(i => i.type === 'MaintenanceRecord').length;
    const customerCount = trashItems.filter(i => i.type === 'Customer').length;
    const financialsCount = trashItems.filter(i => i.type === 'Invoice' || i.type === 'RateCard').length;
    
    return {
      all: trashItems.length,
      trip: tripCount,
      driver: driverCount,
      vehicle: vehicleCount,
      maintenance: maintenanceCount,
      customer: customerCount,
      financials: financialsCount,
      operations: tripCount + vehicleCount,
      people: driverCount + customerCount,
      serviceAndFinance: maintenanceCount + financialsCount,
    };
  }, [trashItems]);

  // Filtering & Sorting
  const filteredItems = useMemo(() => {
    return trashItems
      .filter((item) => {
        // Category Filter
        if (selectedCategory !== 'ALL') {
          if (selectedCategory === 'FINANCIALS') {
            if (item.type !== 'Invoice' && item.type !== 'RateCard') return false;
          } else if (item.type !== selectedCategory) {
            return false;
          }
        }

        // Search Filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchName = item.name.toLowerCase().includes(q);
          const matchType = item.type.toLowerCase().includes(q);
          const matchId = item.id.toLowerCase().includes(q);
          return matchName || matchType || matchId;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') return new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime();
        if (sortBy === 'oldest') return new Date(a.deletedAt).getTime() - new Date(b.deletedAt).getTime();
        if (sortBy === 'type') return a.type.localeCompare(b.type);
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        return 0;
      });
  }, [trashItems, selectedCategory, searchQuery, sortBy]);

  const ENTITY: Record<string, { label: string; icon: typeof Truck }> = {
    Trip: { label: 'Trip', icon: Truck },
    Driver: { label: 'Driver', icon: Users },
    Vehicle: { label: 'Vehicle', icon: Car },
    MaintenanceRecord: { label: 'Maintenance', icon: Wrench },
    Customer: { label: 'Customer', icon: Building2 },
    Invoice: { label: 'Invoice', icon: ReceiptText },
    RateCard: { label: 'Rate card', icon: CreditCard },
  };

  // Table Columns
  const columns = [
    {
      header: 'Item',
      accessor: (row: TrashItem) => {
        const entity = ENTITY[row.type] ?? { label: row.type, icon: Trash2 };
        const Icon = entity.icon;
        return (
          <div className="flex items-center gap-3 py-0.5 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-foreground truncate">{row.name}</span>
              <span className="block text-xs text-muted-foreground">{entity.label}</span>
            </span>
          </div>
        );
      },
    },
    {
      header: 'Deleted',
      accessor: (row: TrashItem) => (
        <span className="text-muted-foreground whitespace-nowrap">
          {new Date(row.deletedAt).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
    },
    {
      header: '',
      headerClassName: 'text-right',
      className: 'text-right',
      accessor: (row: TrashItem) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              setConfirmModal({
                isOpen: true,
                title: `Restore ${row.type === 'MaintenanceRecord' ? 'Maintenance Record' : row.type}`,
                message: `Are you sure you want to restore "${row.name}"? It will immediately return to active operational lists.`,
                isDestructive: false,
                onConfirm: () => restoreMutation.mutate({ type: row.type, id: row.id }),
              });
            }}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold text-foreground hover:bg-muted transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restore
          </button>
          {canPurge && <button
            onClick={() => {
              setConfirmModal({
                isOpen: true,
                title: `Permanently Delete ${row.type === 'MaintenanceRecord' ? 'Maintenance Record' : row.type}`,
                message: `Are you sure you want to permanently delete "${row.name}"? This action is IRREVERSIBLE and cannot be undone.`,
                isDestructive: true,
                onConfirm: () => deleteMutation.mutate({ type: row.type, id: row.id }),
              });
            }}
            title="Delete permanently"
            aria-label={`Delete ${row.name} permanently`}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>}
        </div>
      ),
    },
  ];

  // Bulk Actions
  const bulkActions = [
    {
      label: 'Restore Selected',
      icon: <RotateCcw size={13} />,
      variant: 'primary' as const,
      onClick: (selectedRows: TrashItem[]) => {
        setConfirmModal({
          isOpen: true,
          title: 'Restore Selected Items',
          message: `Are you sure you want to restore ${selectedRows.length} item(s)? They will return to their respective operational lists.`,
          isDestructive: false,
          onConfirm: async () => {
            try {
              await Promise.all(selectedRows.map((r) => trashService.restore(r.type, r.id)));
              queryClient.invalidateQueries({ queryKey: ['trash'] });
            } catch (e) {
              alert('Failed to restore some or all selected items.');
            }
          },
        });
      },
    },
    {
      label: 'Delete Permanently',
      icon: <Trash2 size={13} />,
      variant: 'danger' as const,
      onClick: (selectedRows: TrashItem[]) => {
        setConfirmModal({
          isOpen: true,
          title: 'Permanently Delete Selected Items',
          message: `Are you sure you want to permanently delete ${selectedRows.length} item(s)? This process is permanent and cannot be reversed.`,
          isDestructive: true,
          onConfirm: async () => {
            try {
              await Promise.all(selectedRows.map((r) => trashService.permanentDelete(r.type, r.id)));
              queryClient.invalidateQueries({ queryKey: ['trash'] });
            } catch (e) {
              alert('Failed to permanently delete some or all selected items.');
            }
          },
        });
      },
    },
  ];

  // Purge All Trash Handler
  const handlePurgeAll = () => {
    if (trashItems.length === 0) return;
    setConfirmModal({
      isOpen: true,
      title: 'Empty Recycle Bin (Purge All)',
      message: `WARNING: You are about to PERMANENTLY DELETE ALL ${trashItems.length} soft-deleted items across Trips, Drivers, Vehicles, Maintenance, and Customers. Proceed with extreme caution!`,
      isDestructive: true,
      onConfirm: async () => {
        try {
          await Promise.all(trashItems.map((item) => trashService.permanentDelete(item.type, item.id)));
          queryClient.invalidateQueries({ queryKey: ['trash'] });
        } catch (e) {
          alert('Failed to purge all items from recycle bin.');
        }
      },
    });
  };

  // Export CSV Handler
  const handleExportCSV = () => {
    if (filteredItems.length === 0) return;
    const headers = ['ID', 'Entity Type', 'Identifier / Name', 'Deleted Date'];
    const csvRows = [
      headers.join(','),
      ...filteredItems.map((item) =>
        [
          `"${item.id}"`,
          `"${item.type}"`,
          `"${item.name.replace(/"/g, '""')}"`,
          `"${new Date(item.deletedAt).toISOString()}"`,
        ].join(',')
      ),
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `recycle_bin_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const categories: { id: typeof selectedCategory; label: string; count: number }[] = [
    { id: 'ALL', label: 'Everything', count: counts.all },
    { id: 'Trip', label: 'Trips', count: counts.trip },
    { id: 'Driver', label: 'Drivers', count: counts.driver },
    { id: 'Vehicle', label: 'Vehicles', count: counts.vehicle },
    { id: 'MaintenanceRecord', label: 'Maintenance', count: counts.maintenance },
    { id: 'Customer', label: 'Customers', count: counts.customer },
    { id: 'FINANCIALS', label: 'Invoices & rates', count: counts.financials },
  ];

  return (
    <SettingsPage
      wide
      title="Recycle bin"
      description="Deleted trips, drivers, vehicles, customers and finance records stay here until you restore them or delete them for good."
      actions={
        <>
          <Btn label="Refresh" variant="ghost" size="sm" icon={<RefreshCw size={13} className={cn(isRefetching && 'animate-spin')} />} onClick={() => queryClient.invalidateQueries({ queryKey: ['trash'] })} />
          <Btn label="Export CSV" variant="outline" size="sm" icon={<Download size={13} />} onClick={handleExportCSV} disabled={filteredItems.length === 0} />
          {canPurge && <Btn label="Empty recycle bin" variant="danger" size="sm" icon={<Trash2 size={13} />} onClick={handlePurgeAll} disabled={trashItems.length === 0} />}
        </>
      }
    >
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1" role="tablist" aria-label="Filter by type">
        {categories.map((c) => {
          const active = selectedCategory === c.id;
          return (
            <button
              key={c.id}
              role="tab"
              aria-selected={active}
              onClick={() => setSelectedCategory(c.id)}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 h-8 px-3 rounded-full text-xs font-bold transition-colors',
                active ? 'bg-foreground text-background' : 'bg-card border border-black/[0.08] dark:border-white/10 text-muted-foreground hover:text-foreground',
              )}
            >
              {c.label}
              <span className={cn('tabular-nums', active ? 'opacity-70' : 'text-[#9898A4]')}>{c.count}</span>
            </button>
          );
        })}
      </div>

      <DataTable
        columns={columns}
        data={filteredItems}
        enableSelection={true}
        bulkActions={canPurge ? bulkActions : bulkActions.filter((a) => a.variant !== 'danger')}
        compact={true}
        isLoading={isLoading}
        searchPlaceholder="Search by name or ID"
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        filterElement={
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="h-9 w-[180px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="type">By type</SelectItem>
              <SelectItem value="name">By name</SelectItem>
            </SelectContent>
          </Select>
        }
        emptyTitle={searchQuery ? 'No matches' : 'Recycle bin is empty'}
        emptyMessage={searchQuery ? `Nothing deleted matches "${searchQuery}".` : 'Anything you delete will wait here before it is removed for good.'}
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={async () => {
          await confirmModal.onConfirm();
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }}
        title={confirmModal.title}
        message={confirmModal.message}
        isDestructive={confirmModal.isDestructive}
      />
    </SettingsPage>
  );
}
