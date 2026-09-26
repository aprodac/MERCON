import React from 'react';
import { STOP_ROLE_COLORS, STOP_ROLE_LABELS, type StopRole } from '@mercon/shared-types';
import { cn } from '@/lib/utils';

/**
 * Stop role markers for any route UI: origin/loading = blue, stops in
 * between = red, destination/delivery = green. Colours come from the shared
 * STOP_ROLE_COLORS, so every page stays consistent with the driver app.
 *
 * Pick the role with the shared helpers: stopRoleAt(index, legLength) for form
 * rows, timelineStopRole(node) for route_timeline nodes, tripStopRole(trip, stop)
 * for stored stops.
 */

export function stopRoleStyle(role: StopRole) {
  return STOP_ROLE_COLORS[role];
}

/** Small filled dot, e.g. next to a field label. */
export const StopRoleDot: React.FC<{ role: StopRole; className?: string; title?: string }> = ({ role, className, title }) => (
  <span
    className={cn('inline-block w-2 h-2 rounded-full shrink-0', className)}
    style={{ backgroundColor: STOP_ROLE_COLORS[role].main }}
    title={title ?? STOP_ROLE_LABELS[role]}
  />
);

/** Tinted pill, e.g. "Stop #1" or "Origin". Defaults to the role's label. */
export const StopRoleBadge: React.FC<{ role: StopRole; children?: React.ReactNode; className?: string }> = ({
  role,
  children,
  className,
}) => {
  const c = STOP_ROLE_COLORS[role];
  return (
    <span
      className={cn('inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded border shrink-0', className)}
      style={{ backgroundColor: c.soft, color: c.text, borderColor: `${c.main}40` }}
    >
      {children ?? STOP_ROLE_LABELS[role]}
    </span>
  );
};

/**
 * Tailwind class pairs for a role, for components that style with classNames.
 * Same colours as STOP_ROLE_COLORS (blue-600 / red-600 / green-600); the class
 * strings are written out in full so Tailwind generates them.
 */
const STOP_ROLE_CLASSES: Record<StopRole, { badge: string; solid: string }> = {
  origin: { badge: 'bg-blue-50 text-blue-700 border-blue-200', solid: 'bg-blue-600 text-white' },
  stop: { badge: 'bg-red-50 text-red-700 border-red-200', solid: 'bg-red-600 text-white' },
  destination: { badge: 'bg-green-50 text-green-700 border-green-200', solid: 'bg-green-600 text-white' },
};

export function stopRoleClasses(role: StopRole) {
  return STOP_ROLE_CLASSES[role];
}
