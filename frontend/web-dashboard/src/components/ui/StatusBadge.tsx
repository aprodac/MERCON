import { Check, Clock, AlertTriangle, XCircle, Wrench, Send, FileText, MapPin, Truck, ShieldCheck } from 'lucide-react';
import { Badge } from './badge';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  /** Text instead of the status's own — e.g. "Starting late" for a Delayed trip. */
  label?: string;
  className?: string;
}

export default function StatusBadge({ status, label: labelOverride, className }: StatusBadgeProps) {
  const normalized = (status || '').toLowerCase().replace(/[\s_-]+/g, '');
  
  let label = status;
  let Icon = Clock;
  let styleClass = "bg-slate-100 text-slate-700 border-slate-200/90 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";

  switch (normalized) {
    // Draft reads Draft, as in the operator app (it used to say Scheduled).
    case 'draft':
      label = 'Draft';
      Icon = FileText;
      styleClass = "bg-slate-100 text-slate-700 border-slate-200/90 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
      break;

    case 'scheduled':
    case 'dispatched':
    case 'offduty':
      label = 'Scheduled';
      Icon = Clock;
      styleClass = "bg-indigo-50 text-indigo-700 border-indigo-200/80 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800";
      break;

    case 'loading':
    case 'atpickup':
      label = 'Loading';
      Icon = MapPin;
      styleClass = "bg-sky-50 text-sky-700 border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800";
      break;

    case 'delayed':
      label = 'Delayed';
      Icon = AlertTriangle;
      styleClass = "bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800";
      break;

    case 'emergency':
      label = 'Emergency';
      Icon = AlertTriangle;
      styleClass = "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800";
      break;

    case 'intransit':
    case 'ontrip':
      label = 'In Transit';
      Icon = Truck;
      styleClass = "bg-amber-50 text-amber-800 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800";
      break;

    case 'atdelivery':
    case 'completed':
    case 'delivered':
    case 'verified':
      label = 'Completed';
      Icon = Check;
      styleClass = "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800";
      break;

    case 'active':
    case 'available':
      label = status;
      Icon = Check;
      styleClass = "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800";
      break;

    case 'invoiced':
    case 'paid':
      label = 'Invoiced';
      Icon = FileText;
      styleClass = "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800";
      break;

    case 'cancelled':
      label = 'Cancelled';
      Icon = XCircle;
      styleClass = "bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800";
      break;

    case 'maintenance':
    case 'inshop':
    case 'undermaintenance':
      label = 'Maintenance';
      Icon = Wrench;
      styleClass = "bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800";
      break;

    case 'overdue':
    case 'expired':
    case 'rejected':
    case 'inactive':
    case 'highrisk':
      label = status;
      Icon = AlertTriangle;
      styleClass = "bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800";
      break;

    default:
      label = status;
      Icon = Clock;
      styleClass = "bg-slate-100 text-slate-700 border-slate-200/90 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
      break;
  }

  return (
    <Badge 
      variant="outline"
      className={cn(
        "gap-1 text-[9.5px] font-bold leading-none px-1.5 py-0.5 rounded-full select-none inline-flex items-center border",
        styleClass,
        className
      )} 
    >
      <Icon size={10} className="stroke-[2.2] shrink-0" />
      <span>{labelOverride || label}</span>
    </Badge>
  );
}
