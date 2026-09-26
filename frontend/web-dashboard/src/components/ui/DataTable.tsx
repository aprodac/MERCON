import React, { useState, useEffect } from 'react';
import { Search, Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CheckSquare, X, FileSearch } from 'lucide-react';
import Btn, { BtnVariant } from './Btn';
import { Button } from './button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';
import { Input } from './input';
import { Badge } from './badge';
import BulkActionBar from './BulkActionBar';
import { cn } from '@/lib/utils';

export interface Column<T> {
  /** Node rather than string so callers can render sortable header buttons. */
  header: React.ReactNode;
  accessor: (row: T, index: number) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  mobilePriority?: 'primary' | 'secondary' | 'meta' | 'hidden';
}

export interface BulkAction<T> {
  label: string;
  icon?: React.ReactNode;
  variant?: BtnVariant;
  className?: string;
  onClick: (selectedRows: T[], clearSelection: () => void) => void | Promise<void>;
}

export interface DataTableProps<T> {
  title?: React.ReactNode;
  subtitle?: string;
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  // Sorting
  sortAccessor?: (row: T) => any;
  // Filters & Action Slots
  filterElement?: React.ReactNode;
  actionsElement?: React.ReactNode;
  // Export Action
  onExport?: () => void;
  // Pagination
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  pageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  totalRecords?: number;
  // Selection
  enableSelection?: boolean;
  selectedIndices?: number[];
  onSelectionChange?: (selectedIndices: number[]) => void;
  getRowId?: (row: T, index: number) => string | number;
  selectionResetKey?: any;
  // Row Click
  onRowClick?: (row: T) => void;
  // Bulk Actions
  bulkActions?: BulkAction<T>[];
  // State overrides
  isError?: boolean;
  errorTitle?: string;
  errorMessage?: string;
  emptyTitle?: string;
  emptyMessage?: string;
  // Custom height/compactness
  compact?: boolean;
  tableClassName?: string;
  className?: string;
  hideRecordCount?: boolean;
  recordCountClassName?: string;
  isSelectionMode?: boolean;
  onSelectionModeChange?: (active: boolean) => void;
  hideSelectButton?: boolean;
  rowClassName?: (row: T) => string;
}

export const DataTableContent = function DataTable<T>({
  title,
  subtitle,
  columns,
  data,
  isLoading = false,
  isError = false,
  errorTitle = 'Data Unavailable',
  errorMessage = 'Failed to load records from the server. Please try again.',
  searchPlaceholder = 'Search records...',
  searchValue,
  hideRecordCount = false,
  recordCountClassName,
  onSearchChange,
  sortAccessor,
  filterElement,
  actionsElement,
  onExport,
  currentPage,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  totalRecords,
  enableSelection = true,
  selectedIndices: controlledIndices,
  onSelectionChange,
  getRowId,
  selectionResetKey,
  onRowClick,
  bulkActions = [],
  emptyTitle = 'No Records Found',
  emptyMessage = 'There are no entries matching your current filters or search query.',
  compact = true,
  tableClassName,
  className,
  isSelectionMode: controlledSelectionMode,
  onSelectionModeChange,
  hideSelectButton = false,
  rowClassName,
}: DataTableProps<T>) {
  // Internal state for client-side pagination when onPageChange is not passed
  const [internalPage, setInternalPage] = useState(1);
  const [internalPageSize, setInternalPageSize] = useState(pageSize || 10);
  const [selectedKeys, setSelectedKeys] = useState<Set<string | number>>(new Set());
  const [internalSearch, setInternalSearch] = useState('');
  const [internalSelectionMode, setInternalSelectionMode] = useState(false);

  const isSelectionMode = controlledSelectionMode !== undefined ? controlledSelectionMode : internalSelectionMode;
  const handleToggleSelectionMode = () => {
    const nextMode = !isSelectionMode;
    if (!nextMode) {
      clearSelection();
    }
    if (onSelectionModeChange) {
      onSelectionModeChange(nextMode);
    } else {
      setInternalSelectionMode(nextMode);
    }
  };

  const getRowKey = React.useCallback((row: T, index: number): string | number => {
    if (getRowId) return getRowId(row, index);
    if (row && typeof row === 'object') {
      if ('id' in row && (row as any).id != null) return String((row as any).id);
      if ('_id' in row && (row as any)._id != null) return String((row as any)._id);
      if ('ref_id' in row && (row as any).ref_id != null) return String((row as any).ref_id);
    }
    return index;
  }, [getRowId]);

  const clearSelection = React.useCallback(() => {
    setSelectedKeys(new Set());
    onSelectionChange?.([]);
  }, [onSelectionChange]);

  // Reset selection if selectionResetKey changes
  useEffect(() => {
    if (selectionResetKey !== undefined) {
      clearSelection();
    }
  }, [selectionResetKey, clearSelection]);

  // Prune any selected keys that no longer exist in data
  useEffect(() => {
    setSelectedKeys((prevKeys) => {
      if (prevKeys.size === 0) return prevKeys;
      const validKeySet = new Set(data.map((row, idx) => getRowKey(row, idx)));
      const nextKeys = new Set<string | number>();
      for (const key of prevKeys) {
        if (validKeySet.has(key)) {
          nextKeys.add(key);
        }
      }
      if (nextKeys.size !== prevKeys.size) {
        const nextIndices = data
          .map((row, idx) => (nextKeys.has(getRowKey(row, idx)) ? idx : -1))
          .filter(idx => idx !== -1);
        onSelectionChange?.(nextIndices);
        return nextKeys;
      }
      return prevKeys;
    });
  }, [data, getRowKey, onSelectionChange]);

  const activeSearchValue = searchValue !== undefined ? searchValue : internalSearch;

  const handleSearchChange = (val: string) => {
    setInternalSearch(val);
    onSearchChange?.(val);
  };

  useEffect(() => {
    if (onPageChange === undefined) {
      setInternalPage(1);
    }
  }, [data.length, activeSearchValue]);

  const isServerPaginated = onPageChange !== undefined;
  const activePage = isServerPaginated ? (currentPage || 1) : internalPage;
  const activePageSize = pageSize !== undefined ? pageSize : internalPageSize;

  const totalCount = totalRecords !== undefined ? totalRecords : data.length;
  const computedTotalPages = totalPages !== undefined 
    ? totalPages 
    : Math.max(1, Math.ceil(totalCount / activePageSize));

  const displayData = isServerPaginated
    ? data
    : data.slice((activePage - 1) * activePageSize, activePage * activePageSize);

  const handlePageChange = (newPage: number) => {
    const validPage = Math.max(1, Math.min(newPage, computedTotalPages));
    if (isServerPaginated) {
      onPageChange?.(validPage);
      clearSelection();
    } else {
      setInternalPage(validPage);
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    if (onPageSizeChange) {
      onPageSizeChange(newSize);
    } else {
      setInternalPageSize(newSize);
      setInternalPage(1);
    }
    if (isServerPaginated && onPageChange) {
      onPageChange(1);
    }
    clearSelection();
  };


  const handleSelectAll = () => {
    if (selectedKeys.size === data.length && data.length > 0) {
      clearSelection();
    } else {
      const newSet = new Set(data.map((row, i) => getRowKey(row, i)));
      setSelectedKeys(newSet);
      onSelectionChange?.(data.map((_, i) => i));
    }
  };

  const handleSelectRow = (key: string | number) => {
    const newSet = new Set(selectedKeys);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setSelectedKeys(newSet);
    const nextIndices = data
      .map((row, idx) => (newSet.has(getRowKey(row, idx)) ? idx : -1))
      .filter(idx => idx !== -1);
    onSelectionChange?.(nextIndices);
  };

  const fromIndex = totalCount === 0 ? 0 : (activePage - 1) * activePageSize + 1;
  const toIndex = totalCount === 0 ? 0 : Math.min(
    activePage * activePageSize,
    isServerPaginated ? (fromIndex + displayData.length - 1) : totalCount
  );

  const showToolbar = title || onSearchChange !== undefined || filterElement !== undefined || onExport !== undefined || actionsElement !== undefined || enableSelection;
  const getPlainHeader = (header: React.ReactNode, index: number) => {
    if (typeof header === 'string' || typeof header === 'number') return String(header);
    return `Field ${index + 1}`;
  };

  return (
    <div className={cn("bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col w-full animate-fade-in", className)}>
      
      {/* Table Toolbar Header */}
      {showToolbar && (
        <div className="shrink-0 p-3 sm:p-4 border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3 w-full">
          
          {/* Left Side: Title, Search & Filters */}
          <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0">
            {(title || !hideRecordCount) && (
              <div className="flex items-center gap-2 shrink-0">
                {title && (
                  typeof title === 'string' ? (
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                      {title}
                    </h3>
                  ) : (
                    title
                  )
                )}
                {!hideRecordCount && (
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "bg-orange-50/90 dark:bg-orange-950/40 text-[#FA634E] dark:text-orange-400 border-orange-200/80 dark:border-orange-800/60 text-[11px] font-mono font-bold px-2.5 py-0.5 shadow-2xs",
                      recordCountClassName
                    )}
                  >
                    {totalCount} {totalCount === 1 ? 'record' : 'records'}
                  </Badge>
                )}
              </div>
            )}

            {/* Search Bar */}
            {onSearchChange !== undefined && (
              <div className="relative w-full sm:w-64 lg:w-72 shrink-0">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={activeSearchValue}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="w-full pl-8.5 pr-8 h-9 text-xs bg-white dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700 focus-visible:ring-brand/20 focus-visible:border-brand rounded-md font-medium"
                  aria-label="Search Table"
                />
                {activeSearchValue && (
                  <button
                    onClick={() => handleSearchChange('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    aria-label="Clear search"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )}

            {/* Filters element */}
            {filterElement && (
              <div className="flex items-center flex-wrap gap-2 shrink-0 max-w-full">
                {filterElement}
              </div>
            )}
          </div>

          {/* Right Side: Actions Group (Select, Custom Actions, Export) */}
          <div className="flex items-center flex-wrap gap-2 shrink-0 ml-auto">
            {enableSelection && !hideSelectButton && (
              <Button
                variant={isSelectionMode ? "default" : "outline"}
                size="sm"
                onClick={handleToggleSelectionMode}
                className={cn(
                  "h-9 text-xs font-semibold px-3.5 rounded-xl shadow-2xs gap-1.5 transition-colors cursor-pointer",
                  isSelectionMode
                    ? "bg-brand hover:bg-brand-hover text-white border-brand"
                    : "border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                )}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>{isSelectionMode ? `Selecting (${selectedKeys.size})` : "Select"}</span>
              </Button>
            )}
            {actionsElement}
            {onExport && (
              <Btn
                label="Export"
                variant="secondary"
                size="sm"
                icon={<Download size={13} />}
                onClick={onExport}
              />
            )}
          </div>

        </div>
      )}

      {/* Main Table Container */}
      <div className="hidden md:block flex-1 overflow-x-auto min-h-0 w-full">
        <Table className={cn("w-full text-xs", tableClassName)} role="table">
          <TableHeader>
            <TableRow className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200/80 dark:border-slate-800 hover:bg-slate-50/80">
              {enableSelection && isSelectionMode && (
                <TableHead className={cn(compact ? "w-[32px] px-2" : "w-[40px] px-3")}>
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    checked={data.length > 0 && selectedKeys.size === data.length}
                    ref={(input) => {
                      if (input) {
                        input.indeterminate = selectedKeys.size > 0 && selectedKeys.size < data.length;
                      }
                    }}
                    onChange={handleSelectAll}
                    aria-label="Select all rows"
                    title={selectedKeys.size === data.length ? "Deselect All" : "Select All"}
                  />
                </TableHead>
              )}
              {columns.map((c, i) => (
                <TableHead key={i} className={cn("text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 h-8", compact ? "px-2 py-1.5" : "px-3 py-2", c.headerClassName)}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // Loading state skeleton rows
              Array.from({ length: activePageSize > 10 ? 10 : activePageSize }).map((_, rowIndex) => (
                <TableRow key={rowIndex} className="border-b border-slate-100 dark:border-slate-800/60">
                  {enableSelection && isSelectionMode && (
                    <TableCell className="px-3 py-2 w-[32px]">
                      <div className="h-4 skeleton w-4 rounded"></div>
                    </TableCell>
                  )}
                  {columns.map((_, colIndex) => (
                    <TableCell key={colIndex} className="px-3 py-2">
                      <div className="h-4 skeleton w-full max-w-[140px] rounded-md"></div>
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : isError ? (
              // Error State
              <TableRow>
                <TableCell colSpan={enableSelection && isSelectionMode ? columns.length + 1 : columns.length} className="text-center py-16">
                  <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                    <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center text-rose-500">
                      <X size={28} className="stroke-[2]" />
                    </div>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-2">{errorTitle}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 text-center max-w-xs">{errorMessage}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : displayData.length === 0 ? (
              // Empty State
              <TableRow>
                <TableCell colSpan={enableSelection && isSelectionMode ? columns.length + 1 : columns.length} className="text-center py-16">
                  <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                    <FileSearch size={36} className="text-slate-400 dark:text-slate-500 mb-1 stroke-[1.5]" />
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-2">{emptyTitle}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 text-center max-w-xs">{emptyMessage}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              // Data Rows
              displayData.map((row, rowIndex) => {
                const actualIndex = isServerPaginated ? rowIndex : (activePage - 1) * activePageSize + rowIndex;
                const rowKey = getRowKey(row, actualIndex);
                const isSelected = selectedKeys.has(rowKey);
                return (
                  <TableRow
                    key={String(rowKey)}
                    className={cn(
                      "animate-fade-in transition-colors border-b border-slate-100 dark:border-slate-800/60 focus-visible:bg-slate-50 dark:focus-visible:bg-slate-800/80 outline-none",
                      isSelected 
                        ? "bg-indigo-50/25 dark:bg-indigo-950/20 hover:bg-indigo-50/45 dark:hover:bg-indigo-950/30" 
                        : (isSelectionMode || onRowClick)
                          ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60" 
                          : "hover:bg-slate-50/70 dark:hover:bg-slate-800/40",
                      rowClassName?.(row)
                    )}
                    style={{ animationDelay: `${rowIndex * 0.02}s` }}
                    tabIndex={(isSelectionMode || onRowClick) ? 0 : undefined}
                    aria-selected={isSelected}
                    role="row"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (isSelectionMode) {
                          handleSelectRow(rowKey);
                        } else if (onRowClick) {
                          onRowClick(row);
                        }
                      }
                    }}
                    onClickCapture={(e) => {
                      if (isSelectionMode) {
                        const target = e.target as HTMLElement;
                        if (target.tagName.toLowerCase() === 'input' && (target as HTMLInputElement).type === 'checkbox') {
                          return;
                        }
                        e.preventDefault();
                        e.stopPropagation();
                        handleSelectRow(rowKey);
                      }
                    }}
                    onClick={(e) => {
                      if (isSelectionMode) return;
                      const target = e.target as HTMLElement;
                      if (
                        target.tagName.toLowerCase() === 'input' ||
                        target.tagName.toLowerCase() === 'button' ||
                        target.closest('button') ||
                        target.closest('a')
                      ) {
                        return;
                      }
                      onRowClick?.(row);
                    }}
                  >
                    {enableSelection && isSelectionMode && (
                      <TableCell className={cn(compact ? "px-2 py-1.5 w-[32px]" : "px-3 py-2 w-[40px]")}>
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          checked={isSelected}
                          onChange={() => handleSelectRow(rowKey)}
                          aria-label={`Select row ${rowIndex + 1}`}
                        />
                      </TableCell>
                    )}
                    {columns.map((col, colIndex) => (
                      <TableCell key={colIndex} className={cn(compact ? "px-2 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200" : "px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200", col.className)}>
                        {col.accessor(row, rowIndex)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
        {isLoading ? (
          Array.from({ length: Math.min(activePageSize, 6) }).map((_, rowIndex) => (
            <div key={rowIndex} className="p-3">
              <div className="h-4 skeleton w-36 rounded-md" />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="h-3 skeleton rounded-md" />
                <div className="h-3 skeleton rounded-md" />
                <div className="h-3 skeleton rounded-md" />
                <div className="h-3 skeleton rounded-md" />
              </div>
            </div>
          ))
        ) : isError ? (
          <div className="px-4 py-12 text-center">
            <X size={32} className="mx-auto text-rose-500 stroke-[2]" />
            <p className="mt-3 text-sm font-bold text-slate-900 dark:text-slate-100">{errorTitle}</p>
            <p className="mx-auto mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">{errorMessage}</p>
          </div>
        ) : displayData.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <FileSearch size={32} className="mx-auto text-slate-400 stroke-[1.5]" />
            <p className="mt-3 text-sm font-bold text-slate-900 dark:text-slate-100">{emptyTitle}</p>
            <p className="mx-auto mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">{emptyMessage}</p>
          </div>
        ) : (
          displayData.map((row, rowIndex) => {
            const actualIndex = isServerPaginated ? rowIndex : (activePage - 1) * activePageSize + rowIndex;
            const rowKey = getRowKey(row, actualIndex);
            const isSelected = selectedKeys.has(rowKey);
            const visibleColumns = columns.filter(col => col.mobilePriority !== 'hidden');
            const primaryColumns = visibleColumns.filter(col => col.mobilePriority === 'primary');
            const secondaryColumns = visibleColumns.filter(col => col.mobilePriority === 'secondary');
            const metaColumns = visibleColumns.filter(col => col.mobilePriority === 'meta' || !col.mobilePriority);
            const titleColumns = primaryColumns.length > 0 ? primaryColumns : visibleColumns.slice(0, 2);
            const detailColumns = [
              ...secondaryColumns,
              ...metaColumns.filter(col => !titleColumns.includes(col)),
            ];

            return (
              <div
                key={String(rowKey)}
                role={(isSelectionMode || onRowClick) ? "button" : undefined}
                tabIndex={(isSelectionMode || onRowClick) ? 0 : undefined}
                className={cn(
                  "w-full p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
                  (isSelectionMode || onRowClick) && "cursor-pointer",
                  isSelected ? "bg-brand/5" : "bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/60"
                )}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  if (isSelectionMode) {
                    handleSelectRow(rowKey);
                  } else {
                    onRowClick?.(row);
                  }
                }}
                onClickCapture={(e) => {
                  if (isSelectionMode) {
                    const target = e.target as HTMLElement;
                    if (target.tagName.toLowerCase() === 'input' && (target as HTMLInputElement).type === 'checkbox') {
                      return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelectRow(rowKey);
                  }
                }}
                onClick={() => {
                  if (!isSelectionMode) {
                    onRowClick?.(row);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    {titleColumns.map((col, colIndex) => (
                      <div
                        key={colIndex}
                        className={cn(
                          colIndex === 0
                            ? "text-sm font-extrabold leading-5 text-slate-900 dark:text-slate-100"
                            : "text-xs font-semibold leading-4 text-slate-600 dark:text-slate-300"
                        )}
                      >
                        {col.accessor(row, rowIndex)}
                      </div>
                    ))}
                  </div>
                  {enableSelection && isSelectionMode && (
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-brand focus:ring-brand"
                      checked={isSelected}
                      onChange={() => handleSelectRow(rowKey)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select row ${rowIndex + 1}`}
                    />
                  )}
                </div>

                {detailColumns.length > 0 && (
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                    {detailColumns.slice(0, 6).map((col, colIndex) => (
                      <div key={colIndex} className="min-w-0">
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          {getPlainHeader(col.header, colIndex)}
                        </dt>
                        <dd className="mt-0.5 truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
                          {col.accessor(row, rowIndex)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Spacious Pagination Footer */}
      <div className="shrink-0 p-3 sm:p-4 sm:px-5 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-900/60 text-xs font-semibold text-slate-600 dark:text-slate-400">
        {/* Left Side: Rows Per Page & Summary Count */}
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 dark:text-slate-400 font-medium">
              <span className="hidden sm:inline">Rows per page:</span>
              <span className="sm:hidden">Rows:</span>
            </span>
            <select
              value={activePageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="h-8 px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand/20 cursor-pointer shadow-xs"
              aria-label="Rows per page"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <span className="text-slate-500 dark:text-slate-400 font-medium border-l border-slate-200 dark:border-slate-700 pl-4 hidden sm:inline">
            Showing <span className="font-extrabold text-slate-900 dark:text-slate-100">{fromIndex}</span> to <span className="font-extrabold text-slate-900 dark:text-slate-100">{toIndex}</span> of <span className="font-extrabold text-slate-900 dark:text-slate-100">{totalCount}</span> entries
          </span>
        </div>

        {/* Right Side: Page Navigation Buttons */}
        <div className="flex items-center gap-1.5 ml-auto" role="navigation" aria-label="Pagination Navigation">
          <button
            onClick={() => handlePageChange(1)}
            disabled={activePage === 1 || isLoading}
            aria-label="First page"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <ChevronsLeft size={14} />
          </button>

          <button
            onClick={() => handlePageChange(activePage - 1)}
            disabled={activePage === 1 || isLoading}
            aria-label="Previous page"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <ChevronLeft size={14} />
          </button>

          <div className="flex items-center gap-1 px-2" aria-live="polite">
            <span className="px-2.5 py-1 text-xs font-extrabold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 shadow-2xs">
              {activePage}
            </span>
            <span className="text-slate-400 text-xs font-medium">/</span>
            <span className="text-slate-600 dark:text-slate-400 text-xs font-bold">{computedTotalPages}</span>
          </div>

          <button
            onClick={() => handlePageChange(activePage + 1)}
            disabled={activePage >= computedTotalPages || isLoading}
            aria-label="Next page"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <ChevronRight size={14} />
          </button>

          <button
            onClick={() => handlePageChange(computedTotalPages)}
            disabled={activePage >= computedTotalPages || isLoading}
            aria-label="Last page"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <ChevronsRight size={14} />
          </button>
        </div>
      </div>

      {/* Modern Floating Bottom Bulk Action Bar */}
      {bulkActions.length > 0 && selectedKeys.size > 0 && (
        <BulkActionBar
          selectedCount={selectedKeys.size}
          onClear={clearSelection}
        >
          {bulkActions.map((action, i) => (
            <Btn
              key={i}
              label={action.label}
              icon={action.icon}
              variant={action.variant || 'secondary'}
              size="sm"
              className={action.className}
              onClick={async () => {
                const selectedRows = data.filter((row, idx) => selectedKeys.has(getRowKey(row, idx)));
                await action.onClick(selectedRows, clearSelection);
              }}
            />
          ))}
        </BulkActionBar>
      )}
    </div>
  );
}

// Wrap with generic React.memo while preserving types
export default React.memo(DataTableContent) as typeof DataTableContent;
