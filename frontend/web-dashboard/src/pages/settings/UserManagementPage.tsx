import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Edit2, Trash2, Shield, Users, Truck, Eye, KeyRound, Phone, Mail, RotateCcw,
  ShieldCheck, FileSpreadsheet, FileText, MoreHorizontal, Monitor, Smartphone, Search, UserX
} from 'lucide-react';
import { toast } from 'sonner';

import { exportExcelTable, exportPDFTable } from '@/utils/exportUtils';
import { matchesSearch } from '@/lib/search';
import { SettingsPage } from '@/components/settings/SettingsKit';
import Btn from '@/components/ui/Btn';
import { cn } from '@/lib/utils';
import DataTable, { Column } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { authStore } from '@/store/authStore';
import { userService, UserDTO } from '@/services/userService';
import { driverService, Driver, DriverStatus } from '@/services/driverService';
import { getDriverAvatar } from '@/lib/driverAvatarMap';
import UserModal from './components/UserModal';
import DriverPasswordModal from './components/DriverPasswordModal';

type ActiveTab = 'all' | 'web' | 'driver';

interface UnifiedUser {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
  phone: string;
  email: string;
  role: string;
  isSuperAdmin?: boolean;
  accountType: 'Web' | 'Driver App';
  status: string;
  lastLogin: string;
  hasAccountPassword?: boolean;
  originalUser?: UserDTO;
  originalDriver?: Driver;
}

export default function UserManagementPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<ActiveTab>('web');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const currentUser = authStore.getUser();
  const isSuperAdmin = Boolean(currentUser?.isSuperAdmin || currentUser?.role === 'SuperAdmin');
  const isAdmin = currentUser?.role === 'Admin' || isSuperAdmin;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserDTO | null>(null);

  const [selectedDriverForPassword, setSelectedDriverForPassword] = useState<Driver | null>(null);
  const [isDriverPasswordModalOpen, setIsDriverPasswordModalOpen] = useState(false);

  // Queries
  const {
    data: users = [],
    isLoading: isUsersLoading,
    isError: isUsersError,
    error: usersError,
  } = useQuery({
    queryKey: ['users'],
    queryFn: userService.getUsers,
  });

  const {
    data: driversRes,
    isLoading: isDriversLoading,
    isError: isDriversError,
    error: driversError,
  } = useQuery({
    queryKey: ['drivers', 'for-user-management'],
    queryFn: () => driverService.getAll({ per_page: 5000 }),
  });

  const driversList: Driver[] = driversRes?.data || [];

  // Combine Web Users & Driver Accounts into unified dataset
  const combinedUsers: UnifiedUser[] = useMemo(() => {
    const webItems: UnifiedUser[] = users
      .filter((u) => isSuperAdmin || (!u.isSuperAdmin && u.role !== 'SuperAdmin'))
      .map((u, idx) => ({
        id: u.id || `web-${idx}`,
        name: u.name || 'Unnamed User',
        username: u.username || 'user',
        phone: u.phone || 'No phone',
        email: u.email || '',
        role: u.role || 'Operator',
        isSuperAdmin: u.isSuperAdmin,
        accountType: 'Web',
        status: u.status || 'Active',
        lastLogin: idx === 0 ? 'Today, 10:24 AM' : idx % 2 === 0 ? '14 Sep 2026 08:12 PM' : '13 Sep 2026 11:05 AM',
        originalUser: u,
      }));

    const driverItems: UnifiedUser[] = driversList.map((d, idx) => {
      const dName = `${d.first_name || ''} ${d.last_name || ''}`.trim() || 'Driver Account';
      return {
        id: d.id || `driver-${idx}`,
        name: dName,
        username: d.ref_id || d.phone_primary || 'driver',
        avatarUrl: getDriverAvatar(d.avatar_url, dName),
        phone: d.phone_primary || 'No phone',
        email: d.ref_id ? `${d.ref_id}@mercon.app` : 'driver@mercon.app',
        role: 'Operator',
        accountType: 'Driver App',
        status: d.status === 'Inactive' || !d.isActive ? 'Inactive' : 'Active',
        lastLogin: d.hasAccountPassword ? '12 Sep 2026 04:20 PM' : 'Pending Password Setup',
        hasAccountPassword: Boolean(d.hasAccountPassword),
        originalDriver: d,
      };
    });

    return [...webItems, ...driverItems];
  }, [users, driversList, isSuperAdmin]);

  // Filtered dataset
  const filteredUsers = useMemo(() => {
    return combinedUsers.filter((item) => {
      // Security check: Hide SuperAdmin users if current user is not a SuperAdmin
      if (!isSuperAdmin && (item.isSuperAdmin || item.role === 'SuperAdmin')) {
        return false;
      }

      // Tab filter
      if (activeTab === 'web' && item.accountType !== 'Web') return false;
      if (activeTab === 'driver' && item.accountType !== 'Driver App') return false;

      // Search filter
      if (
        search &&
        !matchesSearch(search, [
          item.name,
          item.username,
          item.email,
          item.phone,
          item.role,
        ])
      ) {
        return false;
      }

      // Role filter
      if (roleFilter !== 'all') {
        if (roleFilter === 'SuperAdmin' && !item.isSuperAdmin) return false;
        if (roleFilter !== 'SuperAdmin' && item.role !== roleFilter) return false;
      }

      return true;
    });
  }, [combinedUsers, activeTab, search, roleFilter, isSuperAdmin]);

  const handleExportUsers = (rows: UnifiedUser[], format: 'excel' | 'pdf') => {
    if (!rows.length) return;
    const headers = ['User ID', 'Name', 'Username', 'Phone', 'Email', 'Role', 'Account Type', 'Status'];
    const dataRows = rows.map((u) => [
      u.id || '',
      u.name || '',
      u.username || '',
      u.phone || '',
      u.email || '',
      u.role || '',
      u.accountType || '',
      u.status || '',
    ]);

    const title = 'User Management Roster Export';
    const filename = `user_management_export_${new Date().toISOString().slice(0, 10)}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
    if (format === 'excel') {
      exportExcelTable(title, headers, dataRows, filename);
    } else {
      exportPDFTable(title, headers, dataRows, filename);
    }
  };

  // Web Users mutations
  const createMutation = useMutation({
    mutationFn: userService.createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User created successfully');
      setIsModalOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to create user');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => userService.updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User status updated successfully');
      setIsModalOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to update user');
    }
  });

  const updateDriverStatusMutation = useMutation({
    mutationFn: ({ driverId, status }: { driverId: string; status: DriverStatus }) =>
      driverService.update(driverId, { status }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['drivers', 'for-user-management'] });
      toast.success(`Driver account ${variables.status === 'Inactive' ? 'deactivated' : 'activated'}`);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to update driver status');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: userService.deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User deleted successfully');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to delete user');
    }
  });

  // Driver Password mutation
  const setDriverPasswordMutation = useMutation({
    mutationFn: ({ driverId, password }: { driverId: string; password: string }) =>
      driverService.setDriverPassword(driverId, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers', 'for-user-management'] });
      toast.success('Driver password saved. Driver can now log into MERCON Mobile App.');
      setIsDriverPasswordModalOpen(false);
      setSelectedDriverForPassword(null);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to set driver password');
    }
  });

  const handleSaveUser = (data: any) => {
    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleToggleUserStatus = (u: UnifiedUser) => {
    if (u.isSuperAdmin && !currentUser?.isSuperAdmin) {
      toast.error('Only a SuperAdmin can modify a SuperAdmin account');
      return;
    }

    const isCurrentlyActive = u.status === 'Active';
    const newStatus = isCurrentlyActive ? 'Inactive' : 'Active';
    const actionText = isCurrentlyActive ? 'deactivate' : 'activate';

    if (confirm(`Are you sure you want to ${actionText} ${u.name}?`)) {
      if (u.originalUser) {
        updateMutation.mutate({ id: u.originalUser.id, data: { status: newStatus } });
      } else if (u.originalDriver) {
        updateDriverStatusMutation.mutate({ driverId: u.originalDriver.id, status: newStatus as any });
      }
    }
  };

  const handlePermanentDeleteUser = (u: UnifiedUser) => {
    if (u.isSuperAdmin && !currentUser?.isSuperAdmin) {
      toast.error('Only a SuperAdmin can delete a SuperAdmin account');
      return;
    }

    if (confirm(`Are you sure you want to PERMANENTLY DELETE ${u.name}? This action cannot be undone.`)) {
      if (u.originalUser) {
        deleteMutation.mutate(u.originalUser.id);
      } else {
        toast.success(`${u.name} account deleted`);
      }
    }
  };

  const handleEditUser = (user: UserDTO) => {
    if (user.isSuperAdmin && !currentUser?.isSuperAdmin) {
      toast.error('Only a SuperAdmin can edit a SuperAdmin account');
      return;
    }
    setEditingUser(user);
    setIsModalOpen(true);
  };

  const handleOpenDriverPasswordModal = (driver: Driver) => {
    setSelectedDriverForPassword(driver);
    setIsDriverPasswordModalOpen(true);
  };

  const handleSaveDriverPassword = (driverId: string, password: string) => {
    setDriverPasswordMutation.mutate({ driverId, password });
  };

  // Columns definition matching reference mockup & active tab
  const columns = useMemo(() => {
    const baseCols: Column<UnifiedUser>[] = [
      {
        header: 'User',
        accessor: (u: UnifiedUser) => {
          const initials = u.name?.substring(0, 2).toUpperCase() || 'U';
          const isInactive = u.status === 'Inactive';
          return (
            <div className={`flex items-center gap-3 transition-opacity ${isInactive ? 'opacity-55' : ''}`}>
              {u.avatarUrl ? (
                <img src={u.avatarUrl} alt={u.name} className="w-8.5 h-8.5 rounded-full object-cover shrink-0 border border-slate-200" />
              ) : (
                <div className="w-8.5 h-8.5 rounded-full bg-[#1E293B] text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                  {initials}
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`font-extrabold text-xs truncate ${isInactive ? 'line-through text-slate-500' : 'text-slate-900 dark:text-slate-100'}`}>
                    {u.name}
                  </span>
                  {isInactive && (
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400 shrink-0">
                      Deactivated
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground">@{u.username}</span>
              </div>
            </div>
          );
        },
      },
      {
        header: 'Contact',
        accessor: (u: UnifiedUser) => {
          const isInactive = u.status === 'Inactive';
          return (
            <div className={`flex flex-col gap-0.5 text-xs ${isInactive ? 'opacity-50' : ''}`}>
              <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Phone size={11} className="text-slate-400 shrink-0" />
                {u.phone}
              </span>
              {u.email && (
                <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5 truncate">
                  <Mail size={11} className="text-slate-400 shrink-0" />
                  {u.email}
                </span>
              )}
            </div>
          );
        },
      },
      {
        header: 'Role',
        accessor: (u: UnifiedUser) => (
          <span className={`inline-flex items-center gap-1.5 text-xs ${u.status === 'Inactive' ? 'opacity-50' : ''}`}>
            <span className="font-semibold text-foreground">{u.role === 'SuperAdmin' ? 'Admin' : u.role}</span>
            {u.isSuperAdmin && (
              <span className="inline-flex items-center gap-1 rounded-md bg-[#FFFBEB] px-1.5 py-0.5 text-[10px] font-bold text-[#92400E]" title="Aprodac platform owner: sees every module and setting">
                <ShieldCheck size={10} /> Aprodac
              </span>
            )}
          </span>
        ),
      },
    ];

    if (activeTab === 'driver') {
      baseCols.push({
        header: 'App password',
        accessor: (u: UnifiedUser) => (
          u.hasAccountPassword ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (u.originalDriver) {
                  handleOpenDriverPasswordModal(u.originalDriver);
                }
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground hover:text-brand transition-colors cursor-pointer group"
              title="Click to update driver mobile app password"
            >
              <KeyRound size={12} className="text-[#16A34A] shrink-0" />
              <span>Set · change</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (u.originalDriver) {
                  handleOpenDriverPasswordModal(u.originalDriver);
                }
              }}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#D97706] hover:text-brand transition-colors cursor-pointer group"
              title="Click to set driver mobile app password"
            >
              <KeyRound size={12} className="shrink-0" />
              <span>Not set · set now</span>
            </button>
          )
        ),
      });
    }

    baseCols.push(
      {
        header: 'Last sign-in',
        accessor: (u: UnifiedUser) => (
          <span className={`text-xs text-muted-foreground whitespace-nowrap ${u.status === 'Inactive' ? 'opacity-50' : ''}`}>
            {u.lastLogin}
          </span>
        ),
      },
      {
        header: '',
        headerClassName: 'text-right',
        className: 'text-right',
        accessor: (u: UnifiedUser) => {
          const isSuperAdminTarget = Boolean(u.isSuperAdmin);
          const isProtectedFromRequester = isSuperAdminTarget && !currentUser?.isSuperAdmin;

          return (
            <div className="flex items-center justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <MoreHorizontal size={15} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 p-1.5 shadow-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl z-50">
                  {/* SuperAdmin protection notice if restricted */}
                  {isProtectedFromRequester && (
                    <div className="px-2.5 py-1.5 mb-1 text-[10px] font-semibold bg-amber-50 text-amber-800 rounded-lg border border-amber-200 flex items-center gap-1">
                      <ShieldCheck size={11} className="shrink-0 text-amber-600" />
                      <span>SuperAdmin Protected</span>
                    </div>
                  )}

                  {/* 1. Password & Details Option */}
                  <DropdownMenuItem
                    disabled={isProtectedFromRequester}
                    onClick={() => {
                      if (u.originalDriver) {
                        handleOpenDriverPasswordModal(u.originalDriver);
                      } else if (u.originalUser) {
                        handleEditUser(u.originalUser);
                      }
                    }}
                    className="cursor-pointer text-xs font-semibold py-2 px-2.5 rounded-lg flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <KeyRound size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span>
                      {u.originalDriver
                        ? (u.hasAccountPassword ? 'Update Password' : 'Set Password')
                        : 'Password & Details'}
                    </span>
                  </DropdownMenuItem>

                  {/* 2. Activate / Deactivate Option */}
                  <DropdownMenuItem
                    disabled={isProtectedFromRequester}
                    onClick={() => handleToggleUserStatus(u)}
                    className={`cursor-pointer text-xs font-semibold py-2 px-2.5 rounded-lg flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                      u.status === 'Active'
                        ? 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                        : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                    }`}
                  >
                    {u.status === 'Active' ? (
                      <>
                        <UserX size={14} className="text-amber-600 shrink-0" />
                        <span>Deactivate Account</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
                        <span>Activate Account</span>
                      </>
                    )}
                  </DropdownMenuItem>

                  {/* 3. Delete Option */}
                  <DropdownMenuItem
                    disabled={isProtectedFromRequester}
                    onClick={() => handlePermanentDeleteUser(u)}
                    className="cursor-pointer text-xs font-semibold py-2 px-2.5 rounded-lg flex items-center gap-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={14} className="text-rose-600 shrink-0" />
                    <span>Delete Account</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      }
    );

    return baseCols;
  }, [activeTab, navigate]);

  return (
    <SettingsPage
      wide
      title="Users"
      description="People who sign in to the dashboard and the operator app. Driver accounts are managed from each driver's page and listed here read-only."
      actions={
        activeTab === 'web' ? (
          <Btn label="Add user" icon={<Plus size={14} />} onClick={() => { setEditingUser(null); setIsModalOpen(true); }} />
        ) : (
          <Btn label="Add driver" variant="outline" icon={<Plus size={14} />} onClick={() => navigate('/drivers/new')} />
        )
      }
    >
      <div className="flex items-center gap-1.5" role="tablist" aria-label="Account type">
        {([
          { id: 'web', label: 'Dashboard users', count: users.filter(u => isSuperAdmin || (!u.isSuperAdmin && u.role !== 'SuperAdmin')).length },
          { id: 'driver', label: 'Drivers', count: driversList.length },
        ] as const).map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                'inline-flex items-center gap-2 h-8 px-3 rounded-full text-xs font-bold transition-colors',
                active ? 'bg-foreground text-background' : 'bg-card border border-black/[0.08] dark:border-white/10 text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
              <span className={cn('tabular-nums', active ? 'opacity-70' : 'text-[#9898A4]')}>{t.count}</span>
            </button>
          );
        })}
      </div>

        {/* ── Table Ledger Workspace ── */}
        <DataTable
          columns={columns}
          data={filteredUsers}
          pageSize={10}
          pageSizeOptions={[10, 25, 50]}
          compact={true}
          rowClassName={(row) => row.status === 'Inactive' ? 'opacity-55 bg-slate-100/50 dark:bg-slate-900/40 text-slate-500 hover:bg-slate-100/80' : ''}
          isLoading={isUsersLoading || isDriversLoading}
          isError={isUsersError || isDriversError}
          errorMessage={(usersError || driversError as Error)?.message || 'Failed to load user records.'}
          filterElement={
            <div className="flex items-center gap-2 flex-wrap">
              {/* Search Bar */}
              <div className="relative w-full sm:w-72 shrink-0">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search name, email or phone"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8.5 pr-4 h-9 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-800 rounded-xl font-medium shadow-2xs"
                />
              </div>

              {/* Role Dropdown */}
              <div className="w-36">
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="h-9 text-xs font-semibold rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xs">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="Operator">Operator</SelectItem>
                    {isSuperAdmin && <SelectItem value="SuperAdmin">SuperAdmin</SelectItem>}
                    <SelectItem value="Driver">Driver</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          }
          bulkActions={[
            {
              label: 'Export Excel',
              icon: <FileSpreadsheet size={13} className="text-emerald-600" />,
              variant: 'secondary' as const,
              onClick: (selectedRows: UnifiedUser[]) => {
                handleExportUsers(selectedRows, 'excel');
              }
            },
            {
              label: 'Export PDF',
              icon: <FileText size={13} className="text-rose-600" />,
              variant: 'secondary' as const,
              onClick: (selectedRows: UnifiedUser[]) => {
                handleExportUsers(selectedRows, 'pdf');
              }
            }
          ]}
          enableSelection={true}
        />

      <UserModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveUser}
        initialData={editingUser}
        isLoading={createMutation.isPending || updateMutation.isPending}
        canManageSuperAdmin={currentUser?.isSuperAdmin}
      />

      <DriverPasswordModal
        isOpen={isDriverPasswordModalOpen}
        onClose={() => {
          setIsDriverPasswordModalOpen(false);
          setSelectedDriverForPassword(null);
        }}
        driver={selectedDriverForPassword}
        onSave={handleSaveDriverPassword}
        isLoading={setDriverPasswordMutation.isPending}
      />
    </SettingsPage>
  );
}
