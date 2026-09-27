import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SettingsPage, StatusDot } from '@/components/settings/SettingsKit';
import DataTable, { Column } from '@/components/ui/DataTable';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { settingsService } from '@/services/settingsService';
import type { AuditLog } from '@mercon/shared-types';

/** "ZATCA_PROFILE_SAVED" → "Zatca profile saved" — the raw code stays in the details dialog. */
function humanize(code: string) {
  const text = code.replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function actionTone(action: string): 'red' | 'green' | 'gray' {
  if (action.includes('DELETED') || action.includes('VOIDED') || action.includes('RESET')) return 'red';
  if (action.includes('CREATED') || action.includes('POSTED') || action.includes('ISSUED') || action.includes('APPROVED')) return 'green';
  return 'gray';
}

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

  const columns: Column<AuditLog>[] = [
    {
      header: 'When',
      accessor: (log) => <span className="text-muted-foreground whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</span>,
      mobilePriority: 'secondary',
    },
    {
      header: 'Who',
      accessor: (log) => (
        <span className="font-semibold text-foreground">
          {log.user?.name || log.user?.username || <span className="font-normal text-muted-foreground">System</span>}
        </span>
      ),
      mobilePriority: 'primary',
    },
    {
      header: 'What happened',
      accessor: (log) => (
        <span className="inline-flex items-center gap-2 text-foreground">
          <StatusDot tone={actionTone(log.action)} />
          {humanize(log.action)}
        </span>
      ),
      mobilePriority: 'primary',
    },
    {
      header: 'Record',
      accessor: (log) => (
        <span className="text-muted-foreground">
          {log.entityType}
          {log.entityId && /^[0-9a-f-]{32,}$/i.test(log.entityId) && <span className="ml-1.5 text-[11px]">#{log.entityId.slice(0, 8)}</span>}
        </span>
      ),
      mobilePriority: 'secondary',
    },
    {
      header: '',
      headerClassName: 'text-right',
      className: 'text-right',
      accessor: (log) => (
        <button onClick={() => setViewingLog(log)} className="text-xs font-bold text-brand hover:underline">
          Details
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
          <SelectValue placeholder="All records" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All records</SelectItem>
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
          <SelectValue placeholder="All actions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All actions</SelectItem>
          {availableActions.map((a) => (
            <SelectItem key={a} value={a}>
              {humanize(a)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <SettingsPage
      wide
      title="Audit log"
      description="Every sign-in, permission, finance and setup change, with who did it and when."
    >
        <DataTable<AuditLog>
                    columns={columns}
          data={logs}
          isLoading={isLoading}
          searchPlaceholder="Search action, record type or ID"
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
          emptyTitle="Nothing recorded yet"
          emptyMessage="Changes to users, finance and settings will appear here."
        />

        <Dialog open={!!viewingLog} onOpenChange={() => setViewingLog(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-foreground">
                {viewingLog && humanize(viewingLog.action)}
              </DialogTitle>
              {viewingLog && <p className="text-xs text-muted-foreground font-mono">{viewingLog.action}</p>}
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
                  <pre className="bg-charcoal text-slate-100 p-3 rounded-lg overflow-x-auto text-[11px] leading-relaxed">
                    {JSON.stringify(viewingLog.metadata || {}, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
    </SettingsPage>
  );
}
