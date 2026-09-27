import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { SettingsPage as SettingsShell, SettingsRow, SettingsSection } from '@/components/settings/SettingsKit';
import Btn from '@/components/ui/Btn';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PhoneInput from '@/components/ui/PhoneInput';
import { authService } from '@/services/authService';
import { settingsService } from '@/services/settingsService';
import { COMMON_TIMEZONES, COUNTRY_CODES } from '@mercon/shared-types';

/**
 * Account & company: the signed-in person's own profile and password, plus the
 * company's legal details and region. Branding (name, logo, colours) lives on
 * its own page, modules on the Modules page.
 */

function useLocalTime(timezone: string) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  try {
    return now.toLocaleString('en-GB', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return now.toLocaleString();
  }
}

const errorMessage = (err: any, fallback: string) => err?.response?.data?.error?.message || err?.message || fallback;

export default function SettingsPage() {
  const queryClient = useQueryClient();

  const { data: user } = useQuery({ queryKey: ['auth', 'me'], queryFn: authService.getMe });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsService.get });

  const isSuperAdmin = Boolean(user?.isSuperAdmin);
  const canEditTimezone = user?.role === 'Admin' || isSuperAdmin;

  /* ── Profile ─────────────────────────────────────────────── */
  const [profile, setProfile] = useState({ name: '', email: '', phone: '' });
  useEffect(() => {
    if (user) setProfile({ name: user.name || '', email: user.email || '', phone: user.phone || '' });
  }, [user]);
  const profileDirty = !!user && (profile.name !== (user.name || '') || profile.email !== (user.email || '') || profile.phone !== (user.phone || ''));

  const updateProfile = useMutation({
    mutationFn: () =>
      authService.updateMe({ name: profile.name.trim(), email: profile.email.trim() || undefined, phone: profile.phone.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      toast.success('Profile saved');
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to save profile')),
  });

  /* ── Password ────────────────────────────────────────────── */
  const [password, setPassword] = useState({ current: '', next: '', confirm: '' });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const changePassword = useMutation({
    mutationFn: () => authService.changePassword(password.current, password.next),
    onSuccess: () => {
      setPassword({ current: '', next: '', confirm: '' });
      setPasswordError(null);
      toast.success('Password changed');
    },
    onError: (err) => setPasswordError(errorMessage(err, 'Could not change the password. Check your current password.')),
  });
  const submitPassword = () => {
    if (!password.current) return setPasswordError('Enter your current password.');
    if (password.next.length < 6) return setPasswordError('The new password needs at least 6 characters.');
    if (password.next !== password.confirm) return setPasswordError('The two new passwords don’t match.');
    setPasswordError(null);
    changePassword.mutate();
  };

  /* ── Company ─────────────────────────────────────────────── */
  const [company, setCompany] = useState({ companyLegalName: '', vatNumber: '', crNumber: '', defaultCountryCode: 'SA', defaultCountryDialCode: '+966' });
  useEffect(() => {
    if (settings) {
      setCompany({
        companyLegalName: settings.companyLegalName || '',
        vatNumber: settings.vatNumber || '',
        crNumber: settings.crNumber || '',
        defaultCountryCode: settings.defaultCountryCode || 'SA',
        defaultCountryDialCode: settings.defaultCountryDialCode || '+966',
      });
    }
  }, [settings]);
  const companyDirty =
    !!settings &&
    (company.companyLegalName !== (settings.companyLegalName || '') ||
      company.vatNumber !== (settings.vatNumber || '') ||
      company.crNumber !== (settings.crNumber || '') ||
      company.defaultCountryCode !== (settings.defaultCountryCode || 'SA'));

  const updateCompany = useMutation({
    mutationFn: () => settingsService.update(company),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['settings', 'public'] });
      toast.success('Company details saved');
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to save company details')),
  });

  /* ── Region ──────────────────────────────────────────────── */
  const [timezone, setTimezone] = useState('Asia/Riyadh');
  useEffect(() => {
    if (settings) setTimezone(settings.timezone || 'Asia/Riyadh');
  }, [settings]);
  const localTime = useLocalTime(timezone);
  const updateTimezone = useMutation({
    mutationFn: () => settingsService.updateTimezone(timezone),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['settings', 'public'] });
      toast.success('Timezone saved. Dates across the app now use it.');
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to save timezone')),
  });

  const fieldClass = 'h-9 w-full sm:w-[280px]';

  return (
    <SettingsShell title="Account & company" description="Your own profile and password, and the company details used on invoices and documents.">
      <SettingsSection
        title="Your profile"
        description={user ? `Signed in as @${user.username ?? user.name} · ${user.role}${isSuperAdmin ? ' · Aprodac' : ''}` : undefined}
        action={<Btn label="Save" size="sm" disabled={!profileDirty || !profile.name.trim()} isLoading={updateProfile.isPending} onClick={() => updateProfile.mutate()} />}
      >
        <SettingsRow label="Full name" htmlFor="prof-name">
          <Input id="prof-name" value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} className={fieldClass} />
        </SettingsRow>
        <SettingsRow label="Email" description="Used for sign-in recovery and notifications." htmlFor="prof-email">
          <Input id="prof-email" type="email" value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} className={fieldClass} placeholder="name@company.com" />
        </SettingsRow>
        <SettingsRow label="Phone" htmlFor="prof-phone">
          <div className="w-full sm:w-[280px]">
            <PhoneInput id="prof-phone" value={profile.phone} onChange={(val) => setProfile((p) => ({ ...p, phone: val }))} placeholder="50 000 0000" />
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Password"
        description="At least 6 characters. You stay signed in on this device."
        action={
          <Btn
            label="Change password"
            size="sm"
            variant="outline"
            disabled={!password.current || !password.next || !password.confirm}
            isLoading={changePassword.isPending}
            onClick={submitPassword}
          />
        }
      >
        <SettingsRow label="Current password" htmlFor="pwd-current">
          <Input id="pwd-current" type="password" autoComplete="current-password" value={password.current} onChange={(e) => setPassword((p) => ({ ...p, current: e.target.value }))} className={fieldClass} />
        </SettingsRow>
        <SettingsRow label="New password" htmlFor="pwd-new">
          <Input id="pwd-new" type="password" autoComplete="new-password" value={password.next} onChange={(e) => setPassword((p) => ({ ...p, next: e.target.value }))} className={fieldClass} />
        </SettingsRow>
        <SettingsRow label="Repeat new password" htmlFor="pwd-confirm">
          <Input id="pwd-confirm" type="password" autoComplete="new-password" value={password.confirm} onChange={(e) => setPassword((p) => ({ ...p, confirm: e.target.value }))} className={fieldClass} />
        </SettingsRow>
        {passwordError && <p className="pt-3 text-xs font-semibold text-[#DC2626]" role="alert">{passwordError}</p>}
      </SettingsSection>

      <SettingsSection
        title="Company"
        description={isSuperAdmin ? 'Printed on invoices and quotations.' : 'Printed on invoices and quotations. Only Aprodac can change these.'}
        action={isSuperAdmin ? <Btn label="Save" size="sm" disabled={!companyDirty} isLoading={updateCompany.isPending} onClick={() => updateCompany.mutate()} /> : undefined}
      >
        <SettingsRow label="Legal name" htmlFor="co-name">
          <Input id="co-name" value={company.companyLegalName} readOnly={!isSuperAdmin} onChange={(e) => setCompany((c) => ({ ...c, companyLegalName: e.target.value }))} className={fieldClass} />
        </SettingsRow>
        <SettingsRow label="VAT number" description="15 digits, starting and ending with 3." htmlFor="co-vat">
          <Input id="co-vat" value={company.vatNumber} readOnly={!isSuperAdmin} inputMode="numeric" maxLength={15} onChange={(e) => setCompany((c) => ({ ...c, vatNumber: e.target.value }))} className={fieldClass} />
        </SettingsRow>
        <SettingsRow label="CR number" description="Commercial registration, 10 digits." htmlFor="co-cr">
          <Input id="co-cr" value={company.crNumber} readOnly={!isSuperAdmin} inputMode="numeric" maxLength={10} onChange={(e) => setCompany((c) => ({ ...c, crNumber: e.target.value }))} className={fieldClass} />
        </SettingsRow>
        <SettingsRow label="Default phone country" description="New phone fields for drivers and customers start with this code." htmlFor="co-country">
          <Select
            value={company.defaultCountryCode}
            disabled={!isSuperAdmin}
            onValueChange={(code) => {
              const found = COUNTRY_CODES.find((c) => c.code === code);
              setCompany((c) => ({ ...c, defaultCountryCode: code, defaultCountryDialCode: found?.dialCode || '+966' }));
            }}
          >
            <SelectTrigger id="co-country" className={fieldClass}><SelectValue /></SelectTrigger>
            <SelectContent>
              {COUNTRY_CODES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.flag} {c.name} ({c.dialCode})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Region & time"
        description={canEditTimezone ? 'Every date and time in the app is shown in this timezone.' : 'Every date and time in the app is shown in this timezone. Only admins can change it.'}
        action={
          canEditTimezone ? (
            <Btn label="Save" size="sm" disabled={!settings || timezone === settings.timezone} isLoading={updateTimezone.isPending} onClick={() => updateTimezone.mutate()} />
          ) : undefined
        }
      >
        <SettingsRow label="Timezone" description={`Now: ${localTime}`} htmlFor="tz">
          <Select value={timezone} onValueChange={setTimezone} disabled={!canEditTimezone}>
            <SelectTrigger id="tz" className={fieldClass}><SelectValue /></SelectTrigger>
            <SelectContent>
              {COMMON_TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>{tz}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsSection>
    </SettingsShell>
  );
}
