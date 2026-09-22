import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, Activity, Users as UsersIcon, Layers } from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import KpiCard from '@/components/ui/KpiCard';
import DataTable, { Column } from '@/components/ui/DataTable';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { settingsService } from '@/services/settingsService';
import type { AuditLog } from '@mercon/shared-types';

const ENTITY_COLORS: Record<string, string> = {
  User: 'bg-blue-50 text-blue-700 border-blue-200',
  JournalEntry: 'bg-purple-50 text-purple-700 border-purple-200',
  Invoice: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Bill: 'bg-amber-50 text-amber-700 border-amber-200',
};

const ACTION_COLOR = (action: string) => {
  if (action.includes('DELETED') || action.includes('VOIDED')) return 'bg-rose-50 text-rose-700 border-rose-200';
  if (action.includes('CREATED') || action.includes('POSTED') || action.includes('ISSUED') || action.includes('APPROVED')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  return 'bg-slate-100 text-slate-600 border-slate-300';
};

export default function AuditLogPage() {
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [selectedEntityType, setSelectedEntityType] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 25;
  const [viewingLog, setViewingLog] = useState<AuditLog | null>(null);

  const { data: logsRes, isLoading } = useQuery({
    queryKey: ['audit-logs', selectedAction, selectedEntityType, search, page],
    queryFn: () =>
      settingsService.getAuditLogs({
        action: selectedAction,
        entityType: selectedEntityType,
        search,
        page,
        per_page: perPage,
      }),
  });

  const logs: AuditLog[] = logsRes?.data || [];
  const pagination = logsRes?.pagination || { page: 1, per_page: perPage, total: 0, total_pages: 1 };
  const availableActions: string[] = logsRes?.filters?.actions || [];
  const availableEntityTypes: string[] = logsRes?.filters?.entityTypes || [];

  const kpis = {
    total: pagination.total,
    entityTypes: availableEntityTypes.length,
    actors: new Set(logs.map((l) => l.userId).filter(Boolean)).size,
    financeEvents: logs.filter((l) => ['JournalEntry', 'Invoice', 'Bill'].includes(l.entityType)).length,
  };

  const columns: Column<AuditLog>[] = [
    {
      header: 'Timestamp',
      accessor: (log) => (
        <span className="font-mono text-slate-600">{new Date(log.createdAt).toLocaleString()}</span>
      ),
      mobilePriority: 'secondary',
    },
    {
      header: 'Actor',
      accessor: (log) => (
        <span className="font-medium text-slate-800">
          {log.user?.name || log.user?.username || <span className="text-slate-400 italic">System</span>}
        </span>
      ),
      mobilePriority: 'primary',
    },
    {
      header: 'Action',
      accessor: (log) => <Badge className={`${ACTION_COLOR(log.action)} border font-mono`}>{log.action}</Badge>,
      mobilePriority: 'primary',
    },
    {
      header: 'Entity',
      accessor: (log) => (
        <div className="flex items-center gap-1.5">
          <Badge className={`${ENTITY_COLORS[log.entityType] || 'bg-slate-100 text-slate-600 border-slate-300'} border`}>
            {log.entityType}
          </Badge>
          {log.entityId && <span className="font-mono text-slate-400 text-[11px]">{log.entityId.slice(0, 8)}</span>}
        </div>
      ),
      mobilePriority: 'secondary',
    },
    {
      header: 'Details',
      headerClassName: 'text-right',
      className: 'text-right',
      accessor: (log) => (
        <button
          onClick={() => setViewingLog(log)}
          className="text-xs font-semibold text-brand hover:underline"
        >
          View metadata
        </button>
      ),
      mobilePriority: 'meta',
    },
  ];

  const filterElement = (
    <div className="flex items-center gap-2 flex-wrap">
      <Select
        value={selectedEntityType}
        onValueChange={(v) => {
          setSelectedEntityType(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="h-9 text-xs w-40">
          <SelectValue placeholder="All Entities" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Entities</SelectItem>
          {availableEntityTypes.map((et) => (
            <SelectItem key={et} value={et}>
              {et}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={selectedAction}
        onValueChange={(v) => {
          setSelectedAction(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="h-9 text-xs w-56">
          <SelectValue placeholder="All Actions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Actions</SelectItem>
          {availableActions.map((a) => (
            <SelectItem key={a} value={a}>
              {a}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <DashboardLayout active="settings" title="Audit Log">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#3E3C3D] flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-600" />
              Audit Log
            </h1>
            <p className="text-sm text-slate-500">Every recorded security & financial state-change event, platform-wide</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 shrink-0">
          <KpiCard title="TOTAL EVENTS" value={kpis.total} variant="slate" icon={Activity} description="Matching current filters" />
          <KpiCard title="ENTITY TYPES" value={kpis.entityTypes} variant="brand" icon={Layers} description="Distinct entities tracked" />
          <KpiCard title="ACTORS (THIS PAGE)" value={kpis.actors} variant="blue" icon={UsersIcon} description="Distinct users on this page" />
          <KpiCard title="FINANCE EVENTS (THIS PAGE)" value={kpis.financeEvents} variant="amber" icon={Shield} description="Journal/Invoice/Bill actions" />
        </div>

        <DataTable<AuditLog>
          title="Audit Trail"
          columns={columns}
          data={logs}
          isLoading={isLoading}
          searchPlaceholder="Search action, entity type, or entity ID..."
          searchValue={search}
          onSearchChange={(val) => {
            setSearch(val);
            setPage(1);
          }}
          filterElement={filterElement}
          enableSelection={false}
          getRowId={(log) => log.id}
          currentPage={pagination.page}
          totalPages={pagination.total_pages}
          totalRecords={pagination.total}
          onPageChange={setPage}
          emptyTitle="No Audit Events"
          emptyMessage="No audit log entries found matching criteria."
        />

        <Dialog open={!!viewingLog} onOpenChange={() => setViewingLog(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-[#3E3C3D]">
                {viewingLog?.action}
              </DialogTitle>
            </DialogHeader>
            {viewingLog && (
              <div className="space-y-3 py-2 text-xs">
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div>
                    <span className="text-slate-400 block font-medium">Actor</span>
                    <span className="font-semibold text-slate-800">{viewingLog.user?.name || viewingLog.user?.username || 'System'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Timestamp</span>
                    <span className="font-mono text-slate-800">{new Date(viewingLog.createdAt).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Entity</span>
                    <span className="font-semibold text-slate-800">{viewingLog.entityType}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Entity ID</span>
                    <span className="font-mono text-slate-800">{viewingLog.entityId || '—'}</span>
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 font-medium block mb-1">Metadata</span>
                  <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto text-[11px] leading-relaxed">
                    {JSON.stringify(viewingLog.metadata || {}, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
