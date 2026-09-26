import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';

import DashboardLayout from '@/components/layout/DashboardLayout';
import DataTable, { Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { errorConsoleService, ErrorEvent } from '@/services/errorConsoleService';

const STATUS_BADGE: Record<ErrorEvent['status'], string> = {
  New: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900',
  Acknowledged: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900',
  Resolved: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900',
};

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
        <Badge variant="outline" className={STATUS_BADGE[row.status]}>
          {row.status}
        </Badge>
      ),
    },
    {
      header: 'Message',
      accessor: (row) => <span className="font-medium">{row.message.slice(0, 120)}</span>,
    },
    { header: 'Code', accessor: (row) => <span className="font-mono text-xs">{row.code}</span> },
    { header: 'Route', accessor: (row) => <span className="font-mono text-xs">{row.route}</span> },
    { header: 'Source', accessor: (row) => row.source },
    { header: 'Count', accessor: (row) => row.count },
    { header: 'Last Seen', accessor: (row) => new Date(row.updatedAt).toLocaleString() },
  ];

  return (
    <DashboardLayout active="Settings" title="Error Console">
      <div className="p-6 max-w-[1600px] mx-auto w-full flex flex-col gap-5 bg-slate-50/50 dark:bg-slate-950">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-2xl font-black text-[#3E3C3D] dark:text-white tracking-tight">Error Console</h1>
        </div>

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
      </div>
    </DashboardLayout>
  );
}
