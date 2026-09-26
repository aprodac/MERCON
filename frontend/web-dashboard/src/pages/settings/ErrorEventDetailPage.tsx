import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { errorConsoleService, ErrorEvent } from '@/services/errorConsoleService';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-sm text-slate-800 dark:text-slate-200 break-all">{value}</span>
    </div>
  );
}

export default function ErrorEventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['error-events', id],
    queryFn: () => errorConsoleService.getById(id as string),
    enabled: !!id,
  });

  const event = data?.data;

  useEffect(() => {
    setNotes(event?.notes ?? '');
  }, [event?.id]);

  const updateMutation = useMutation({
    mutationFn: (payload: { status: ErrorEvent['status']; notes?: string }) =>
      errorConsoleService.updateStatus(id as string, payload),
    onSuccess: () => {
      toast.success('Error event updated');
      queryClient.invalidateQueries({ queryKey: ['error-events'] });
      refetch();
    },
    onError: () => toast.error('Failed to update error event'),
  });

  if (isLoading) {
    return (
      <DashboardLayout active="Settings" title="Error Console">
        <div className="p-6">Loading…</div>
      </DashboardLayout>
    );
  }

  if (isError || !event) {
    return (
      <DashboardLayout active="Settings" title="Error Console">
        <div className="p-6 flex flex-col items-start gap-3">
          <p className="text-sm text-slate-500">This error event could not be loaded.</p>
          <Button variant="outline" size="sm" onClick={() => navigate('/settings/error-console')}>
            Back to Error Console
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout active="Settings" title="Error Console">
      <div className="p-6 max-w-[1100px] mx-auto w-full flex flex-col gap-5 bg-slate-50/50 dark:bg-slate-950">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate('/settings/error-console')}>
              Back
            </Button>
            <h1 className="text-xl font-black text-[#3E3C3D] dark:text-white tracking-tight">
              {event.code}
            </h1>
            <Badge variant="outline">{event.source}</Badge>
          </div>
          <Select
            value={event.status}
            onValueChange={(v) => updateMutation.mutate({ status: v as ErrorEvent['status'], notes })}
          >
            <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="New">New</SelectItem>
              <SelectItem value="Acknowledged">Acknowledged</SelectItem>
              <SelectItem value="Resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{event.message}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <Field label="Occurrences" value={event.count} />
          <Field label="Route" value={event.route} />
          <Field label="First Seen" value={new Date(event.createdAt).toLocaleString()} />
          <Field label="Last Seen" value={new Date(event.updatedAt).toLocaleString()} />
          <Field label="Last Request ID" value={event.lastRequestId ?? '—'} />
          <Field label="First User ID" value={event.firstUserId ?? '—'} />
        </div>

        {event.stack && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Stack Trace</span>
            <pre className="mt-2 text-xs whitespace-pre-wrap break-all bg-slate-50 dark:bg-slate-950 rounded-lg p-3 border border-slate-100 dark:border-slate-800 max-h-96 overflow-y-auto">
              {event.stack}
            </pre>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Notes</span>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What's the root cause? What's the fix?"
            rows={4}
          />
          <div>
            <Button
              size="sm"
              onClick={() => updateMutation.mutate({ status: event.status, notes })}
              disabled={updateMutation.isPending}
            >
              Save Notes
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
