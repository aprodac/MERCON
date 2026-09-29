import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';

import { SettingsPage, StatusDot } from '@/components/settings/SettingsKit';
import DataTable, { Column } from '@/components/ui/DataTable';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { errorConsoleService, ErrorEvent } from '@/services/errorConsoleService';

export const ERROR_STATUS_TONE: Record<ErrorEvent['status'], 'red' | 'amber' | 'green'> = {
  New: 'red',
  Acknowledged: 'amber',
  Resolved: 'green',
};

const SOURCE_LABEL: Record<string, string> = { api: 'Backend', web: 'Web' };

export default function ErrorConsolePage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>('all');
  const [source, setSource] = useState<string>('all');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['error-events', status, source, page],
    queryFn: () =>
      errorConsoleService.getAll({
        page,
        per_page: pageSize,
        status: status === 'all' ? undefined : status,
        source: source === 'all' ? undefined : source,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 30000,
  });

  const events = data?.data ?? [];

  const columns: Column<ErrorEvent>[] = [
    {
      header: 'Status',
      accessor: (row) => (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <StatusDot tone={ERROR_STATUS_TONE[row.status]} />
          {row.status}
        </span>
      ),
    },
    {
      header: 'Error',
      accessor: (row) => (
        <div className="min-w-0 max-w-[520px]">
          <p className="font-semibold text-foreground truncate">{row.message}</p>
          <p className="text-xs text-muted-foreground truncate">
            {row.code}
            {row.route ? ` · ${row.route}` : ''}
          </p>
        </div>
      ),
    },
    { header: 'Where', accessor: (row) => <span className="text-muted-foreground">{SOURCE_LABEL[row.source] ?? row.source}</span> },
    { header: 'Times', accessor: (row) => <span className="font-semibold">{row.count}</span> },
    { header: 'Last seen', accessor: (row) => <span className="text-muted-foreground whitespace-nowrap">{new Date(row.updatedAt).toLocaleString()}</span> },
  ];

  return (
    <SettingsPage
      wide
      title="Error console"
      description="Errors the app and API caught, grouped by type. Open one to see the details and mark it acknowledged or resolved."
    >

        <DataTable
          columns={columns}
          data={events}
          compact={true}
          isLoading={isLoading}
          isError={isError}
          errorMessage="Failed to load error events."
          emptyTitle="No errors recorded"
          emptyMessage="Nothing has been captured yet — that's a good sign."
          currentPage={page}
          onPageChange={setPage}
          pageSize={pageSize}
          totalRecords={data?.meta?.total ?? events.length}
          totalPages={data?.meta?.total_pages ?? 1}
          onRowClick={(row) => navigate(`/settings/error-console/${row.id}`)}
          filterElement={
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="New">New</SelectItem>
                  <SelectItem value="Acknowledged">Acknowledged</SelectItem>
                  <SelectItem value="Resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
              <Select value={source} onValueChange={(v) => { setSource(v); setPage(1); }}>
                <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="Source" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="api">Backend</SelectItem>
                  <SelectItem value="web">Web</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        />
    </SettingsPage>
  );
}
