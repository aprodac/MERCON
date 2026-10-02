import { useEffect, useState } from 'react';
import { Eye, EyeOff, Headset, Shield, ShieldCheck } from 'lucide-react';
import type { UserRole } from '@mercon/shared-types';

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Switch } from '@/components/ui/switch';
import Btn from '@/components/ui/Btn';
import { cn } from '@/lib/utils';
import type { UserDTO } from '@/services/userService';

/** Roles a person can be given from this form. Drivers are created in the Drivers module. */
type StaffRole = Extract<UserRole, 'Admin' | 'Operator'>;

const ROLE_OPTIONS: { id: StaffRole; label: string; icon: typeof Shield; active: string }[] = [
  { id: 'Operator', label: 'Operator', icon: Headset, active: 'bg-[#E6F1FB] text-[#0C447C] dark:bg-[#0C447C]/40 dark:text-[#B5D4F4]' },
  { id: 'Admin', label: 'Admin', icon: Shield, active: 'bg-[#EEEDFE] text-[#3C3489] dark:bg-[#3C3489]/40 dark:text-[#CECBF6]' },
];

interface UserFormSheetProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<UserDTO> & { password?: string }) => void;
  user?: UserDTO | null;
  saving: boolean;
  canManageSuperAdmin?: boolean;
}

const inputCls =
  'w-full h-9 px-3 text-sm rounded-lg border border-input bg-background text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-foreground/30 focus:ring-2 focus:ring-ring/20';

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-[#FA634E]"> *</span>}
      </span>
      {children}
      {error && <span className="block text-[11px] font-medium text-rose-600">{error}</span>}
    </label>
  );
}

export default function UserFormSheet({ open, onClose, onSave, user, saving, canManageSuperAdmin }: UserFormSheetProps) {
  const editing = Boolean(user);
  const [role, setRole] = useState<StaffRole>('Operator');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRole(user?.role === 'Admin' || user?.role === 'SuperAdmin' ? 'Admin' : 'Operator');
    setName(user?.name ?? '');
    setUsername(user?.username?.replace(/^@/, '') ?? '');
    setPhone(user?.phone ?? '');
    setPassword('');
    setConfirm('');
    setShowPassword(false);
    setIsSuperAdmin(Boolean(user?.isSuperAdmin));
    setTouched(false);
  }, [open, user]);

  const errors = {
    name: !name.trim() ? 'Enter a name' : '',
    username: !username.trim() ? 'Enter a username' : '',
    phone: phone.replace(/\D/g, '').length < 6 ? 'Enter a phone number' : '',
    password: !editing && !password ? 'Set a password' : password && password.length < 6 ? 'At least 6 characters' : '',
    confirm: password && password !== confirm ? "Passwords don't match" : '',
  };
  const valid = Object.values(errors).every((e) => !e);
  const show = (key: keyof typeof errors) => (touched ? errors[key] : '');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    onSave({
      name: name.trim(),
      username: username.trim().replace(/^@/, ''),
      // Stored without spaces (+966500000000) — that's the form the login lookup matches.
      phone: phone.replace(/[^\d+]/g, ''),
      role,
      ...(password ? { password } : {}),
      ...(editing ? {} : { status: 'Active' as const }),
      ...(editing && canManageSuperAdmin ? { isSuperAdmin: role === 'Admin' && isSuperAdmin } : {}),
    });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-[420px] p-0 flex flex-col gap-0">
        <form onSubmit={submit} className="flex flex-col h-full">
          <div className="px-5 h-14 flex items-center border-b border-border shrink-0">
            <SheetTitle className="text-base font-semibold">{editing ? 'Edit user' : 'New user'}</SheetTitle>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Role</span>
              <div role="radiogroup" aria-label="Role" className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-muted">
                {ROLE_OPTIONS.map((r) => {
                  const active = role === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setRole(r.id)}
                      className={cn(
                        'h-8 rounded-md inline-flex items-center justify-center gap-1.5 text-sm font-medium transition-colors',
                        active ? cn(r.active, 'shadow-xs') : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <r.icon size={14} /> {r.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Full name" required error={show('name')}>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Sara Rahman" autoFocus />
              </Field>
              <Field label="Username" required error={show('username')}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
                  <input
                    className={cn(inputCls, 'pl-7')}
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/\s+/g, '').toLowerCase())}
                    placeholder="sara"
                  />
                </div>
              </Field>
            </div>

            <Field label="Phone" required error={show('phone')}>
              <PhoneInput value={phone} onChange={setPhone} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={editing ? 'New password' : 'Password'} required={!editing} error={show('password')}>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className={cn(inputCls, 'pr-9')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={editing ? 'Unchanged' : '••••••'}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </Field>
              <Field label="Confirm" required={!editing} error={show('confirm') || (confirm ? errors.confirm : '')}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className={inputCls}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••"
                  autoComplete="new-password"
                  disabled={!password}
                />
              </Field>
            </div>

            {editing && canManageSuperAdmin && role === 'Admin' && (
              <label className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/30 px-3 py-2.5 cursor-pointer">
                <span className="inline-flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
                  <ShieldCheck size={15} /> Aprodac super admin
                </span>
                <Switch checked={isSuperAdmin} onCheckedChange={setIsSuperAdmin} />
              </label>
            )}
          </div>

          <div className="px-5 py-3 border-t border-border flex justify-end gap-2 shrink-0 bg-muted/30">
            <Btn variant="outline" label="Cancel" onClick={onClose} disabled={saving} />
            <Btn type="submit" label={saving ? 'Saving…' : editing ? 'Save' : 'Create user'} disabled={saving} />
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
