import React from 'react';
import { cn } from '@/lib/utils';
import { DriverStatus } from '@/services/driverService';
import { Eye } from 'lucide-react';

interface DriverAvatarProps {
  src?: string | null;
  firstName?: string;
  lastName?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  status?: DriverStatus;
  showStatusDot?: boolean;
  previewable?: boolean;
  onPreview?: () => void;
}

const SIZE_MAP = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
  '2xl': 'w-24 h-24 text-2xl',
};

const STATUS_DOT_COLORS: Record<DriverStatus, string> = {
  Available: 'bg-emerald-500 ring-white dark:ring-slate-900',
  OnTrip: 'bg-blue-500 ring-white dark:ring-slate-900',
  OffDuty: 'bg-amber-500 ring-white dark:ring-slate-900',
  Inactive: 'bg-slate-400 ring-white dark:ring-slate-900',
};

import { getDriverAvatar } from '@/lib/driverAvatarMap';

export default function DriverAvatar({
  src,
  firstName = '',
  lastName = '',
  size = 'md',
  className,
  status,
  showStatusDot = false,
  previewable = false,
  onPreview,
}: DriverAvatarProps) {
  const [imageError, setImageError] = React.useState(false);
  const fullName = `${firstName} ${lastName}`.trim();
  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || 'DR';

  const sizeClass = SIZE_MAP[size] || SIZE_MAP.md;
  const isInteractive = previewable || !!onPreview;

  const handleClick = (e: React.MouseEvent) => {
    if (isInteractive && onPreview) {
      e.stopPropagation();
      onPreview();
    }
  };

  const avatarSrc = getDriverAvatar(src, fullName);

  return (
    <div
      onClick={handleClick}
      className={cn(
        'relative inline-block shrink-0 overflow-hidden group rounded-full',
        sizeClass,
        isInteractive && 'cursor-pointer hover:opacity-95 transition-all',
        className
      )}
      title={isInteractive ? 'Click to preview driver profile photo & details' : undefined}
    >
      {avatarSrc && !imageError ? (
        <img
          src={avatarSrc}
          alt={`${firstName} ${lastName}`.trim() || 'Driver avatar'}
          onError={() => setImageError(true)}
          className="w-full h-full object-cover rounded-full"
        />
      ) : (
        <div
          className={cn(
            'w-full h-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 flex items-center justify-center font-bold text-indigo-600 dark:text-indigo-400 select-none shadow-2xs rounded-full'
          )}
        >
          {initials}
        </div>
      )}

      {isInteractive && (
        <div className="absolute inset-0 rounded-[inherit] bg-charcoal-strong/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
          <Eye className="w-3.5 h-3.5" />
        </div>
      )}

      {showStatusDot && status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full ring-2 z-10',
            size === 'xs' || size === 'sm' ? 'w-2 h-2' : 'w-3 h-3',
            STATUS_DOT_COLORS[status] || 'bg-slate-400'
          )}
        />
      )}
    </div>
  );
}

