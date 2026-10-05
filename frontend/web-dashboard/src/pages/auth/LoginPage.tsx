import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowUp, Check, Eye, EyeOff, Loader2, WifiOff } from 'lucide-react';
import { authStore, type RememberedUser } from '@/store/authStore';
import { authService } from '@/services/authService';
import { cn } from '@/lib/utils';

/**
 * Staff sign-in. A framed card: a Saudi road at dusk on the left (a short
 * banner on tablets and phones, hidden on short landscape screens), a calm
 * form on the right. Light only for now.
 *
 * - Remembers who signed in last on this browser ("Welcome back · Not you?").
 * - "Keep me signed in" really decides where the session lives (see authStore).
 * - Plain errors: wrong details, too many attempts (with a live countdown from
 *   the server's rate-limit headers), can't reach the server.
 * - Caps Lock warning, show / hide password, DEV badge on the test site.
 */

type ErrorState =
  | { kind: 'wrong'; triesLeft: number | null }
  | { kind: 'missing'; field: 'username' | 'password' }
  | { kind: 'locked'; until: number }
  | { kind: 'offline' }
  | { kind: 'other'; message: string };

const isTestSite = () => /^(dev\.|localhost|127\.)/.test(window.location.hostname);
const initials = (name: string) =>
  name.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

export default function LoginPage() {
  const navigate = useNavigate();
  const [remembered, setRemembered] = useState<RememberedUser | null>(() => authStore.getRememberedUser());
  const [username, setUsername] = useState(() => authStore.getRememberedUser()?.username ?? '');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [keep, setKeep] = useState(true);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const [now, setNow] = useState(Date.now());
  const userRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (authStore.isAuthenticated()) navigate('/', { replace: true });
  }, [navigate]);

  useEffect(() => {
    (remembered ? pwRef : userRef).current?.focus();
  }, [remembered]);

  // Live countdown while sign-in is paused.
  const lockedLeft = error?.kind === 'locked' ? Math.max(0, Math.ceil((error.until - now) / 1000)) : 0;
  useEffect(() => {
    if (error?.kind !== 'locked') return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= error.until) setError(null);
    }, 1000);
    return () => clearInterval(t);
  }, [error]);

  const notYou = () => {
    authStore.setRememberedUser(null);
    setRemembered(null);
    setUsername('');
    setPassword('');
    setError(null);
  };

  const onCaps = (e: React.KeyboardEvent<HTMLInputElement>) => setCapsOn(e.getModifierState?.('CapsLock') ?? false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || lockedLeft > 0) return;
    setError(null);
    if (!username.trim()) {
      setError({ kind: 'missing', field: 'username' });
      userRef.current?.focus();
      return;
    }
    if (!password) {
      setError({ kind: 'missing', field: 'password' });
      pwRef.current?.focus();
      return;
    }
    setLoading(true);
    try {
      const { user } = await authService.login({ username: username.trim(), password }, keep);
      authStore.setRememberedUser(keep ? { username: user.username, name: user.name ?? null, role: user.role } : null);
      setDone(true);
      setTimeout(() => navigate('/'), 450);
    } catch (err: any) {
      const status = err?.response?.status;
      if (!err?.response) setError({ kind: 'offline' });
      else if (status === 401) {
        // The server counts failed tries per account; warn when few are left.
        const left = Number(err.response.headers?.['ratelimit-remaining']);
        setError({ kind: 'wrong', triesLeft: Number.isFinite(left) && left <= 3 ? left : null });
      }
      else if (status === 429) {
        const reset = Number(err.response.headers?.['ratelimit-reset']);
        setNow(Date.now());
        setError({ kind: 'locked', until: Date.now() + (Number.isFinite(reset) && reset > 0 ? reset : 15 * 60) * 1000 });
      } else setError({ kind: 'other', message: err?.response?.data?.error?.message || 'Sign-in failed. Please try again.' });
      setPassword('');
      pwRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const mmss = `${Math.floor(lockedLeft / 60)}:${String(lockedLeft % 60).padStart(2, '0')}`;
  const pwBad = error?.kind === 'wrong' || (error?.kind === 'missing' && error.field === 'password');
  const userBad = error?.kind === 'missing' && error.field === 'username';
  const field =
    'h-12 w-full rounded-xl border bg-[#f4f5f6] px-4 text-base sm:text-[15px] font-medium text-[#2d2b2c] outline-none transition-[border-color,box-shadow,background] placeholder:text-[#a3a0a1] hover:border-[#cfd1d4] focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15';

  return (
    <div
      className="min-h-[100dvh] bg-white sm:grid sm:bg-[#eceef0] sm:place-items-center sm:px-6 sm:py-6"
      style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif", colorScheme: 'light' }}
    >
      <div className="mx-auto grid min-h-[100dvh] w-full max-w-[1180px] grid-cols-1 bg-white sm:min-h-0 sm:rounded-[28px] sm:p-2.5 sm:shadow-[0_24px_70px_-28px_rgba(45,43,44,0.28)] lg:min-h-[min(700px,calc(100dvh-48px))] lg:grid-cols-[1.05fr_1fr]">
        {/* ── The scene: a Saudi road at dusk ── */}
        <section
          aria-label="MERCON Logistics"
          className="relative hidden h-60 overflow-hidden rounded-[18px] text-white sm:block lg:h-auto lg:min-h-[560px] lg:rounded-[20px] [@media(max-height:560px)_and_(orientation:landscape)]:hidden"
          style={{ background: 'linear-gradient(180deg,#1c1a1b 0%,#2d2b2c 34%,#6b3a33 58%,#e8714c 76%,#3a2722 86%,#221b1b 100%)' }}
        >
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-1/2"
            style={{
              backgroundImage:
                'radial-gradient(1px 1px at 12% 20%,rgba(255,255,255,.7) 50%,transparent 51%),radial-gradient(1px 1px at 34% 12%,rgba(255,255,255,.5) 50%,transparent 51%),radial-gradient(1.5px 1.5px at 58% 26%,rgba(255,255,255,.6) 50%,transparent 51%),radial-gradient(1px 1px at 76% 9%,rgba(255,255,255,.5) 50%,transparent 51%),radial-gradient(1px 1px at 88% 30%,rgba(255,255,255,.4) 50%,transparent 51%)',
            }}
          />
          <div aria-hidden className="absolute bottom-[14%] left-1/2 h-[46%] w-[140%] -translate-x-1/2" style={{ background: 'radial-gradient(ellipse at center,rgba(255,160,110,.5),rgba(255,160,110,0) 65%)' }} />
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-[52%] sm:h-[40%] lg:h-[46%]"
            style={{ background: "url('/login-road.webp') left bottom / cover no-repeat", filter: 'saturate(.85) brightness(.82)' }}
          />
          <div className="absolute inset-x-5 top-5 sm:inset-x-8 sm:top-7 lg:inset-x-10 lg:top-9">
            <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/75 sm:text-xs">
              <span className="size-1.5 rounded-full bg-brand shadow-[0_0_0_4px_rgba(250,99,78,.25)]" /> MERCON Logistics
            </span>
            <h2 className="mt-2.5 text-2xl font-extrabold tracking-tight sm:mt-3.5 sm:text-3xl lg:mt-4 lg:text-[38px] lg:leading-[1.12]">Operations portal</h2>
            <p className="mt-2 hidden max-w-[40ch] text-[15px] leading-relaxed text-white/70 sm:block">For the MERCON team: trips, drivers, fleet and billing.</p>
          </div>
          <span className="absolute bottom-6 left-10 hidden text-xs font-semibold tracking-wide text-white/70 lg:block">Authorised staff only</span>
        </section>

        {/* ── The form ── */}
        <main className="flex flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-8 sm:pb-6 sm:pt-7 lg:px-11 lg:pb-6 lg:pt-7">
          <div className="flex items-center justify-between">
            <img src="/mercon-mark.webp" alt="MERCON" className="h-9 w-auto sm:h-10" />
            {isTestSite() && (
              <span title="You're on the test site — changes here don't affect live data" className="rounded-md bg-[#fff1c7] px-2 py-0.5 text-[11px] font-bold tracking-wide text-[#8a5a00]">
                DEV
              </span>
            )}
          </div>

          <div className="flex flex-1 items-center justify-center py-6 sm:py-10 lg:py-4">
            <div className="w-full max-w-[400px]">
              <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-[#2d2b2c] sm:text-[30px]">{remembered ? 'Welcome back' : 'Sign in'}</h1>
              <p className="mt-1 text-[14.5px] text-[#6e6a6b]">{remembered ? 'Enter your password to continue.' : 'Use your MERCON username or phone number.'}</p>

              {remembered && (
                <div className="mt-6 flex items-center gap-3 rounded-2xl border border-[#e4e5e7] px-3 py-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#fff0ec] text-[13px] font-bold text-[#d24a2c]">{initials(remembered.name || remembered.username)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[#2d2b2c]">{remembered.name || remembered.username}</span>
                    <span className="block truncate text-xs text-[#6e6a6b]">{remembered.username} · {remembered.role}</span>
                  </span>
                  <button type="button" onClick={notYou} className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#6e6a6b] hover:bg-[#f4f5f6] hover:text-[#2d2b2c]">
                    Not you?
                  </button>
                </div>
              )}

              <form onSubmit={submit} noValidate className="mt-5 grid gap-4">
                {error && (
                  <div
                    role="alert"
                    className={cn('flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[13px] leading-snug', error.kind === 'offline' ? 'bg-[#fff4e0] text-[#92400e]' : 'bg-[#fdecec] text-[#c53030]')}
                  >
                    {error.kind === 'offline' ? <WifiOff className="mt-px size-4 shrink-0" /> : <AlertCircle className="mt-px size-4 shrink-0" />}
                    <span>
                      {error.kind === 'wrong' && (
                        <>
                          <b className="block font-semibold">That username or password isn't right.</b>
                          {error.triesLeft === null
                            ? 'Check them and try again.'
                            : error.triesLeft === 0
                              ? 'That was the last try. Sign-in is paused for 15 minutes.'
                              : `${error.triesLeft} ${error.triesLeft === 1 ? 'try' : 'tries'} left before a 15-minute pause.`}
                        </>
                      )}
                      {error.kind === 'missing' && <b className="font-semibold">{error.field === 'username' ? 'Enter your username or phone number.' : 'Enter your password.'}</b>}
                      {error.kind === 'locked' && (<><b className="block font-semibold">Too many attempts.</b>For your security, try again in <span className="font-bold tabular-nums">{mmss}</span>.</>)}
                      {error.kind === 'offline' && (<><b className="block font-semibold">Can't reach MERCON.</b>Check your internet connection and try again.</>)}
                      {error.kind === 'other' && error.message}
                    </span>
                  </div>
                )}

                {!remembered && (
                  <div>
                    <label htmlFor="login-username" className="mb-2 block text-[13.5px] font-semibold text-[#2d2b2c]">Username or phone</label>
                    <input
                      id="login-username"
                      ref={userRef}
                      name="username"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={username}
                      onChange={(e) => { setUsername(e.target.value); setError(null); }}
                      placeholder="Your username or phone number"
                      aria-invalid={userBad}
                      className={cn(field, userBad ? 'border-[#c53030] ring-4 ring-[#c53030]/10' : 'border-[#e4e5e7]')}
                    />
                  </div>
                )}
                {/* Remembered user: still sent as a hidden username for password managers. */}
                {remembered && <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />}

                <div>
                  <label htmlFor="login-password" className="mb-2 block text-[13.5px] font-semibold text-[#2d2b2c]">Password</label>
                  <div className="relative">
                    <input
                      id="login-password"
                      ref={pwRef}
                      name="password"
                      type={showPw ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); if (error?.kind !== 'locked') setError(null); }}
                      onKeyDown={onCaps}
                      onKeyUp={onCaps}
                      placeholder="Enter your password"
                      aria-invalid={pwBad}
                      className={cn(field, 'pr-12', pwBad ? 'border-[#c53030] ring-4 ring-[#c53030]/10' : 'border-[#e4e5e7]')}
                    />
                    <button
                      type="button"
                      onClick={() => { setShowPw((v) => !v); pwRef.current?.focus(); }}
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                      className="absolute right-1.5 top-1.5 grid size-9 place-items-center rounded-lg text-[#6e6a6b] hover:bg-[#e4e5e7] hover:text-[#2d2b2c]"
                    >
                      {showPw ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                    </button>
                  </div>
                  {capsOn && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[#92400e]"><ArrowUp className="size-3.5" /> Caps Lock is on</p>
                  )}
                </div>

                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <label className="flex cursor-pointer items-start gap-2.5 text-[13.5px] text-[#2d2b2c]">
                    <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="mt-0.5 size-[17px] accent-brand" />
                    <span>
                      Keep me signed in
                      <small className="mt-0.5 block text-[11.5px] text-[#6e6a6b]">{keep ? 'On this computer for 7 days' : 'Until you close the browser'}</small>
                    </span>
                  </label>
                  <a href="/forgot-password" className="text-[13.5px] font-semibold text-[#d24a2c] hover:underline">Forgot password?</a>
                </div>

                <button
                  type="submit"
                  disabled={loading || lockedLeft > 0 || done}
                  className={cn(
                    'mt-1 flex h-12 items-center justify-center gap-2.5 rounded-xl text-[15px] font-bold text-white transition-[background,transform,box-shadow] active:scale-[0.99] disabled:cursor-not-allowed',
                    done
                      ? 'bg-[#1f9d55] shadow-[0_10px_22px_-10px_rgba(31,157,85,.6)]'
                      : 'bg-brand shadow-[0_10px_22px_-10px_rgba(250,99,78,.7)] hover:bg-[#e8503b] disabled:opacity-55',
                  )}
                >
                  {done ? (<><Check className="size-4" strokeWidth={3} /> Signed in</>) : loading ? (<><Loader2 className="size-4 animate-spin" /> Signing in…</>) : 'Sign in'}
                </button>
              </form>
            </div>
          </div>

          <p className="text-center text-[12.5px] text-[#6e6a6b] lg:text-left">
            Trouble signing in? <b className="font-semibold text-[#2d2b2c]">Ask your MERCON Admin.</b>
          </p>
        </main>
      </div>
    </div>
  );
}
