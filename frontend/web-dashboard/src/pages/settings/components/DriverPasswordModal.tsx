import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Driver } from '@/services/driverService';
import { driverPhotoUrl } from '@/lib/documents';
import { 
  KeyRound, 
  Smartphone, 
  ShieldCheck, 
  Eye, 
  EyeOff, 
  Sparkles, 
  Copy, 
  Check, 
  AlertTriangle, 
  Lock, 
  Info,
  CheckCircle2,
  XCircle,
  Loader2,
  Phone
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface DriverPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  driver: Driver | null;
  onSave: (driverId: string, password: string) => void;
  isLoading: boolean;
}

export default function DriverPasswordModal({
  isOpen,
  onClose,
  driver,
  onSave,
  isLoading,
}: DriverPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setShowConfirmPassword(false);
      setCopied(false);
      setErrorMsg('');
    }
  }, [isOpen, driver]);

  if (!driver) return null;

  const handleGeneratePassword = () => {
    // Generate a clean 6-digit numeric PIN for simple mobile login
    const randomPin = Math.floor(100000 + Math.random() * 900000).toString();
    setPassword(randomPin);
    setConfirmPassword(randomPin);
    setErrorMsg('');
    toast.success('Generated 6-digit mobile app PIN');
  };

  const handleCopyCredentials = () => {
    if (!password) return;
    const phone = driver.phone_primary || 'N/A';
    const text = `MERCON Mobile App Credentials:\nDriver: ${driver.first_name} ${driver.last_name}\nLogin Phone: ${phone}\nPassword: ${password}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Login credentials copied to clipboard');
    setTimeout(() => setCopied(false), 2500);
  };

  const getPasswordStrength = (pass: string) => {
    if (!pass) return { level: 0, label: '', color: 'bg-slate-200' };
    if (pass.length < 4) return { level: 1, label: 'Too short (min 4 chars)', color: 'bg-rose-500' };
    if (pass.length < 6) return { level: 2, label: 'Fair (6-digit PIN recommended)', color: 'bg-amber-500' };
    if (pass.length < 8) return { level: 3, label: 'Good', color: 'bg-blue-500' };
    return { level: 4, label: 'Strong', color: 'bg-emerald-500' };
  };

  const strength = getPasswordStrength(password);
  const isMatch = password.length >= 4 && confirmPassword.length >= 4 && password === confirmPassword;
  const isMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const isFormValid = password.length >= 4 && isMatch;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!password || password.length < 4) {
      setErrorMsg('Password must be at least 4 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    setErrorMsg('');
    onSave(driver.id, password);
  };

  const hasPhone = Boolean(driver.phone_primary && driver.phone_primary.trim().length > 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[500px] p-0 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-5 sm:p-6 pb-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3 pr-12">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-[#FA634E] flex items-center justify-center border border-rose-100 dark:border-rose-900/40 shrink-0">
              <KeyRound size={20} />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-black text-[#3E3C3D] dark:text-white tracking-tight leading-snug">
                {driver.hasAccountPassword ? 'Update Driver Password' : 'Set Mobile App Password'}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium leading-normal">
                Configure authentication details for MERCON Mobile App access
              </DialogDescription>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          {/* Driver Identity Card */}
          <div className="bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-3 flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {driverPhotoUrl(driver.avatar_url) ? (
                <img src={driverPhotoUrl(driver.avatar_url)} alt="" className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-[#1E293B] text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                  {driver.first_name?.[0]?.toUpperCase() || ''}{driver.last_name?.[0]?.toUpperCase() || ''}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-extrabold text-xs text-slate-900 dark:text-slate-100 truncate max-w-[160px] sm:max-w-none">
                    {driver.first_name} {driver.last_name}
                  </span>
                  {driver.ref_id && (
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                      #{driver.ref_id}
                    </span>
                  )}
                </div>
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                  <Phone size={11} className="text-slate-400 shrink-0" />
                  <span className="font-mono truncate">{driver.phone_primary || 'No phone number'}</span>
                </div>
              </div>
            </div>

            <div className="shrink-0">
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                driver.hasAccountPassword
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400'
                  : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300'
              }`}>
                <ShieldCheck size={10} />
                {driver.hasAccountPassword ? 'Active' : 'Pending Setup'}
              </span>
            </div>
          </div>

          {/* Login Note Banner */}
          {!hasPhone ? (
            <div className="text-xs bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-300 rounded-xl p-3 flex items-start gap-2.5 font-medium">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>Notice:</strong> Driver has no primary phone registered. Primary phone is required for mobile app authentication.
              </div>
            </div>
          ) : (
            <div className="text-xs bg-slate-100/70 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 rounded-xl p-3 flex items-center gap-2 font-medium">
              <Info className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="truncate">
                Driver logs in using <strong>{driver.phone_primary}</strong>
              </span>
            </div>
          )}

          {errorMsg && (
            <div className="text-xs text-rose-700 dark:text-rose-300 font-semibold bg-rose-50 dark:bg-rose-950/40 p-3 rounded-xl border border-rose-200 dark:border-rose-900/50 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Credentials Action Row */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 shrink-0">
              <Lock className="w-3.5 h-3.5 text-[#FA634E]" />
              <span>Password Setup</span>
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGeneratePassword}
                className="h-7 text-[11px] font-bold text-[#FA634E] border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg gap-1 px-2 cursor-pointer shrink-0"
              >
                <Sparkles className="w-3 h-3 text-[#FA634E]" />
                <span>Generate PIN</span>
              </Button>
              {password && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyCredentials}
                  className="h-7 text-[11px] font-semibold text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 rounded-lg gap-1 px-2 cursor-pointer shrink-0"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-slate-400" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </Button>
              )}
            </div>
          </div>

          {/* Password Field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
              <span>New Password <span className="text-rose-500">*</span></span>
              {password && (
                <span className="text-[11px] font-semibold text-slate-400">
                  {strength.label}
                </span>
              )}
            </div>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="Enter password or generate PIN"
                className="w-full pl-3.5 pr-10 h-10 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-800 rounded-xl font-medium focus-visible:ring-[#FA634E]/20 focus-visible:border-[#FA634E]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Strength Bar */}
            {password.length > 0 && (
              <div className="grid grid-cols-4 gap-1 pt-1">
                {[1, 2, 3, 4].map((step) => (
                  <div
                    key={step}
                    className={`h-1 rounded-full transition-all duration-300 ${
                      step <= strength.level ? strength.color : 'bg-slate-200 dark:bg-slate-800'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Confirm Password Field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
              <span>Confirm Password <span className="text-rose-500">*</span></span>
              {isMatch && (
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Passwords match
                </span>
              )}
              {isMismatch && (
                <span className="text-[11px] font-bold text-rose-500 flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> Passwords don't match
                </span>
              )}
            </div>
            <div className="relative">
              <Input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="Re-enter password to confirm"
                className={`w-full pl-3.5 pr-10 h-10 text-xs bg-white dark:bg-slate-900 rounded-xl font-medium focus-visible:ring-[#FA634E]/20 focus-visible:border-[#FA634E] ${
                  isMismatch
                    ? 'border-rose-400 focus-visible:ring-rose-500/20 focus-visible:border-rose-500'
                    : isMatch
                    ? 'border-emerald-400 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Dialog Footer */}
          <DialogFooter className="pt-4 border-t border-slate-100 dark:border-slate-800 gap-2 flex items-center justify-end sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="h-9 px-4 text-xs font-semibold rounded-xl border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={isLoading || !isFormValid}
              className="h-9 px-4 text-xs font-extrabold rounded-xl bg-[#FA634E] hover:bg-[#FA634E]/90 text-white shadow-2xs border-none flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{driver.hasAccountPassword ? 'Update Password' : 'Set Password'}</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
