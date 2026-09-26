import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Lock, Eye, EyeOff, ArrowRight, Loader2, ShieldCheck, AlertCircle, Sparkles,
} from 'lucide-react';
import { authStore } from '@/store/authStore';
import { authService } from '@/services/authService';
import { useBranding } from '@/hooks/useBranding';
import BrandLogo from '@/components/ui/BrandLogo';

export default function LoginPage() {
  const navigate = useNavigate();
  const { data: branding } = useBranding();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authStore.isAuthenticated()) navigate('/', { replace: true });
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await authService.login({ username: username.trim(), password });
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="relative min-h-screen w-full flex items-center justify-center lg:justify-end px-4 sm:px-6 py-12 lg:pr-[10%] bg-charcoal/5 bg-cover bg-center overflow-hidden"
      style={{
        fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif",
        backgroundImage: 'url(/login-bg.webp)',
      }}
    >
      {/* Background ambient lighting effects for premium aesthetic */}
      <div className="absolute inset-0 bg-gradient-to-tr from-slate-950/20 via-transparent to-brand/5 pointer-events-none" />
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-brand/10 rounded-full blur-3xl pointer-events-none animate-pulse duration-1000" />
      <div className="absolute bottom-10 right-1/3 w-[350px] h-[350px] bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Bar Floating Brand Logo (Pure Logo, No Box Container) */}
      <div className="absolute top-5 right-5 sm:top-8 sm:right-10 z-20">
        <BrandLogo
          variant="login"
          className="h-10 sm:h-12 w-auto object-contain drop-shadow-sm"
        />
      </div>

      {/* Main Login Card Container */}
      <div className="relative w-full max-w-[420px] z-10 flex flex-col items-center animate-fade-in lg:-translate-y-2">
        {/* Glowing ambient border highlight */}
        <div className="absolute -inset-1 bg-gradient-to-r from-brand/30 via-orange-400/20 to-amber-500/25 rounded-[32px] blur-xl opacity-70 pointer-events-none" />

        <div className="relative w-full rounded-[28px] border border-slate-200/90 bg-white/95 backdrop-blur-xl p-7 sm:p-9 shadow-[0_32px_70px_-15px_rgba(15,23,42,0.16)] transition-all">
          {/* Header section */}
          <div className="text-left mb-6">
            <h1 className="text-3xl sm:text-[34px] font-extrabold text-slate-900 tracking-[-0.03em] leading-[1.15]">
              Sign in to your workspace
            </h1>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-2xl px-4 py-3.5 text-xs font-semibold bg-red-50 border border-red-200/90 text-red-700 shadow-sm animate-shake">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Username Input */}
            <div>
              <label className="block text-[13px] font-bold text-slate-700 mb-2 tracking-wide">
                Username
              </label>
              <div className="relative group">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-brand transition-colors duration-200">
                  <User className="w-[18px] h-[18px]" />
                </span>
                <input
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full h-12 pl-11 pr-4 rounded-xl bg-slate-50/80 hover:bg-slate-50 focus:bg-white text-[15px] font-medium text-slate-900 border border-slate-200/90 outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-brand focus:ring-4 focus:ring-brand/15 shadow-xs"
                  placeholder="admin"
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[13px] font-bold text-slate-700 tracking-wide">
                  Password
                </label>
                <a
                  href="/forgot-password"
                  className="text-[13px] font-semibold text-brand hover:text-brand-hover hover:underline transition-colors"
                >
                  Forgot password?
                </a>
              </div>
              <div className="relative group">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-brand transition-colors duration-200">
                  <Lock className="w-[18px] h-[18px]" />
                </span>
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-12 pl-11 pr-11 rounded-xl bg-slate-50/80 hover:bg-slate-50 focus:bg-white text-[15px] font-medium text-slate-900 border border-slate-200/90 outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-brand focus:ring-4 focus:ring-brand/15 shadow-xs"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg focus:outline-none"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                </button>
              </div>
            </div>

            {/* Remember Me Checkbox */}
            <div className="pt-1">
              <label className="flex items-center gap-3 select-none cursor-pointer w-fit group">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-brand focus:ring-brand/20 accent-brand cursor-pointer transition-all"
                />
                <span className="text-sm font-medium text-slate-600 group-hover:text-slate-900 transition-colors">
                  Keep me signed in
                </span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full h-12 rounded-xl text-white font-bold text-[15px] tracking-wide flex items-center justify-center gap-2.5 bg-gradient-to-r from-[#E8450F] via-[#EC521D] to-[#FF6B35] shadow-[0_8px_22px_-4px_rgba(232,69,15,0.45)] hover:shadow-[0_12px_28px_-4px_rgba(232,69,15,0.55)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] transition-all duration-200 disabled:opacity-60 cursor-pointer overflow-hidden"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span>Sign in</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
