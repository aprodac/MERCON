import { useState, useEffect } from 'react';
import { 
  Bell, 
  Truck, 
  Users, 
  Menu, 
  ArrowLeft, 
  CalendarRange, 
  Car, 
  Building2, 
  Wrench,
  Navigation,
  CheckCircle2,
  FileText,
  Layers,
  Receipt,
  Sparkles,
  MapPin,
  FolderOpen,
  BarChart3,
  TrendingUp,
  FileSpreadsheet,
  AlertTriangle,
  User,
  Palette,
  Activity,
  Shield,
  Settings,
  LayoutDashboard,
  Maximize,
  Minimize,
  Search,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

import { isTopLevelPath } from '@/config/navigation';
import { openCommandPalette } from '@/lib/navigation/navStore';
import PinnedBar from './PinnedBar';

interface HeaderProps {
  title?: string;
  icon?: React.ReactNode;
  breadcrumb?: string;
  hideBackButton?: boolean;
  onBackClick?: () => void;
  /** Opens the off-canvas sidebar — only rendered below lg */
  onMenuClick?: () => void;
}

interface RouteIconInfo {
  icon: React.ComponentType<{ className?: string; size?: number }>;
  colorClass: string;
}

function getRouteIcon(pathname: string, title?: string): RouteIconInfo | null {
  const path = pathname.toLowerCase();
  const t = (title || '').toLowerCase();

  // 1. Trips
  if (path.includes('/trips/monthly') || t.includes('monthly trip')) {
    return { icon: CalendarRange, colorClass: 'text-purple-600 dark:text-purple-400' };
  }
  if (path.includes('/trips') || t.includes('trip')) {
    if (path.includes('tracking') || t.includes('tracking')) {
      return { icon: Navigation, colorClass: 'text-orange-500 dark:text-orange-400' };
    }
    if (path.includes('completion') || t.includes('completion')) {
      return { icon: CheckCircle2, colorClass: 'text-emerald-500 dark:text-emerald-400' };
    }
    return { icon: Truck, colorClass: 'text-orange-500 dark:text-orange-400' };
  }

  // 2. Drivers
  if (path.includes('/drivers') || t.includes('driver')) {
    if (path.includes('document')) {
      return { icon: FileText, colorClass: 'text-emerald-600 dark:text-emerald-400' };
    }
    return { icon: Users, colorClass: 'text-emerald-500 dark:text-emerald-400' };
  }

  // 3. Vehicles
  if (path.includes('/vehicles') || t.includes('vehicle')) {
    if (path.includes('financial')) {
      return { icon: Receipt, colorClass: 'text-blue-600 dark:text-blue-400' };
    }
    if (path.includes('loading')) {
      return { icon: Layers, colorClass: 'text-blue-500 dark:text-blue-400' };
    }
    if (path.includes('document')) {
      return { icon: FileText, colorClass: 'text-blue-600 dark:text-blue-400' };
    }
    return { icon: Car, colorClass: 'text-blue-500 dark:text-blue-400' };
  }

  // 4. 3rd Party Fleet
  if (path.includes('/third-party') || t.includes('3rd party') || t.includes('provider')) {
    return { icon: Building2, colorClass: 'text-teal-600 dark:text-teal-400' };
  }

  // 5. Maintenance
  if (path.includes('/maintenance') || t.includes('maintenance')) {
    return { icon: Wrench, colorClass: 'text-rose-500 dark:text-rose-400' };
  }

  // 6. Customers
  if (path.includes('/customers') || t.includes('customer')) {
    return { icon: Building2, colorClass: 'text-indigo-600 dark:text-indigo-400' };
  }

  // 7. Quotations / Commercial
  if (path.includes('/quotations') || t.includes('quotation') || t.includes('commercial')) {
    if (path.includes('import')) {
      return { icon: Sparkles, colorClass: 'text-amber-500 dark:text-amber-400' };
    }
    return { icon: FileText, colorClass: 'text-amber-600 dark:text-amber-400' };
  }

  // 8. Locations
  if (path.includes('/locations') || t.includes('location')) {
    return { icon: MapPin, colorClass: 'text-rose-600 dark:text-rose-400' };
  }

  // 9. Taxonomy
  if (path.includes('/taxonomy') || t.includes('taxonomy')) {
    return { icon: Layers, colorClass: 'text-cyan-600 dark:text-cyan-400' };
  }

  // 10. Documents
  if (path.includes('/documents') || t.includes('document')) {
    return { icon: FolderOpen, colorClass: 'text-sky-600 dark:text-sky-400' };
  }

  // 11. Expenses
  if (path.includes('/expenses') || t.includes('expense')) {
    return { icon: Receipt, colorClass: 'text-emerald-600 dark:text-emerald-400' };
  }

  // 12. Reports
  if (path.includes('/reports') || path.includes('/report-builder') || t.includes('report')) {
    if (path.includes('delay')) return { icon: AlertTriangle, colorClass: 'text-amber-600 dark:text-amber-400' };
    if (path.includes('revenue')) return { icon: TrendingUp, colorClass: 'text-emerald-600 dark:text-emerald-400' };
    if (path.includes('company')) return { icon: FileSpreadsheet, colorClass: 'text-indigo-600 dark:text-indigo-400' };
    return { icon: BarChart3, colorClass: 'text-violet-600 dark:text-violet-400' };
  }

  // 13. Settings & Governance
  if (path.includes('/settings') || t.includes('setting')) {
    if (path.includes('profile')) return { icon: User, colorClass: 'text-slate-600 dark:text-slate-400' };
    if (path.includes('users')) return { icon: Users, colorClass: 'text-emerald-600 dark:text-emerald-400' };
    if (path.includes('governance') || path.includes('shield')) return { icon: Shield, colorClass: 'text-blue-600 dark:text-blue-400' };
    if (path.includes('branding')) return { icon: Palette, colorClass: 'text-pink-600 dark:text-pink-400' };
    if (path.includes('health')) return { icon: Activity, colorClass: 'text-emerald-500 dark:text-emerald-400' };
    return { icon: Settings, colorClass: 'text-slate-600 dark:text-slate-400' };
  }

  // 14. Notifications
  if (path.includes('/notifications') || t.includes('notification')) {
    return { icon: Bell, colorClass: 'text-amber-500 dark:text-amber-400' };
  }

  // 15. Dashboard fallback
  if (path === '/' || t.includes('dashboard')) {
    return { icon: LayoutDashboard, colorClass: 'text-orange-500 dark:text-orange-400' };
  }

  // Default fallback for MERCON logistics system
  return { icon: Truck, colorClass: 'text-orange-500 dark:text-orange-400' };
}

export default function Header({ title, icon, breadcrumb, hideBackButton, onBackClick, onMenuClick }: HeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isMainPage = isTopLevelPath(location.pathname);
  const shouldHideBack = hideBackButton ?? (isMainPage || title === 'Dashboard' || location.pathname === '/');
  const resolved = getRouteIcon(location.pathname, title);
  const ResolvedIcon = resolved?.icon;

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  // Global Keyboard Shortcut: Alt + T or Alt + N opens Create New Trip Modal from any page
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === 't' || key === 'n' || e.code === 'KeyT' || e.code === 'KeyN') {
          e.preventDefault();
          navigate('/trips/new');
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  return (
    <div className="shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 relative z-20 flex flex-col">
      {/* Primary Top Header Row */}
      <div className="px-3 sm:px-4 lg:px-6 h-[72px] lg:h-[88px] flex items-center justify-between gap-2 sm:gap-4">

        {/* Mobile: hamburger + back button + icon + current page title */}
        <div className="flex items-center gap-2.5 min-w-0 lg:hidden">
          <button
            onClick={onMenuClick}
            aria-label="Open navigation menu"
            className="p-2 -ml-1 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
          >
            <Menu size={20} />
          </button>
          {!shouldHideBack && (
            <button
              onClick={() => onBackClick ? onBackClick() : navigate(-1)}
              className="p-1.5 rounded-lg text-brand dark:text-orange-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all shrink-0 cursor-pointer shadow-2xs"
              title="Go Back"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="flex items-center gap-2.5 min-w-0">
            {icon ? (
              <span className="shrink-0 flex items-center text-[#FA634E] dark:text-orange-400">
                {icon}
              </span>
            ) : ResolvedIcon && resolved ? (
              <ResolvedIcon className={`w-5.5 h-5.5 shrink-0 ${resolved.colorClass}`} />
            ) : null}
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 truncate leading-tight">
                {title || 'MERCON'}
              </p>
              {breadcrumb && (
                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate leading-tight">{breadcrumb}</p>
              )}
            </div>
          </div>
        </div>

        {/* Desktop Left: Back button, Page Icon & Page Title */}
        <div className="hidden lg:flex items-center gap-2.5 min-w-0">
          {!shouldHideBack && (
            <button
              onClick={() => onBackClick ? onBackClick() : navigate(-1)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:text-brand dark:hover:text-brand transition-all cursor-pointer border border-slate-200 dark:border-slate-700 hover:border-brand/40 dark:hover:border-brand/40 shadow-2xs shrink-0 group"
              title="Go Back"
            >
              <ArrowLeft size={14} className="text-brand dark:text-orange-400 transition-transform group-hover:-translate-x-0.5 shrink-0" />
              <span>Back</span>
            </button>
          )}
          <div className="flex items-center gap-2.5 min-w-0">
            {!shouldHideBack && <span className="text-slate-300 dark:text-slate-600 font-light shrink-0">/</span>}
            {icon ? (
              <span className="shrink-0 flex items-center text-[#FA634E] dark:text-orange-400">
                {icon}
              </span>
            ) : ResolvedIcon && resolved ? (
              <ResolvedIcon className={`w-6 h-6 shrink-0 ${resolved.colorClass}`} />
            ) : null}
            {title && (
              <h1 className="font-black text-slate-900 dark:text-slate-100 text-lg xl:text-2xl tracking-tight truncate" title={title}>{title}</h1>
            )}
          </div>
        </div>

        {/* Right Side: Operations Navigation Bar & Notifications */}
        <div className="flex items-center gap-3 sm:gap-4 justify-end flex-1 shrink-0">
          <PinnedBar />

          {/* Command palette */}
          <button
            type="button"
            onClick={openCommandPalette}
            aria-label="Search or jump to (Ctrl+K)"
            title="Search or jump to (Ctrl+K)"
            className="hidden sm:inline-flex items-center gap-2 h-9 pl-2.5 pr-2 rounded-lg border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Search size={15} strokeWidth={1.75} />
            <span className="text-[13px] hidden xl:inline">Search</span>
            <kbd className="text-[10px] font-medium border border-border rounded px-1 text-muted-foreground">Ctrl K</kbd>
          </button>

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
            title={isFullscreen ? 'Exit full screen' : 'Enter full screen (F11)'}
            className="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-xl text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:text-brand dark:hover:text-brand transition-all shrink-0 cursor-pointer shadow-2xs"
          >
            {isFullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
          </button>

          {/* Notifications trigger (temporarily hidden) */}
          {/* 
          <Link to="/notifications" className="relative group shrink-0">
            <Bell className="w-5 h-5 text-slate-600 shrink-0" />
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-orange-600 text-white text-[9px] font-black flex items-center justify-center ring-2 ring-white dark:ring-slate-900 shadow-xs">
              8
            </span>
          </Link>
          */}
        </div>

      </div>

    </div>
  );
}
