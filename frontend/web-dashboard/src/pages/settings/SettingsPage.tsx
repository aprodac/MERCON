import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  User, Shield, Building2, Bell, Key, Save, CheckCircle2,
  AlertTriangle, Upload, Loader2, Globe, ChevronDown, Check, Lock, Clock, Mail, Phone, Sliders, Settings, Layers, Palette, Activity, SlidersHorizontal
} from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { authService } from '@/services/authService';
import { settingsService } from '@/services/settingsService';
import { MODULE_KEYS, COMMON_TIMEZONES, COUNTRY_CODES, type ModuleKey } from '@mercon/shared-types';
import PhoneDisplay from '@/components/ui/PhoneDisplay';
import PhoneInput from '@/components/ui/PhoneInput';
import CountryFlag from '@/components/ui/CountryFlag';
import { cn } from '@/lib/utils';

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function ToggleSwitch({ checked, onChange, disabled }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden",
        checked ? "bg-brand" : "bg-slate-200 dark:bg-slate-800",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}

function LiveClock({ timezone }: { timezone: string }) {
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    const updateTime = () => {
      try {
        const date = new Date();
        const formatted = date.toLocaleTimeString('en-US', {
          timeZone: timezone,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
        const dateFormatted = date.toLocaleDateString('en-US', {
          timeZone: timezone,
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        setTimeStr(`${dateFormatted} · ${formatted}`);
      } catch (e) {
        setTimeStr(new Date().toLocaleTimeString());
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [timezone]);

  return (
    <div className="flex items-center gap-2.5 p-3.5 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 rounded-xl">
      <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 animate-pulse" />
      <div className="min-w-0">
        <span className="text-[10px] text-slate-400 dark:text-slate-500 block leading-tight font-semibold uppercase tracking-wider">Operational Local Time</span>
        <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 font-mono leading-tight mt-0.5 block">{timeStr || 'Loading local time...'}</span>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'profile' | 'company' | 'region' | 'security' | 'notifications'>('profile');
  
  // Feedback Messages
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [notifSuccess, setNotifSuccess] = useState<string | null>(null);

  // Profile Form State
  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    phone: '',
  });

  // Password Form State
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });

  // Notification Preferences State
  const [notifPrefs, setNotifPrefs] = useState({
    email_dispatch: true,
    sms_alerts: true,
    document_expiry: true,
    weekly_reports: false,
  });

  // Fetch Current Auth User
  const { data: user, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authService.getMe,
  });

  const initials = (user?.name || 'Admin')
    .split(' ')
    .map((n: string) => n[0])
    .filter(Boolean)
    .join('')
    .substring(0, 2)
    .toUpperCase();

  useEffect(() => {
    if (user) {
      setProfileForm({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
      });
    }
  }, [user]);

  // Deployment branding + modules (superadmin-editable)
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsService.get,
  });

  const [brandingForm, setBrandingForm] = useState({
    appName: '',
    companyLegalName: '',
    vatNumber: '',
    crNumber: '',
    logoUrl: '',
    primaryColor: '#E8450F',
    defaultCountryCode: 'SA',
    defaultCountryDialCode: '+966',
  });
  const [enabledModules, setEnabledModules] = useState<ModuleKey[]>([]);
  const [brandingSuccess, setBrandingSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setBrandingForm({
        appName: settings.appName,
        companyLegalName: settings.companyLegalName,
        vatNumber: settings.vatNumber || '',
        crNumber: settings.crNumber || '',
        logoUrl: settings.logoUrl || '',
        primaryColor: settings.primaryColor,
        defaultCountryCode: settings.defaultCountryCode || 'SA',
        defaultCountryDialCode: settings.defaultCountryDialCode || '+966',
      });
      setEnabledModules(settings.enabledModules);
      setTimezone(settings.timezone || 'Asia/Riyadh');
    }
  }, [settings]);

  // Timezone state
  const [timezone, setTimezone] = useState('Asia/Riyadh');
  const [timezoneSuccess, setTimezoneSuccess] = useState<string | null>(null);
  const [timezoneError, setTimezoneError] = useState<string | null>(null);
  const canEditTimezone = user?.role === 'Admin';

  const updateTimezoneMutation = useMutation({
    mutationFn: () => settingsService.updateTimezone(timezone),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['settings', 'public'] });
      setTimezoneError(null);
      setTimezoneSuccess('Timezone updated — dates across the app now use it.');
      setTimeout(() => setTimezoneSuccess(null), 4000);
    },
    onError: (err: any) => {
      setTimezoneSuccess(null);
      setTimezoneError(err.response?.data?.error?.message || err.message || 'Failed to update timezone.');
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: () => settingsService.update({ ...brandingForm, enabledModules }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['settings', 'public'] });
      setBrandingSuccess('Branding & modules updated!');
      setTimeout(() => setBrandingSuccess(null), 4000);
    },
  });

  const [logoError, setLogoError] = useState<string | null>(null);
  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => settingsService.uploadLogo(file),
    onSuccess: (fileUrl) => {
      setBrandingForm((f) => ({ ...f, logoUrl: fileUrl }));
      setLogoError(null);
    },
    onError: (err: any) => {
      setLogoError(err.response?.data?.error?.message || err.message || 'Upload failed.');
    },
  });

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) uploadLogoMutation.mutate(file);
  };

  const toggleModule = (key: ModuleKey) => {
    if (!user?.isSuperAdmin) return;
    setEnabledModules((prev) => (prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]));
  };

  const updateProfileMutation = useMutation({
    mutationFn: (payload: { name?: string; email?: string; phone?: string }) => authService.updateMe(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      setProfileSuccess('Profile details successfully updated!');
      setProfileError(null);
      setTimeout(() => setProfileSuccess(null), 4000);
    },
    onError: (err: any) => {
      setProfileError(err.response?.data?.error?.message || err.message || 'Failed to update profile.');
      setProfileSuccess(null);
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (payload: { current_password: string; new_password: string }) => 
      authService.changePassword(payload.current_password, payload.new_password),
    onSuccess: () => {
      setPasswordSuccess('Password changed successfully!');
      setPasswordError(null);
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
      setTimeout(() => setPasswordSuccess(null), 4000);
    },
    onError: (err: any) => {
      setPasswordError(err.response?.data?.error?.message || err.message || 'Failed to change password. Verify your current password.');
      setPasswordSuccess(null);
    },
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSuccess(null);
    setProfileError(null);

    if (!profileForm.name.trim()) {
      setProfileError('Full name cannot be empty.');
      return;
    }

    updateProfileMutation.mutate({
      name: profileForm.name.trim(),
      email: profileForm.email.trim() || undefined,
      phone: profileForm.phone.trim() || undefined,
    });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSuccess(null);
    setPasswordError(null);

    if (!passwordForm.current_password) {
      setPasswordError('Current password is required.');
      return;
    }
    if (passwordForm.new_password.length < 6) {
      setPasswordError('New password must be at least 6 characters long.');
      return;
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    changePasswordMutation.mutate({
      current_password: passwordForm.current_password,
      new_password: passwordForm.new_password,
    });
  };

  const handleNotifSave = () => {
    setNotifSuccess('Notification preferences saved!');
    setTimeout(() => setNotifSuccess(null), 3000);
  };

  const navItems = [
    {
      id: 'profile' as const,
      title: 'My Profile',
      subtitle: 'Personal info & account credentials',
      icon: User,
    },
    {
      id: 'company' as const,
      title: 'Company Settings',
      subtitle: 'Branding, VAT & enabled modules',
      icon: Building2,
    },
    {
      id: 'region' as const,
      title: 'Region & Time',
      subtitle: 'Timezone used for all dates',
      icon: Globe,
    },
    {
      id: 'security' as const,
      title: 'Security & Access',
      subtitle: 'Change password & credentials',
      icon: Shield,
    },
    {
      id: 'notifications' as const,
      title: 'System Alerts',
      subtitle: 'Dispatch & SMS notification controls',
      icon: Bell,
    },
  ];

  return (
    <DashboardLayout 
      active="Account" 
      title="Settings" 
    >
      <div className="px-4 sm:px-6 pb-6 w-full flex flex-col animate-fade-in gap-5 max-w-[1350px] mx-auto">
        
        {/* ── Page Header ── */}
        <div className="flex items-center justify-between gap-4 shrink-0 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <Settings className="w-5 h-5 text-slate-700 dark:text-slate-300 shrink-0" />
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              Settings
            </h1>
          </div>
        </div>

        {/* ── Main Layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Sidebar (3 Cols) */}
          <div className="lg:col-span-3 space-y-4">
            <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm space-y-4">
              
              {/* Group 1: User Account */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">
                  User Settings
                </div>
                <div className="space-y-1">
                  {navItems.filter(item => ['profile', 'security'].includes(item.id)).map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveTab(item.id)}
                        className={cn(
                          "w-full flex items-center gap-2.5 p-2 rounded-xl text-left transition-all cursor-pointer border border-transparent",
                          isActive
                            ? "bg-orange-50/80 text-brand font-bold dark:bg-orange-950/20 dark:text-orange-400 border-orange-200/30"
                            : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40 font-medium"
                        )}
                      >
                        <div className={cn(
                          "p-1.5 rounded-lg shrink-0 transition-colors",
                          isActive
                            ? "bg-brand text-white dark:bg-orange-600"
                            : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                        )}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-bold leading-normal">{item.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Group 2: System Settings */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">
                  Organization Settings
                </div>
                <div className="space-y-1">
                  {navItems.filter(item => ['company', 'region', 'notifications'].includes(item.id)).map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveTab(item.id)}
                        className={cn(
                          "w-full flex items-center gap-2.5 p-2 rounded-xl text-left transition-all cursor-pointer border border-transparent",
                          isActive
                            ? "bg-orange-50/80 text-brand font-bold dark:bg-orange-950/20 dark:text-orange-400 border-orange-200/30"
                            : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40 font-medium"
                        )}
                      >
                        <div className={cn(
                          "p-1.5 rounded-lg shrink-0 transition-colors",
                          isActive
                            ? "bg-brand text-white dark:bg-orange-600"
                            : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                        )}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-bold leading-normal">{item.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Group 3: Vendor SuperAdmin Controls */}
              {((user?.role as string) === 'SuperAdmin' || (user as any)?.isSuperAdmin) && (
                <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-purple-600 dark:text-purple-400 px-1 flex items-center gap-1">
                    <Shield className="w-3 h-3 text-purple-600" /> Vendor SuperAdmin Controls
                  </div>
                  <div className="space-y-1">
                    <Link
                      to="/settings/taxonomy"
                      className="w-full flex items-center gap-2.5 p-2 rounded-xl text-left text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-all border border-transparent hover:border-purple-200/50"
                    >
                      <div className="p-1.5 rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                        <Layers className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold">Taxonomy & Master Data</span>
                    </Link>

                    <Link
                      to="/settings/branding"
                      className="w-full flex items-center gap-2.5 p-2 rounded-xl text-left text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all border border-transparent hover:border-rose-200/50"
                    >
                      <div className="p-1.5 rounded-lg bg-rose-100 text-[#FA634E] dark:bg-rose-900/50 dark:text-rose-300">
                        <Palette className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold">Colors & Theme System</span>
                    </Link>

                    <Link
                      to="/settings/system-health"
                      className="w-full flex items-center gap-2.5 p-2 rounded-xl text-left text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-all border border-transparent hover:border-emerald-200/50"
                    >
                      <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                        <Activity className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold">System Telemetry & Health</span>
                    </Link>
                  </div>
                </div>
              )}

            </Card>
          </div>

          {/* Right Column: Active Configuration Form (9 Cols) */}
          <div className="lg:col-span-9">
            
            {/* TAB 1: PROFILE */}
            {activeTab === 'profile' && (
              <Card className="border border-slate-200 dark:border-slate-800 shadow-xs rounded-2xl bg-white dark:bg-slate-900">
                <CardHeader className="py-4 px-6 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-brand shrink-0" />
                    <CardTitle className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                      My Profile Information
                    </CardTitle>
                  </div>
                </CardHeader>

                <form onSubmit={handleProfileSubmit}>
                  <CardContent className="p-6 space-y-6">
                    
                    {/* User profile banner card */}
                    <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
                      <div className="w-12 h-12 rounded-xl bg-brand text-white font-extrabold text-lg flex items-center justify-center shadow-xs shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 leading-tight">
                            {user?.name || 'Administrator'}
                          </h3>
                          <p className="text-xs text-slate-500 font-mono leading-tight mt-0.5">
                            {user?.email || 'operator@mercon.tech'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="bg-indigo-50/50 text-indigo-600 border-indigo-200 text-[10px] font-bold uppercase py-0.5 px-2.5">
                            {user?.role || 'Operator'}
                          </Badge>
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200 text-[10px] font-bold py-0.5 px-2.5">
                            Active Session
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <Label htmlFor="prof_name" className="text-xs font-bold text-slate-700 dark:text-slate-300">Full Name</Label>
                        <Input
                          id="prof_name"
                          value={profileForm.name}
                          onChange={(e) => setProfileForm(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="John Doe"
                          className="h-9.5 text-xs font-bold border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus-visible:ring-brand/20 focus-visible:border-brand"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="prof_email" className="text-xs font-bold text-slate-700 dark:text-slate-300">Email Address</Label>
                        <Input
                          id="prof_email"
                          type="email"
                          value={profileForm.email}
                          onChange={(e) => setProfileForm(prev => ({ ...prev, email: e.target.value }))}
                          placeholder="operator@mercon.tech"
                          className="h-9.5 text-xs font-bold border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus-visible:ring-brand/20 focus-visible:border-brand"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="prof_phone" className="text-xs font-bold text-slate-700 dark:text-slate-300">Phone Number</Label>
                        <PhoneInput
                          id="prof_phone"
                          value={profileForm.phone}
                          onChange={(val) => setProfileForm(prev => ({ ...prev, phone: val }))}
                          placeholder="50 000 0000"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Account Access Role</Label>
                        <div className="relative flex items-center">
                          <Input
                            value={user?.role || 'Operator'}
                            readOnly
                            className="h-9.5 text-xs font-bold bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 text-slate-500 cursor-not-allowed pr-8"
                          />
                          <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-3" />
                        </div>
                      </div>
                    </div>

                    {profileSuccess && (
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 rounded-xl text-xs font-semibold border border-emerald-100 dark:border-emerald-900/50 flex items-center gap-2 animate-fade-in">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        {profileSuccess}
                      </div>
                    )}

                    {profileError && (
                      <div className="p-3 bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 rounded-xl text-xs font-semibold border border-rose-100 dark:border-rose-900/50 flex items-center gap-2 animate-fade-in">
                        <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                        {profileError}
                      </div>
                    )}

                  </CardContent>

                  <CardFooter className="bg-slate-50/50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800/80 p-4 flex justify-end">
                    <Button 
                      type="submit" 
                      disabled={updateProfileMutation.isPending}
                      className="h-9 text-xs bg-brand hover:bg-brand-hover text-white font-bold px-5 shadow-xs rounded-lg gap-1.5 cursor-pointer"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {updateProfileMutation.isPending ? 'Saving...' : 'Save Profile Details'}
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            )}

            {/* TAB 2: COMPANY / BRANDING */}
            {activeTab === 'company' && (
              <Card className="border border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl bg-white dark:bg-slate-900">
                <CardHeader className="py-4 px-6 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-brand shrink-0" />
                    <CardTitle className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                      Company Branding & Modules
                    </CardTitle>
                  </div>
                  {!user?.isSuperAdmin && (
                    <Badge variant="outline" className="text-[10px] font-bold border-slate-200 dark:border-slate-800 text-slate-400">
                      Gated View
                    </Badge>
                  )}
                </CardHeader>

                <CardContent className="pt-6 space-y-6">
                  
                  {/* Branding Fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">App Branding Title</Label>
                      <Input
                        value={brandingForm.appName}
                        readOnly={!user?.isSuperAdmin}
                        onChange={(e) => setBrandingForm((f) => ({ ...f, appName: e.target.value }))}
                        className={cn(
                          "h-9.5 text-xs font-bold border-slate-200 dark:border-slate-800",
                          !user?.isSuperAdmin && "bg-slate-50 dark:bg-slate-800/50 cursor-not-allowed"
                        )}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Company Legal Name</Label>
                      <Input
                        value={brandingForm.companyLegalName}
                        readOnly={!user?.isSuperAdmin}
                        onChange={(e) => setBrandingForm((f) => ({ ...f, companyLegalName: e.target.value }))}
                        className={cn(
                          "h-9.5 text-xs font-bold border-slate-200 dark:border-slate-800",
                          !user?.isSuperAdmin && "bg-slate-50 dark:bg-slate-800/50 cursor-not-allowed"
                        )}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">VAT Number (15-digit Tax Reg)</Label>
                      <Input
                        value={brandingForm.vatNumber}
                        readOnly={!user?.isSuperAdmin}
                        placeholder="312709215800003"
                        onChange={(e) => setBrandingForm((f) => ({ ...f, vatNumber: e.target.value }))}
                        className={cn(
                          "h-9.5 text-xs font-mono font-bold border-slate-200 dark:border-slate-800",
                          !user?.isSuperAdmin && "bg-slate-50 dark:bg-slate-800/50 cursor-not-allowed"
                        )}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Commercial Registration (C.R. No.)</Label>
                      <Input
                        value={brandingForm.crNumber}
                        readOnly={!user?.isSuperAdmin}
                        placeholder="1009152862"
                        onChange={(e) => setBrandingForm((f) => ({ ...f, crNumber: e.target.value }))}
                        className={cn(
                          "h-9.5 text-xs font-mono font-bold border-slate-200 dark:border-slate-800",
                          !user?.isSuperAdmin && "bg-slate-50 dark:bg-slate-800/50 cursor-not-allowed"
                        )}
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Company Logo</Label>
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 shrink-0 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-center overflow-hidden">
                          {brandingForm.logoUrl ? (
                            <img src={brandingForm.logoUrl} alt="Logo" className="h-full w-full object-contain" />
                          ) : (
                            <Building2 className="h-5 w-5 text-slate-300 dark:text-slate-700" />
                          )}
                        </div>
                        <Input
                          value={brandingForm.logoUrl}
                          readOnly={!user?.isSuperAdmin}
                          onChange={(e) => setBrandingForm((f) => ({ ...f, logoUrl: e.target.value }))}
                          placeholder="Logo image link or upload a file"
                          className={cn(
                            "h-9.5 text-xs font-mono border-slate-200 dark:border-slate-800 flex-1",
                            !user?.isSuperAdmin && "bg-slate-50 dark:bg-slate-800/50 cursor-not-allowed"
                          )}
                        />
                        {user?.isSuperAdmin && (
                          <>
                            <input
                              id="logo-upload-input"
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="hidden"
                              onChange={handleLogoFileChange}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-9.5 text-xs font-semibold shrink-0 cursor-pointer border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
                              disabled={uploadLogoMutation.isPending}
                              onClick={() => document.getElementById('logo-upload-input')?.click()}
                            >
                              {uploadLogoMutation.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              ) : (
                                <Upload className="h-3.5 w-3.5 mr-1.5" />
                              )}
                              Upload
                            </Button>
                          </>
                        )}
                      </div>
                      {logoError && <p className="text-xs text-rose-600 mt-1 font-semibold">{logoError}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Theme Color</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={brandingForm.primaryColor}
                          disabled={!user?.isSuperAdmin}
                          onChange={(e) => setBrandingForm((f) => ({ ...f, primaryColor: e.target.value }))}
                          className="h-9.5 w-9.5 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-60 cursor-pointer"
                        />
                        <Input
                          value={brandingForm.primaryColor}
                          readOnly={!user?.isSuperAdmin}
                          onChange={(e) => setBrandingForm((f) => ({ ...f, primaryColor: e.target.value }))}
                          className={cn(
                            "h-9.5 text-xs font-mono border-slate-200 dark:border-slate-800",
                            !user?.isSuperAdmin && "bg-slate-50 dark:bg-slate-800/50 cursor-not-allowed"
                          )}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Country Prefix Section */}
                  <div className="p-4 bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-800 rounded-2xl space-y-3">
                    <Label className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <CountryFlag code={brandingForm.defaultCountryCode} /> Default Country Dial Prefixes
                    </Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <select
                          value={brandingForm.defaultCountryCode}
                          disabled={!user?.isSuperAdmin}
                          onChange={(e) => {
                            const selectedCode = e.target.value;
                            const found = COUNTRY_CODES.find((c) => c.code === selectedCode);
                            setBrandingForm((f) => ({
                              ...f,
                              defaultCountryCode: selectedCode,
                              defaultCountryDialCode: found?.dialCode || '+966',
                            }));
                          }}
                          className="h-9.5 w-full text-xs font-bold border border-slate-200 dark:border-slate-800 rounded-lg px-3 bg-white dark:bg-slate-950 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-hidden focus:ring-1 focus:ring-brand"
                        >
                          {COUNTRY_CODES.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.flag} {c.name} ({c.dialCode})
                            </option>
                          ))}
                        </select>
                        <span className="text-[10px] text-slate-500 block leading-tight mt-1.5 font-medium">
                          All driver and customer phone fields default to this dialing region.
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-white dark:bg-slate-950 rounded-xl border border-slate-200/80 dark:border-slate-800">
                        <span className="text-[11px] font-bold text-slate-400">Format Preview:</span>
                        <PhoneDisplay phone={`${brandingForm.defaultCountryDialCode} 50 123 4567`} variant="badge" showActions />
                      </div>
                    </div>
                  </div>

                  {/* Module Governance Shortcut for SuperAdmin */}
                  {user?.isSuperAdmin && (
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
                      <div>
                        <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Module & Page Governance</Label>
                        <span className="text-[10px] text-slate-500 block leading-normal mt-0.5">Configure active logistics modules, feature toggles & fallback landing pages on the dedicated SuperAdmin page</span>
                      </div>
                      <Link to="/settings/module-governance" className="shrink-0">
                        <Button type="button" variant="outline" size="sm" className="text-xs font-bold gap-2 cursor-pointer border-brand/40 text-brand hover:bg-orange-50 dark:hover:bg-orange-950/30">
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                          <span>Module Governance</span>
                        </Button>
                      </Link>
                    </div>
                  )}

                  {brandingSuccess && (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 rounded-xl text-xs font-semibold border border-emerald-100 dark:border-emerald-900/50 flex items-center gap-2 animate-fade-in">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      {brandingSuccess}
                    </div>
                  )}

                </CardContent>

                <CardFooter className="bg-slate-50/50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800/80 p-4 flex justify-between items-center">
                  <span className="text-[11px] text-slate-500 font-medium">
                    {user?.isSuperAdmin ? 'Global settings apply to all operators.' : 'Only Super Admins can save branding edits.'}
                  </span>
                  {user?.isSuperAdmin ? (
                    <Button
                      size="sm"
                      className="h-9 text-xs font-bold bg-brand hover:bg-brand-hover text-white px-5 rounded-lg gap-1.5 cursor-pointer"
                      onClick={() => updateSettingsMutation.mutate()}
                      disabled={updateSettingsMutation.isPending}
                    >
                      <Save className="h-3.5 w-3.5" /> Save Branding
                    </Button>
                  ) : (
                    <Badge variant="outline" className="h-9 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600 bg-slate-50 dark:bg-slate-900 px-3 flex items-center gap-1.5 font-bold">
                      <Lock className="w-3.5 h-3.5" /> Gated View
                    </Badge>
                  )}
                </CardFooter>
              </Card>
            )}

            {/* TAB 3: REGION & TIME */}
            {activeTab === 'region' && (
              <Card className="border border-slate-200 dark:border-slate-800 shadow-xs rounded-2xl bg-white dark:bg-slate-900">
                <CardHeader className="py-4 px-6 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-brand shrink-0" />
                    <CardTitle className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                      Region & Time Config
                    </CardTitle>
                  </div>
                </CardHeader>

                <CardContent className="pt-6 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Deployment Timezone</Label>
                      <select
                        value={timezone}
                        disabled={!canEditTimezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="h-9.5 w-full text-xs font-bold border border-slate-200 dark:border-slate-800 rounded-lg px-3 bg-white dark:bg-slate-950 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-hidden focus:ring-1 focus:ring-brand"
                      >
                        {COMMON_TIMEZONES.map((tzOption) => (
                          <option key={tzOption} value={tzOption}>{tzOption}</option>
                        ))}
                      </select>
                      <span className="text-[10px] text-slate-500 block leading-tight font-medium mt-1">
                        Timestamps remain UTC internally. Changing this alters display values only.
                      </span>
                    </div>

                    <LiveClock timezone={timezone} />
                  </div>

                  {timezoneSuccess && (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 rounded-xl text-xs font-semibold border border-emerald-100 dark:border-emerald-900/50 flex items-center gap-2 animate-fade-in">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      {timezoneSuccess}
                    </div>
                  )}

                  {timezoneError && (
                    <div className="p-3 bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 rounded-xl text-xs font-semibold border border-rose-100 dark:border-rose-900/50 flex items-center gap-2 animate-fade-in">
                      <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                      {timezoneError}
                    </div>
                  )}
                </CardContent>

                <CardFooter className="bg-slate-50/50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800/80 p-4 flex justify-between items-center">
                  <span className="text-[11px] text-slate-500 font-medium">
                    {canEditTimezone ? 'Applies to everyone on this deployment.' : 'Only administrators can update time configurations.'}
                  </span>
                  {canEditTimezone ? (
                    <Button
                      size="sm"
                      className="h-9 text-xs font-bold bg-brand hover:bg-brand-hover text-white px-5 rounded-lg gap-1.5 cursor-pointer"
                      onClick={() => updateTimezoneMutation.mutate()}
                      disabled={updateTimezoneMutation.isPending || timezone === settings?.timezone}
                    >
                      <Save className="h-3.5 w-3.5" />
                      {updateTimezoneMutation.isPending ? 'Saving...' : 'Save Timezone'}
                    </Button>
                  ) : (
                    <Badge variant="outline" className="h-9 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600 bg-slate-50 dark:bg-slate-900 px-3 flex items-center gap-1.5 font-bold">
                      <Lock className="w-3.5 h-3.5" /> Gated View
                    </Badge>
                  )}
                </CardFooter>
              </Card>
            )}

            {/* TAB 4: SECURITY */}
            {activeTab === 'security' && (
              <Card className="border border-slate-200 dark:border-slate-800 shadow-xs rounded-2xl bg-white dark:bg-slate-900">
                <CardHeader className="py-4 px-6 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-brand shrink-0" />
                    <CardTitle className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                      Security & Credentials
                    </CardTitle>
                  </div>
                </CardHeader>

                <form onSubmit={handlePasswordSubmit}>
                  <CardContent className="pt-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                      <div className="space-y-2">
                        <Label htmlFor="cur_pwd" className="text-xs font-bold text-slate-700 dark:text-slate-300">Current Password</Label>
                        <Input
                          id="cur_pwd"
                          type="password"
                          value={passwordForm.current_password}
                          onChange={(e) => setPasswordForm(prev => ({ ...prev, current_password: e.target.value }))}
                          placeholder="••••••••"
                          className="h-9.5 text-xs border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus-visible:ring-brand/20 focus-visible:border-brand"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="new_pwd" className="text-xs font-bold text-slate-700 dark:text-slate-300">New Password</Label>
                        <Input
                          id="new_pwd"
                          type="password"
                          value={passwordForm.new_password}
                          onChange={(e) => setPasswordForm(prev => ({ ...prev, new_password: e.target.value }))}
                          placeholder="••••••••"
                          className="h-9.5 text-xs border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus-visible:ring-brand/20 focus-visible:border-brand"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="cnf_pwd" className="text-xs font-bold text-slate-700 dark:text-slate-300">Confirm Password</Label>
                        <Input
                          id="cnf_pwd"
                          type="password"
                          value={passwordForm.confirm_password}
                          onChange={(e) => setPasswordForm(prev => ({ ...prev, confirm_password: e.target.value }))}
                          placeholder="••••••••"
                          className="h-9.5 text-xs border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus-visible:ring-brand/20 focus-visible:border-brand"
                        />
                      </div>
                    </div>

                    {passwordSuccess && (
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 rounded-xl text-xs font-semibold border border-emerald-100 dark:border-emerald-900/50 flex items-center gap-2 animate-fade-in">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        {passwordSuccess}
                      </div>
                    )}

                    {passwordError && (
                      <div className="p-3 bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 rounded-xl text-xs font-semibold border border-rose-100 dark:border-rose-900/50 flex items-center gap-2 animate-fade-in">
                        <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                        {passwordError}
                      </div>
                    )}
                  </CardContent>

                  <CardFooter className="bg-slate-50/50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800/80 p-4 flex justify-end">
                    <Button 
                      type="submit" 
                      disabled={changePasswordMutation.isPending}
                      className="h-9 text-xs bg-brand hover:bg-brand-hover text-white font-bold px-5 shadow-xs rounded-lg gap-1.5 cursor-pointer"
                    >
                      <Key className="h-3.5 w-3.5" />
                      {changePasswordMutation.isPending ? 'Updating...' : 'Update Password'}
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            )}

            {/* TAB 5: NOTIFICATIONS */}
            {activeTab === 'notifications' && (
              <Card className="border border-slate-200 dark:border-slate-800 shadow-xs rounded-2xl bg-white dark:bg-slate-900">
                <CardHeader className="py-4 px-6 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-brand shrink-0" />
                    <CardTitle className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                      Dispatch & System Notifications
                    </CardTitle>
                  </div>
                </CardHeader>

                <CardContent className="pt-6 space-y-4">
                  <div className="space-y-3">
                    
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">Trip Dispatch Alerts</h4>
                        <p className="text-[10px] text-slate-500 mt-0.5 leading-normal">Receive instant notifications when new trips are created or dispatched.</p>
                      </div>
                      <ToggleSwitch
                        checked={notifPrefs.email_dispatch}
                        onChange={(val) => setNotifPrefs(prev => ({ ...prev, email_dispatch: val }))}
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">Document Expiry Warnings</h4>
                        <p className="text-[10px] text-slate-500 mt-0.5 leading-normal">Get 30-day advance warnings for expiring driver licenses and vehicle permits.</p>
                      </div>
                      <ToggleSwitch
                        checked={notifPrefs.document_expiry}
                        onChange={(val) => setNotifPrefs(prev => ({ ...prev, document_expiry: val }))}
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">SMS Notifications to Drivers</h4>
                        <p className="text-[10px] text-slate-500 mt-0.5 leading-normal">Send automated SMS dispatch links to drivers upon trip assignment.</p>
                      </div>
                      <ToggleSwitch
                        checked={notifPrefs.sms_alerts}
                        onChange={(val) => setNotifPrefs(prev => ({ ...prev, sms_alerts: val }))}
                      />
                    </div>

                  </div>

                  {notifSuccess && (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 rounded-xl text-xs font-semibold border border-emerald-100 dark:border-emerald-900/50 flex items-center gap-2 animate-fade-in">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      {notifSuccess}
                    </div>
                  )}
                </CardContent>

                <CardFooter className="bg-slate-50/50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800/80 p-4 flex justify-end">
                  <Button 
                    onClick={handleNotifSave}
                    className="h-9 text-xs bg-brand hover:bg-brand-hover text-white font-bold px-5 shadow-xs rounded-lg gap-1.5 cursor-pointer"
                  >
                    <Save className="h-3.5 w-3.5" /> Save Preferences
                  </Button>
                </CardFooter>
              </Card>
            )}

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
