import React from 'react';
import {
  Filter,
  Calendar as CalendarIcon,
  ArrowDown,
  ArrowUp,
  User,
  Search,
  X,
} from 'lucide-react';
import { DriverStatus } from '@/services/driverService';
import { SortDropdown, SortOption } from '@/components/ui/SortDropdown';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type DriverSortOption =
  | 'latest'
  | 'oldest'
  | 'name_asc'
  | 'name_desc'
  | 'license_asc'
  | 'status';

export const DRIVER_SORT_OPTIONS: SortOption<DriverSortOption>[] = [
  { value: 'latest', label: 'Newest Added', icon: <ArrowDown className="w-3.5 h-3.5 text-blue-600" /> },
  { value: 'oldest', label: 'Oldest Added', icon: <ArrowUp className="w-3.5 h-3.5 text-amber-600" /> },
  { value: 'name_asc', label: 'Driver Name (A → Z)', icon: <User className="w-3.5 h-3.5 text-purple-600" /> },
  { value: 'name_desc', label: 'Driver Name (Z → A)', icon: <User className="w-3.5 h-3.5 text-purple-600" /> },
  { value: 'license_asc', label: 'License Expiry (Soonest)', icon: <CalendarIcon className="w-3.5 h-3.5 text-rose-500" /> },
  { value: 'status', label: 'Duty Status', icon: <Filter className="w-3.5 h-3.5 text-slate-500" /> },
];

export interface DriverFilterToolbarProps {
  search?: string;
  onSearchChange?: (val: string) => void;
  selectedStatus: DriverStatus | 'All';
  onStatusChange: (status: DriverStatus | 'All') => void;
  licenseFilter: 'All' | 'Valid' | 'Expired';
  onLicenseFilterChange: (filter: 'All' | 'Valid' | 'Expired') => void;
  sortOrder: DriverSortOption;
  onSortOrderChange: (sort: DriverSortOption) => void;
  className?: string;
  showSearchOnly?: boolean;
}

export function DriverFilterToolbar({
  search,
  onSearchChange,
  selectedStatus,
  onStatusChange,
  licenseFilter,
  onLicenseFilterChange,
  sortOrder,
  onSortOrderChange,
  className,
  showSearchOnly = false,
}: DriverFilterToolbarProps) {
  if (showSearchOnly) {
    if (onSearchChange === undefined) return null;
    return (
      <div className="relative w-full sm:w-72 lg:w-88 shrink-0">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          type="text"
          placeholder="Search driver ID, name, phone..."
          value={search || ''}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-8.5 pr-8 h-9 text-xs bg-white dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700 focus-visible:ring-brand/20 focus-visible:border-brand rounded-md font-medium"
          aria-label="Search Drivers"
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
            aria-label="Clear search"
          >
            <X size={12} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {onSearchChange !== undefined && (
        <div className="relative w-full sm:w-60 md:w-72 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search driver ID, name, phone..."
            value={search || ''}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9 text-xs bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 font-semibold"
          />
          {search && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      <Select
        value={selectedStatus}
        onValueChange={(val) => {
          if (val) {
            onStatusChange(val as DriverStatus | 'All');
          }
        }}
      >
        <SelectTrigger className="h-9 px-3 w-40 shrink-0 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
            <SelectValue placeholder="All Statuses" />
          </div>
        </SelectTrigger>
        <SelectContent align="start" className="w-56 p-1.5 shadow-lg border border-slate-200 bg-white rounded-xl">
          <SelectGroup>
            <SelectLabel className="text-[10px] font-bold tracking-wider uppercase text-slate-400 px-2 py-1">
              Filter Duty Status
            </SelectLabel>
            <SelectItem value="All" className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md">
              <span className="flex items-center gap-2 font-medium text-slate-700 font-semibold">
                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                All Statuses
              </span>
            </SelectItem>
          </SelectGroup>
          <SelectSeparator className="my-1 border-slate-100" />
          <SelectGroup>
            <SelectItem value="Available" className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md">
              <span className="flex items-center gap-2 font-medium text-emerald-700 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                Available
              </span>
            </SelectItem>
            <SelectItem value="OnTrip" className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md">
              <span className="flex items-center gap-2 font-medium text-blue-700 font-semibold">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                On Trip
              </span>
            </SelectItem>
            <SelectItem value="OffDuty" className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md">
              <span className="flex items-center gap-2 font-medium text-slate-700 font-semibold">
                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                Off Duty
              </span>
            </SelectItem>
            <SelectItem value="Inactive" className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md">
              <span className="flex items-center gap-2 font-medium text-rose-700 font-semibold">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                Inactive
              </span>
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <Select
        value={licenseFilter}
        onValueChange={(val) => {
          if (val) {
            onLicenseFilterChange(val as 'All' | 'Valid' | 'Expired');
          }
        }}
      >
        <SelectTrigger className="h-9 px-3 w-40 shrink-0 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
            <SelectValue placeholder="License Expiry" />
          </div>
        </SelectTrigger>
        <SelectContent align="start" className="w-48 p-1.5 shadow-lg border border-slate-200 bg-white rounded-xl">
          <SelectGroup>
            <SelectLabel className="text-[10px] font-bold tracking-wider uppercase text-slate-400 px-2 py-1">
              License Status
            </SelectLabel>
            <SelectItem value="All" className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md">All Licenses</SelectItem>
            <SelectItem value="Valid" className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md">Valid Licenses</SelectItem>
            <SelectItem value="Expired" className="cursor-pointer text-xs font-medium py-1.5 px-2 rounded-md text-rose-600 font-semibold">Expired Licenses</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <SortDropdown
        value={sortOrder}
        onChange={onSortOrderChange}
        options={DRIVER_SORT_OPTIONS}
      />
    </div>
  );
}
