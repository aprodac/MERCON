import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  AlertTriangle,
  RotateCw,
  ArrowUpRight,
  ShieldCheck,
  User,
  FileText,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

export interface ReminderItem {
  id: string;
  title: string;
  subtitle: string;
  isExpired?: boolean;
  isCritical?: boolean;
  category: 'Compliance' | 'Driver' | 'Permit' | 'Maintenance' | 'General';
  accentBorder: string; // e.g. 'border-l-rose-500'
  subtitleColor: string; // e.g. 'text-rose-500'
  badgeBg: string; // e.g. 'bg-rose-50 text-rose-600 border-rose-200'
  link?: string;
}

const DEFAULT_REMINDERS: ReminderItem[] = [
  {
    id: 'rem-1',
    title: 'Insurance Renewal - VSA-3871',
    subtitle: 'Expired 2 days ago',
    isExpired: true,
    category: 'Compliance',
    accentBorder: 'border-l-rose-500',
    subtitleColor: 'text-rose-500 font-semibold',
    badgeBg: 'bg-rose-50 text-rose-600 border-rose-200',
    link: '/documents/expiry',
  },
  {
    id: 'rem-2',
    title: 'Driver License - Mohammed Faizan',
    subtitle: 'Expires in 3 days',
    isCritical: true,
    category: 'Driver',
    accentBorder: 'border-l-amber-500',
    subtitleColor: 'text-amber-600 font-semibold',
    badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
    link: '/documents/expiry',
  },
  {
    id: 'rem-3',
    title: 'Vehicle Fitness - VRA-5510',
    subtitle: 'Expires in 5 days',
    isCritical: true,
    category: 'Compliance',
    accentBorder: 'border-l-emerald-500',
    subtitleColor: 'text-emerald-600 font-semibold',
    badgeBg: 'bg-rose-50 text-rose-600 border-rose-200',
    link: '/documents/expiry',
  },
  {
    id: 'rem-4',
    title: 'Permit - ERA-9380',
    subtitle: 'Expires in 12 days',
    category: 'Permit',
    accentBorder: 'border-l-blue-500',
    subtitleColor: 'text-blue-600 font-semibold',
    badgeBg: 'bg-blue-50 text-blue-600 border-blue-200',
    link: '/documents/expiry',
  },
  {
    id: 'rem-5',
    title: 'Insurance Renewal - DRA-6484',
    subtitle: 'Expires in 18 days',
    category: 'Compliance',
    accentBorder: 'border-l-rose-400',
    subtitleColor: 'text-rose-500 font-semibold',
    badgeBg: 'bg-rose-50 text-rose-600 border-rose-200',
    link: '/documents/expiry',
  },
];

interface ImportantRemindersWidgetProps {
  reminders?: ReminderItem[];
  className?: string;
  onRefresh?: () => Promise<void> | void;
}

export default function ImportantRemindersWidget({
  reminders = DEFAULT_REMINDERS,
  className = '',
  onRefresh,
}: ImportantRemindersWidgetProps) {
  const navigate = useNavigate();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAssistantDocked, setIsAssistantDocked] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mercon_assistant_docked_v1') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handleDockChange = () => {
      try {
        setIsAssistantDocked(localStorage.getItem('mercon_assistant_docked_v1') === 'true');
      } catch { /**/ }
    };
    window.addEventListener('mercon_assistant_dock_change', handleDockChange);
    return () => window.removeEventListener('mercon_assistant_dock_change', handleDockChange);
  }, []);

  const handleUndockAssistant = () => {
    try {
      localStorage.setItem('mercon_assistant_docked_v1', 'false');
    } catch { /**/ }
    window.dispatchEvent(new CustomEvent('mercon_assistant_dock_change'));
  };

  const expiredCount = reminders.filter((r) => r.isExpired).length;
  const criticalCount = reminders.filter((r) => r.isCritical).length;
  const upcomingCount = reminders.length - expiredCount - criticalCount;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (onRefresh) {
      await onRefresh();
    }
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Compliance':
        return <ShieldCheck className="w-2.5 h-2.5 shrink-0" />;
      case 'Driver':
        return <User className="w-2.5 h-2.5 shrink-0" />;
      case 'Permit':
        return <FileText className="w-2.5 h-2.5 shrink-0" />;
      default:
        return <Sparkles className="w-2.5 h-2.5 shrink-0" />;
    }
  };

  return (
    <div
      className={`bg-white rounded-[18px] border border-black/[0.06] shadow-sm overflow-hidden flex flex-col justify-between h-full ${className}`}
    >
      {/* ── Card Top Header ── */}
      <div>
        <div className="px-4 py-3 border-b border-black/[0.04] flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-500 fill-amber-500/20 shrink-0" />
            <span className="text-[12px] font-extrabold text-slate-800 tracking-tight">
              Important Reminders
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {expiredCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-rose-50 text-rose-600 border border-rose-200">
                <AlertTriangle className="w-2.5 h-2.5 stroke-[2.5]" />
                {expiredCount} Expired
              </span>
            )}

            <button
              onClick={() => navigate('/documents/expiry')}
              className="h-6 px-2 rounded-md bg-[#E8450F] hover:bg-[#C7380A] text-white text-[9px] font-extrabold flex items-center gap-0.5 shadow-2xs transition-all active:scale-95"
            >
              View All <ArrowUpRight className="w-2.5 h-2.5 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* ── Docked Operations Assistant Message Item ── */}
        {isAssistantDocked && (
          <div
            onClick={handleUndockAssistant}
            className="mx-3 my-2 p-2 bg-gradient-to-r from-orange-50 to-[#E8450F]/10 border border-[#E8450F]/30 rounded-xl flex items-center justify-between gap-2.5 hover:bg-orange-100/50 transition-all cursor-pointer group shadow-2xs"
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="relative shrink-0">
                <div className="w-8 h-8 rounded-[11px] bg-gradient-to-b from-[#ff8b72] to-brand shadow-2xs group-hover:scale-105 transition-transform grid place-items-center" aria-hidden="true">
                  <span className="flex gap-[5px]"><i className="block w-[3px] h-[7px] rounded-full bg-charcoal-strong" /><i className="block w-[3px] h-[7px] rounded-full bg-charcoal-strong" /></span>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-[11px] font-extrabold text-slate-900 leading-tight truncate">
                    Extra charges assistant
                  </p>
                  <span className="text-[8.5px] font-black px-1.5 py-0.5 rounded-full bg-[#E8450F] text-white whitespace-nowrap shrink-0 leading-none">
                    Hidden
                  </span>
                </div>
                <p className="text-[10px] font-semibold text-[#E8450F] mt-0.5 truncate">
                  Bring it back to check finished trips for extra charges
                </p>
              </div>
            </div>
            <span className="shrink-0 text-[9px] font-black text-[#E8450F] bg-white px-2 py-1 rounded-lg border border-orange-200 group-hover:bg-[#E8450F] group-hover:text-white transition-colors">
              Open ↗
            </span>
          </div>
        )}

        {/* ── Subheader / Status Summary Bar ── */}
        <div className="px-4 py-2 bg-slate-50/30 border-b border-slate-100 flex items-center justify-between text-[9px]">
          <div className="flex items-center gap-3 font-bold">
            <div className="flex items-center gap-1 text-slate-700">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              <span>{expiredCount} Expired</span>
            </div>
            <div className="flex items-center gap-1 text-slate-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span>{criticalCount} Critical</span>
            </div>
            <div className="flex items-center gap-1 text-slate-700">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <span>{upcomingCount} Upcoming</span>
            </div>
          </div>
          <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">
            {reminders.length} Active
          </span>
        </div>

        {/* ── List of Reminders ── */}
        <div className="divide-y divide-black/[0.04] max-h-[220px] overflow-y-auto">
          {reminders.map((r) => (
            <div
              key={r.id}
              onClick={() => navigate(r.link || '/documents/expiry')}
              className="px-4 py-2.5 hover:bg-slate-50/80 transition-colors cursor-pointer flex items-center justify-between gap-3 group"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div
                  className={`w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-slate-600 border ${r.badgeBg} shrink-0`}
                >
                  {getCategoryIcon(r.category)}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-slate-800 truncate leading-snug group-hover:text-[#E8450F] transition-colors">
                    {r.title}
                  </p>
                  <p className={`text-[10px] ${r.subtitleColor} truncate mt-0.5`}>
                    {r.subtitle}
                  </p>
                </div>
              </div>

              <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
            </div>
          ))}
        </div>
      </div>

      {/* ── Card Bottom Footer ── */}
      <div className="px-4 py-2 bg-slate-50/80 border-t border-black/[0.04] flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-400">
          Live compliance monitoring
        </span>
        <button
          onClick={() => navigate('/documents/expiry')}
          className="text-[10px] font-extrabold text-[#E8450F] hover:underline"
        >
          View Vault ↗
        </button>
      </div>
    </div>
  );
}
