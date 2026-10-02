import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Shield, Headset, Truck, KeyRound, MoreHorizontal, Search, UserX, UserCheck, Trash2, Pencil,
  ShieldCheck, ExternalLink, FileSpreadsheet, FileText, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import type { LucideIcon } from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import DataTable, { type Column } from '@/components/ui/DataTable';
import DriverAvatar from '@/components/ui/DriverAvatar';
import ConfirmModal from '@/components/ui/ConfirmModal';
import Btn from '@/components/ui/Btn';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { exportExcelTable, exportPDFTable } from '@/utils/exportUtils';
import { matchesSearch } from '@/lib/search';
import { cn } from '@/lib/utils';
import { authStore } from '@/store/authStore';
import { userService, type UserDTO } from '@/services/userService';
import { driverService, type Driver } from '@/services/driverService';
import UserFormSheet from './components/UserFormSheet';
import DriverPasswordModal from './components/DriverPasswordModal';

type Tab = 'team' | 'drivers';
type TeamFilter = 'all' | 'Admin' | 'Operator';
type DriverFilter = 'all' | 'no-password';

/** One colour per role, used for the stat tiles, chips and avatars. */
const ROLE_STYLE: Record<'Admin' | 'Operator' | 'Driver', { label: string; icon: LucideIcon; chip: string; avatar: string; dot: string }> = {
  Admin: {
    label: 'Admin', icon: Shield, dot: 'bg-[#7F77DD]',
    chip: 'bg-[#EEEDFE] text-[#3C3489] dark:bg-[#3C3489]/40 dark:text-[#CECBF6]',
    avatar: 'bg-[#EEEDFE] text-[#3C3489] dark:bg-[#3C3489]/50 dark:text-[#CECBF6]',
  },
  Operator: {
    label: 'Operator', icon: Headset, dot: 'bg-[#378ADD]',
    chip: 'bg-[#E6F1FB] text-[#0C447C] dark:bg-[#0C447C]/40 dark:text-[#B5D4F4]',
    avatar: 'bg-[#E6F1FB] text-[#0C447C] dark:bg-[#0C447C]/50 dark:text-[#B5D4F4]',
  },
  Driver: {
    label: 'Driver', icon: Truck, dot: 'bg-[#1D9E75]',
    chip: 'bg-[#E1F5EE] text-[#085041] dark:bg-[#085041]/40 dark:text-[#9FE1CB]',
    avatar: '',
  },
};

const staffRole = (u: UserDTO): 'Admin' | 'Operator' => (u.role === 'Admin' || u.role === 'SuperAdmin' ? 'Admin' : 'Operator');
const driverName = (d: Driver) => `${d.first_name || ''} ${d.last_name || ''}`.trim() || 'Unnamed driver';
const isDriverActive = (d: Driver) => d.isActive && d.status !== 'Inactive';
const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

function RoleChip({ role }: { role: keyof typeof ROLE_STYLE }) {
  const s = ROLE_STYLE[role];
  return (
    <span className={cn('inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-semibold', s.chip)}>
      <s.icon size={12} /> {s.label}
    </span>
  );
}

function StatusChip({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-[11px] font-semibold',
        active ? 'bg-[#EAF3DE] text-[#27500A] dark:bg-[#27500A]/40 dark:text-[#C0DD97]' : 'bg-muted text-muted-foreground',
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', active ? 'bg-[#639922]' : 'bg-[#888780]')} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function StatTile({ label, value, dot, active, onClick }: { label: string; value: number; dot: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'text-left rounded-xl border px-4 py-3 transition-colors',
        active ? 'border-[#FA634E] bg-[#FA634E]/[0.04] ring-1 ring-[#FA634E]/40' : 'border-border bg-card hover:border-foreground/20',
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span className={cn('w-2 h-2 rounded-full', dot)} /> {label}
      </span>
      <span className="block mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</span>
    </button>
  );
}

const menuItemCls = 'cursor-pointer gap-2 text-[13px]';

export default function UserManagementPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const currentUser = authStore.getUser();
  const isSuperAdmin = Boolean(currentUser?.isSuperAdmin || currentUser?.role === 'SuperAdmin');

  const [tab, setTab] = useState<Tab>('team');
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState<TeamFilter>('all');
  const [driverFilter, setDriverFilter] = useState<DriverFilter>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserDTO | null>(null);
  const [passwordDriver, setPasswordDriver] = useState<Driver | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'toggle'; user: UserDTO } | null>(null);

  const usersQuery = useQuery({ queryKey: ['users'], queryFn: userService.getUsers });
  const driversQuery = useQuery({
    queryKey: ['drivers', 'for-user-management'],
    queryFn: () => driverService.getAll({ per_page: 5000 }),
  });

  // Team = dashboard / operator-app logins. The API already leaves out drivers; the role check is a backstop.
  const team = useMemo(
    () => (usersQuery.data ?? []).filter((u) => u.role !== 'Driver' && (isSuperAdmin || (!u.isSuperAdmin && u.role !== 'SuperAdmin'))),
    [usersQuery.data, isSuperAdmin],
  );
  const drivers: Driver[] = useMemo(() => driversQuery.data?.data ?? [], [driversQuery.data]);

  const counts = useMemo(() => ({
    admins: team.filter((u) => staffRole(u) === 'Admin').length,
    operators: team.filter((u) => staffRole(u) === 'Operator').length,
    drivers: drivers.length,
    noPassword: drivers.filter((d) => !d.hasAccountPassword).length,
  }), [team, drivers]);

  const teamRows = useMemo(
    () => team.filter((u) =>
      (teamFilter === 'all' || staffRole(u) === teamFilter) &&
      (!search || matchesSearch(search, [u.name, u.username, u.phone, u.email]))),
    [team, teamFilter, search],
  );
  const driverRows = useMemo(
    () => drivers.filter((d) =>
      (driverFilter === 'all' || !d.hasAccountPassword) &&
      (!search || matchesSearch(search, [driverName(d), d.ref_id, d.phone_primary]))),
    [drivers, driverFilter, search],
  );

  // ── Mutations ──────────────────────────────────────────────────────────
  const errMsg = (err: any, fallback: string) => err?.response?.data?.error?.message || fallback;
  const refreshUsers = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const saveMutation = useMutation({
    mutationFn: (data: Partial<UserDTO> & { password?: string }) =>
      editingUser ? userService.updateUser(editingUser.id, data) : userService.createUser(data),
    onSuccess: () => {
      refreshUsers();
      toast.success(editingUser ? 'User updated' : 'User created');
      setFormOpen(false);
    },
    onError: (err) => toast.error(errMsg(err, 'Could not save the user')),
  });

  const statusMutation = useMutation({
    mutationFn: (u: UserDTO) => userService.updateUser(u.id, { status: u.status === 'Inactive' ? 'Active' : 'Inactive' }),
    onSuccess: (_, u) => {
      refreshUsers();
      toast.success(u.status === 'Inactive' ? `${u.name} activated` : `${u.name} deactivated`);
      setConfirm(null);
    },
    onError: (err) => toast.error(errMsg(err, 'Could not change the status')),
  });

  const deleteMutation = useMutation({
    mutationFn: (u: UserDTO) => userService.deleteUser(u.id),
    onSuccess: (_, u) => {
      refreshUsers();
      toast.success(`${u.name} deleted`);
      setConfirm(null);
    },
    onError: (err) => toast.error(errMsg(err, 'Could not delete the user')),
  });

  const driverPasswordMutation = useMutation({
    mutationFn: ({ driverId, password }: { driverId: string; password: string }) => driverService.setDriverPassword(driverId, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers', 'for-user-management'] });
      toast.success('Driver app password saved');
      setPasswordDriver(null);
    },
    onError: (err) => toast.error(errMsg(err, 'Could not set the password')),
  });

  const openForm = (u: UserDTO | null) => {
    if (u?.isSuperAdmin && !isSuperAdmin) return toast.error('Only a super admin can edit this account');
    setEditingUser(u);
    setFormOpen(true);
  };

  const exportRows = (format: 'excel' | 'pdf') => {
    const isTeam = tab === 'team';
    const headers = isTeam ? ['Name', 'Username', 'Phone', 'Role', 'Status', 'Added'] : ['Name', 'Driver ID', 'Phone', 'Role', 'App password', 'Status'];
    const rows = isTeam
      ? teamRows.map((u) => [u.name || '', u.username, u.phone || '', staffRole(u), u.status || 'Active', fmtDate(u.createdAt)])
      : driverRows.map((d) => [driverName(d), d.ref_id || '', d.phone_primary || '', 'Driver', d.hasAccountPassword ? 'Set' : 'Not set', isDriverActive(d) ? 'Active' : 'Inactive']);
    if (!rows.length) return;
    const title = isTeam ? 'Team users' : 'Driver accounts';
    const file = `${isTeam ? 'team_users' : 'driver_accounts'}_${new Date().toISOString().slice(0, 10)}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
    (format === 'excel' ? exportExcelTable : exportPDFTable)(title, headers, rows, file);
  };

  // ── Columns ────────────────────────────────────────────────────────────
  const teamColumns: Column<UserDTO>[] = [
    {
      header: 'Name',
      mobilePriority: 'primary',
      accessor: (u) => {
        const role = staffRole(u);
        const inactive = u.status === 'Inactive';
        const initials = (u.name || u.username).split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
        return (
          <div className={cn('flex items-center gap-3 min-w-0', inactive && 'opacity-60')}>
            <span className={cn('w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold', ROLE_STYLE[role].avatar)}>{initials}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold text-foreground truncate">{u.name || u.username}</span>
                {u.isSuperAdmin && (
                  <span title="Aprodac super admin" className="inline-flex items-center text-[#92400E] dark:text-amber-300"><ShieldCheck size={13} /></span>
                )}
                {u.id === currentUser?.id && <span className="text-[10px] font-semibold text-muted-foreground border border-border rounded px-1">You</span>}
              </div>
              <span className="block text-xs text-muted-foreground truncate">@{u.username}</span>
            </div>
          </div>
        );
      },
    },
    { header: 'Phone', mobilePriority: 'secondary', accessor: (u) => <span className="text-[13px] tabular-nums text-foreground/90">{u.phone || '—'}</span> },
    { header: 'Role', mobilePriority: 'meta', accessor: (u) => <RoleChip role={staffRole(u)} /> },
    { header: 'Status', accessor: (u) => <StatusChip active={u.status !== 'Inactive'} /> },
    { header: 'Added', accessor: (u) => <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(u.createdAt)}</span> },
    {
      header: '',
      className: 'text-right w-12',
      accessor: (u) => {
        const locked = Boolean(u.isSuperAdmin) && !isSuperAdmin;
        const isSelf = u.id === currentUser?.id;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Actions for ${u.name}`} onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem disabled={locked} onClick={() => openForm(u)} className={menuItemCls}>
                <Pencil size={14} /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem disabled={locked || isSelf} onClick={() => setConfirm({ kind: 'toggle', user: u })} className={menuItemCls}>
                {u.status === 'Inactive' ? <><UserCheck size={14} className="text-emerald-600" /> Activate</> : <><UserX size={14} className="text-amber-600" /> Deactivate</>}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={locked || isSelf} onClick={() => setConfirm({ kind: 'delete', user: u })} className={cn(menuItemCls, 'text-rose-600 focus:text-rose-700')}>
                <Trash2 size={14} /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const driverColumns: Column<Driver>[] = [
    {
      header: 'Name',
      mobilePriority: 'primary',
      accessor: (d) => (
        <div className={cn('flex items-center gap-3 min-w-0', !isDriverActive(d) && 'opacity-60')}>
          <DriverAvatar src={d.avatar_url} firstName={d.first_name} lastName={d.last_name} size="sm" />
          <div className="min-w-0">
            <span className="block text-[13px] font-semibold text-foreground truncate">{driverName(d)}</span>
            <span className="block text-xs text-muted-foreground truncate">{d.ref_id || '—'}</span>
          </div>
        </div>
      ),
    },
    { header: 'Phone', mobilePriority: 'secondary', accessor: (d) => <span className="text-[13px] tabular-nums text-foreground/90">{d.phone_primary || '—'}</span> },
    { header: 'Role', mobilePriority: 'meta', accessor: () => <RoleChip role="Driver" /> },
    {
      header: 'App access',
      accessor: (d) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setPasswordDriver(d); }}
          className={cn(
            'inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-[11px] font-semibold transition-colors',
            d.hasAccountPassword
              ? 'bg-[#E1F5EE] text-[#085041] hover:bg-[#9FE1CB]/60 dark:bg-[#085041]/40 dark:text-[#9FE1CB]'
              : 'bg-[#FAEEDA] text-[#633806] hover:bg-[#FAC775]/60 dark:bg-[#633806]/40 dark:text-[#FAC775]',
          )}
        >
          <KeyRound size={12} /> {d.hasAccountPassword ? 'Ready' : 'Set password'}
        </button>
      ),
    },
    { header: 'Status', accessor: (d) => <StatusChip active={isDriverActive(d)} /> },
    {
      header: '',
      className: 'text-right w-12',
      accessor: (d) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Actions for ${driverName(d)}`} onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => setPasswordDriver(d)} className={menuItemCls}>
              <KeyRound size={14} /> {d.hasAccountPassword ? 'Change app password' : 'Set app password'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`/drivers/${d.id}`)} className={menuItemCls}>
              <ExternalLink size={14} /> Open driver profile
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const tabs: { id: Tab; label: string; icon: LucideIcon; count: number }[] = [
    { id: 'team', label: 'Team', icon: Users, count: team.length },
    { id: 'drivers', label: 'Drivers', icon: Truck, count: drivers.length },
  ];

  const pickTile = (next: Tab, apply: () => void) => {
    setTab(next);
    apply();
  };

  const filterBar = (
    <div className="relative w-full sm:w-72">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={tab === 'team' ? 'Search name, username or phone' : 'Search name, ID or phone'}
        className="w-full h-9 pl-8 pr-3 text-[13px] rounded-lg border border-input bg-background outline-none focus:border-foreground/30 focus:ring-2 focus:ring-ring/20"
      />
    </div>
  );

  const bulkActions = [
    { label: 'Excel', icon: <FileSpreadsheet size={13} className="text-emerald-600" />, variant: 'secondary' as const, onClick: () => exportRows('excel') },
    { label: 'PDF', icon: <FileText size={13} className="text-rose-600" />, variant: 'secondary' as const, onClick: () => exportRows('pdf') },
  ];

  const confirmUser = confirm?.user;
  const confirmIsDelete = confirm?.kind === 'delete';
  const confirmActivates = confirmUser?.status === 'Inactive';

  return (
    <DashboardLayout active="Users" title="Users">
      <div className="w-full px-4 sm:px-6 pt-5 pb-8 space-y-4 animate-fade-in">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-lg bg-[#EEEDFE] text-[#534AB7] dark:bg-[#3C3489]/40 dark:text-[#CECBF6] flex items-center justify-center">
              <Users size={18} />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Users</h1>
          </div>
          {tab === 'team' ? (
            <Btn label="Add user" icon={<Plus size={14} />} onClick={() => openForm(null)} />
          ) : (
            <Btn label="Add driver" variant="outline" icon={<Plus size={14} />} onClick={() => navigate('/drivers/new')} />
          )}
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="Admins" value={counts.admins} dot={ROLE_STYLE.Admin.dot}
            active={tab === 'team' && teamFilter === 'Admin'}
            onClick={() => pickTile('team', () => setTeamFilter(teamFilter === 'Admin' ? 'all' : 'Admin'))} />
          <StatTile label="Operators" value={counts.operators} dot={ROLE_STYLE.Operator.dot}
            active={tab === 'team' && teamFilter === 'Operator'}
            onClick={() => pickTile('team', () => setTeamFilter(teamFilter === 'Operator' ? 'all' : 'Operator'))} />
          <StatTile label="Drivers" value={counts.drivers} dot={ROLE_STYLE.Driver.dot}
            active={tab === 'drivers' && driverFilter === 'all'}
            onClick={() => pickTile('drivers', () => setDriverFilter('all'))} />
          <StatTile label="No app password" value={counts.noPassword} dot="bg-[#EF9F27]"
            active={tab === 'drivers' && driverFilter === 'no-password'}
            onClick={() => pickTile('drivers', () => setDriverFilter(driverFilter === 'no-password' ? 'all' : 'no-password'))} />
        </div>

        <div role="tablist" aria-label="Account type" className="flex items-center gap-6 border-b border-border">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cn(
                  '-mb-px inline-flex items-center gap-2 h-10 border-b-2 text-sm font-medium transition-colors',
                  active ? 'border-[#FA634E] text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <t.icon size={15} />
                {t.label}
                <span className={cn('min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold tabular-nums inline-flex items-center justify-center', active ? 'bg-[#FA634E]/10 text-[#C2412D]' : 'bg-muted text-muted-foreground')}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        {tab === 'team' ? (
          <DataTable
            key="team"
            columns={teamColumns}
            data={teamRows}
            getRowId={(u) => u.id}
            onRowClick={(u) => openForm(u)}
            rowClassName={(u) => (u.status === 'Inactive' ? 'bg-muted/30' : '')}
            pageSize={15}
            pageSizeOptions={[15, 30, 60]}
            compact
            isLoading={usersQuery.isLoading}
            isError={usersQuery.isError}
            errorMessage={(usersQuery.error as Error)?.message || "Couldn't load users"}
            emptyTitle={search || teamFilter !== 'all' ? 'No matches' : 'No team members yet'}
            filterElement={filterBar}
            enableSelection
            bulkActions={bulkActions}
          />
        ) : (
          <DataTable
            key="drivers"
            columns={driverColumns}
            data={driverRows}
            getRowId={(d) => d.id}
            onRowClick={(d) => navigate(`/drivers/${d.id}`)}
            rowClassName={(d) => (!isDriverActive(d) ? 'bg-muted/30' : '')}
            pageSize={15}
            pageSizeOptions={[15, 30, 60]}
            compact
            isLoading={driversQuery.isLoading}
            isError={driversQuery.isError}
            errorMessage={(driversQuery.error as Error)?.message || "Couldn't load drivers"}
            emptyTitle={search || driverFilter !== 'all' ? 'No matches' : 'No drivers yet'}
            filterElement={filterBar}
            enableSelection
            bulkActions={bulkActions}
          />
        )}
      </div>

      <UserFormSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={(data) => saveMutation.mutate(data)}
        user={editingUser}
        saving={saveMutation.isPending}
        canManageSuperAdmin={isSuperAdmin}
      />

      <DriverPasswordModal
        isOpen={Boolean(passwordDriver)}
        onClose={() => setPasswordDriver(null)}
        driver={passwordDriver}
        onSave={(driverId, password) => driverPasswordMutation.mutate({ driverId, password })}
        isLoading={driverPasswordMutation.isPending}
      />

      <ConfirmModal
        isOpen={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirmUser && (confirmIsDelete ? deleteMutation.mutate(confirmUser) : statusMutation.mutate(confirmUser))}
        title={confirmIsDelete ? `Delete ${confirmUser?.name}?` : `${confirmActivates ? 'Activate' : 'Deactivate'} ${confirmUser?.name}?`}
        description={confirmIsDelete ? "This can't be undone." : confirmActivates ? 'They can sign in again.' : "They won't be able to sign in."}
        confirmLabel={confirmIsDelete ? 'Delete' : confirmActivates ? 'Activate' : 'Deactivate'}
        isDestructive={confirmIsDelete || !confirmActivates}
        isLoading={deleteMutation.isPending || statusMutation.isPending}
      />
    </DashboardLayout>
  );
}
