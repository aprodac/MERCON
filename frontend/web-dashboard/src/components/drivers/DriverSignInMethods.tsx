/**
 * How a driver signs in to the driver app (backend mobileAuthController):
 *   · mobile number + licence number — always works
 *   · mobile number + app password   — once the office has set one
 *
 * Passwords are stored hashed (bcrypt), so no one can read one back — not the
 * office, not the server. To hand a driver a password, set a new one.
 */
import { CheckCircle2, CircleDashed } from 'lucide-react';
import { cn } from '@/lib/utils';

export function DriverSignInMethods({ phone, license, hasPassword, className }: {
  phone: string | null | undefined;
  license: string | null | undefined;
  hasPassword: boolean;
  className?: string;
}) {
  const mobile = (phone || '').replace(/[\s-]/g, '');
  return (
    <div className={cn('rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 p-3 space-y-2', className)}>
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">How the driver signs in</p>
      <div className="flex items-start gap-2 text-xs">
        <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
        <span className="text-slate-700 dark:text-slate-200">
          Mobile <span className="font-mono font-bold">{mobile || '—'}</span> + licence number{' '}
          <span className="font-mono font-bold">{license || '—'}</span>
          <span className="text-slate-500"> — always works</span>
        </span>
      </div>
      <div className="flex items-start gap-2 text-xs">
        {hasPassword ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" /> : <CircleDashed className="size-4 shrink-0 text-slate-400" />}
        <span className="text-slate-700 dark:text-slate-200">
          {hasPassword ? 'Mobile + app password — set' : 'App password — not set'}
          <span className="text-slate-500">
            {hasPassword
              ? ' (stored scrambled, so it can’t be shown — set a new one to change it)'
              : ' — only the licence number works for now'}
          </span>
        </span>
      </div>
    </div>
  );
}

export default DriverSignInMethods;
