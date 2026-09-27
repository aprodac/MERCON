import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { SettingsPage, SettingsSection, StatusDot } from '@/components/settings/SettingsKit';
import Btn from '@/components/ui/Btn';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { errorConsoleService, ErrorEvent } from '@/services/errorConsoleService';
import { ERROR_STATUS_TONE } from './ErrorConsolePage';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[#9898A4]">{label}</span>
      <span className="text-sm text-foreground break-all">{value}</span>
    </div>
  );
}

export default function ErrorEventDetailPage() {
  const { id } = useParams<{ id: string }>();
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
      <SettingsPage title="Error" description="Loading…">
        {null}
      </SettingsPage>
    );
  }

  if (isError || !event) {
    return (
      <SettingsPage title="Error not found" description="This error event could not be loaded. It may have been deleted.">
        {null}
      </SettingsPage>
    );
  }

  const longMessage = event.message.length > 90;

  return (
    <SettingsPage
      title={longMessage ? `${event.message.slice(0, 90)}…` : event.message}
      description={
        <span className="inline-flex items-center gap-2">
          <StatusDot tone={ERROR_STATUS_TONE[event.status]} />
          {event.code} · {event.status} · {event.source === 'api' ? 'Backend' : event.source === 'web' ? 'Web' : event.source} · seen {event.count} {event.count === 1 ? 'time' : 'times'}
        </span>
      }
      actions={
        <Select value={event.status} onValueChange={(v) => updateMutation.mutate({ status: v as ErrorEvent['status'], notes })}>
          <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="New">New</SelectItem>
            <SelectItem value="Acknowledged">Acknowledged</SelectItem>
            <SelectItem value="Resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
      }
    >
      {longMessage && (
        <SettingsSection title="Message">
          <p className="text-sm text-foreground break-words">{event.message}</p>
        </SettingsSection>
      )}

      <SettingsSection title="Details">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
          <Field label="Route" value={event.route || '—'} />
          <Field label="First seen" value={new Date(event.createdAt).toLocaleString()} />
          <Field label="Last seen" value={new Date(event.updatedAt).toLocaleString()} />
          <Field label="Last request ID" value={event.lastRequestId ?? '—'} />
          <Field label="First user ID" value={event.firstUserId ?? '—'} />
        </div>
      </SettingsSection>

      {event.stack && (
        <SettingsSection title="Stack trace">
          <pre className="text-xs whitespace-pre-wrap break-all bg-muted/60 rounded-xl p-3 max-h-96 overflow-y-auto">{event.stack}</pre>
        </SettingsSection>
      )}

      <SettingsSection
        title="Notes"
        description="Root cause and fix, for whoever sees this next."
        action={<Btn label="Save notes" size="sm" isLoading={updateMutation.isPending} disabled={notes === (event.notes ?? '')} onClick={() => updateMutation.mutate({ status: event.status, notes })} />}
      >
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What went wrong and how it was fixed" rows={4} />
      </SettingsSection>
    </SettingsPage>
  );
}
