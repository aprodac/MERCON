import { useState, useRef, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, MapPin, Plus, Loader2, Building2, AlertTriangle, Sparkles, Globe, Search } from 'lucide-react';
import { toast } from 'sonner';

import { cn, isUuid } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { locationService, Location } from '@/services/locationService';
import { matchesSearch } from '@/lib/search';
import { createAddressSearchSession, AddressSearchSession, AddressSuggestion } from '@/services/addressSearch';
import { isGoogleMapsUrl, findGoogleMapsUrl, extractCityFromAddress, parsePastedAddressText } from '@/utils/googleMapsLink';
import { usePastedLocation } from '@/hooks/usePastedLocation';
import PasteLocationStatus from '@/components/ui/PasteLocationStatus';
import LocationFormDialog, { LocationFormInitialData } from '@/components/locations/LocationFormDialog';

interface LocationComboboxProps {
  id?: string;
  value: string;
  onChange: (locationId: string, location: Location | null) => void;
  placeholder?: string;
  disabled?: boolean;
  newLocationLat?: number | null;
  newLocationLng?: number | null;
  excludeLocationId?: string;
  triggerClassName?: string;
  customerId?: string;
  side?: 'top' | 'bottom';
  hasError?: boolean;
  precision?: 'EXACT' | 'APPROXIMATE' | 'UNKNOWN';
  onEditPrecision?: (location: Location) => void;
}

export default function LocationCombobox({
  id,
  value,
  onChange,
  placeholder = 'Select location...',
  disabled,
  newLocationLat,
  newLocationLng,
  excludeLocationId,
  triggerClassName,
  customerId,
  side = 'top',
  hasError = false,
  precision,
  onEditPrecision,
}: LocationComboboxProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [pendingLocationData, setPendingLocationData] = useState<LocationFormInitialData | null>(null);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [createdLocation, setCreatedLocation] = useState<Location | null>(null);

  const [googleSuggestions, setGoogleSuggestions] = useState<AddressSuggestion[]>([]);
  const [isSearchingGoogle, setIsSearchingGoogle] = useState(false);
  const searchSessionRef = useRef<AddressSearchSession | null>(null);
  const searchRequestIdRef = useRef(0);
  const paste = usePastedLocation();

  const { data: locationsRes, isLoading } = useQuery({
    queryKey: ['locations', customerId],
    queryFn: () => locationService.getAll({ customerId, active_only: true }),
  });

  const locations = useMemo(() => {
    const list = locationsRes?.data || [];
    return list.filter((l) => l.id !== excludeLocationId);
  }, [locationsRes?.data, excludeLocationId]);

  const selected = useMemo(() => {
    const found = locations.find((l) => l.id === value || l.code === value || l.name === value || (value && l.name.trim().toLowerCase() === value.trim().toLowerCase()));
    if (found) return found;
    if (createdLocation && (createdLocation.id === value || createdLocation.code === value || createdLocation.name === value)) {
      return createdLocation;
    }
    return null;
  }, [locations, value, createdLocation]);

  const trimmedSearch = search.trim();
  const matchingLocations = useMemo(() => {
    return locations.filter((loc) => {
      return trimmedSearch ? matchesSearch(trimmedSearch, [loc.code, loc.name, loc.city, loc.address]) : true;
    });
  }, [locations, trimmedSearch]);

  const alreadyExists = locations.some(
    (l) => l.name.trim().toLowerCase() === trimmedSearch.toLowerCase() || l.code.trim().toLowerCase() === trimmedSearch.toLowerCase()
  );

  const canCreate = trimmedSearch.length > 0 && !alreadyExists && !isGoogleMapsUrl(trimmedSearch);

  const displayLabel = selected 
    ? `${selected.code} — ${selected.name}` 
    : createdLocation && (createdLocation.id === value || createdLocation.code === value)
    ? `${createdLocation.code} — ${createdLocation.name}`
    : value && !isUuid(value) 
    ? value 
    : '';

  const performAddressSearch = async (queryText: string) => {
    const q = queryText.trim();
    if (isGoogleMapsUrl(q)) {
      setGoogleSuggestions([]);
      setIsSearchingGoogle(false);
      return;
    }

    if (q.length < 2) {
      searchRequestIdRef.current++;
      setGoogleSuggestions([
        { id: 'g-riyadh', label: 'Riyadh, Saudi Arabia' },
        { id: 'g-jeddah', label: 'Jeddah, Saudi Arabia' },
        { id: 'g-dammam', label: 'Dammam, Saudi Arabia' },
      ]);
      setIsSearchingGoogle(false);
      return;
    }

    const currentRequestId = ++searchRequestIdRef.current;
    setIsSearchingGoogle(true);

    try {
      if (!searchSessionRef.current) {
        searchSessionRef.current = createAddressSearchSession();
      }

      let results = await searchSessionRef.current.search(q);

      // Smart fallback: If initial query returned 0 results, retry with region context
      if (results.length === 0 && !q.toLowerCase().includes('saudi') && !q.toLowerCase().includes('arabia')) {
        results = await searchSessionRef.current.search(`${q}, Saudi Arabia`);
      }

      if (currentRequestId === searchRequestIdRef.current) {
        setGoogleSuggestions(results);
      }
    } catch (e) {
      console.error('Google Maps search error', e);
    } finally {
      if (currentRequestId === searchRequestIdRef.current) {
        setIsSearchingGoogle(false);
      }
    }
  };

  useEffect(() => {
    if (!open) return;

    const timer = setTimeout(() => {
      void performAddressSearch(search);
    }, 450);

    return () => clearTimeout(timer);
  }, [trimmedSearch, open, search]);

  const DEFAULT_CITY_PRESETS: Record<string, { name: string; city: string; address: string; lat: number; lng: number }> = {
    'g-riyadh': { name: 'Riyadh Hub', city: 'Riyadh', address: 'Riyadh, Saudi Arabia', lat: 24.7136, lng: 46.6753 },
    'g-jeddah': { name: 'Jeddah Hub', city: 'Jeddah', address: 'Jeddah, Saudi Arabia', lat: 21.5433, lng: 39.1728 },
    'g-dammam': { name: 'Dammam Hub', city: 'Dammam', address: 'Dammam, Saudi Arabia', lat: 26.4207, lng: 50.0888 },
  };

  const handleSelectGoogleSuggestion = async (sug: AddressSuggestion) => {
    setIsSearchingGoogle(true);
    try {
      let resolved: { name: string; address?: string; city?: string; lat: number; lng: number } | null = null;

      if (DEFAULT_CITY_PRESETS[sug.id]) {
        resolved = DEFAULT_CITY_PRESETS[sug.id];
      } else {
        if (!searchSessionRef.current) {
          searchSessionRef.current = createAddressSearchSession();
        }
        resolved = await searchSessionRef.current.resolve(sug.id);
      }

      if (!resolved) {
        toast.error('Could not resolve location coordinates from map.');
        return;
      }

      const extractedCity = resolved.city || extractCityFromAddress(resolved.address || resolved.name || '', resolved.name);
      setPendingLocationData({
        name: resolved.name,
        address: resolved.address || resolved.name,
        city: extractedCity,
        lat: resolved.lat,
        lng: resolved.lng,
        code: '',
        coordinate_precision: DEFAULT_CITY_PRESETS[sug.id] ? 'APPROXIMATE' : 'EXACT',
        sourceUrl: sug.label,
      });
      setIsSaveModalOpen(true);
      setOpen(false);
    } catch (err) {
      console.error('Failed to resolve Google suggestion', err);
      toast.error('Failed to resolve map location.');
    } finally {
      setIsSearchingGoogle(false);
    }
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);

    if (isGoogleMapsUrl(val.trim())) {
      void (async () => {
        const place = await paste.resolve(val.trim());
        if (!place) return;

        const urlPasted = val.trim();
        const extractedCity = extractCityFromAddress(place.address || place.name || '', place.name);
        setPendingLocationData({
          name: place.name,
          address: place.address || place.name,
          city: extractedCity,
          lat: place.lat,
          lng: place.lng,
          code: '',
          coordinate_precision: 'EXACT',
          sourceUrl: urlPasted,
        });
        setIsSaveModalOpen(true);
        setOpen(false);
      })();
    }
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setSearch(e.key);
        setOpen(true);
      }
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setSearch('');
    }
  };

  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const focusNextField = () => {
    setTimeout(() => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const focusable = Array.from(
        document.querySelectorAll<HTMLElement>(
          'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"])'
        )
      ).filter((el) => {
        const s = window.getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && (el.offsetWidth > 0 || el.offsetHeight > 0);
      });
      const idx = focusable.indexOf(trigger);
      if (idx > -1 && idx < focusable.length - 1) {
        focusable[idx + 1].focus();
      }
    }, 60);
  };

  useEffect(() => {
    setActiveIndex(0);
  }, [search, open]);

  // Focus search input when popover opens
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Scroll active item into view
  useEffect(() => {
    if (open && listRef.current) {
      const activeEl = listRef.current.querySelector(`[data-location-index="${activeIndex}"]`) as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndex, open]);

  const totalItems = matchingLocations.length + googleSuggestions.length;

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (totalItems > 0 ? Math.min(prev + 1, totalItems - 1) : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (activeIndex < matchingLocations.length && matchingLocations[activeIndex]) {
        const target = matchingLocations[activeIndex];
        onChange(target.id, target);
        setOpen(false);
        focusNextField();
      } else if (googleSuggestions[activeIndex - matchingLocations.length]) {
        const gTarget = googleSuggestions[activeIndex - matchingLocations.length];
        handleSelectGoogleSuggestion(gTarget);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          ref={triggerRef}
          onKeyDown={handleTriggerKeyDown}
          className={cn(
            'w-full justify-between font-normal text-xs h-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 focus-visible:ring-2 focus-visible:ring-[#FA634E] focus-visible:outline-none focus-visible:border-[#FA634E]',
            hasError && 'border-red-500 ring-2 ring-red-500/30 bg-red-50/20 dark:bg-red-950/20 text-red-900 dark:text-red-200',
            !selected && 'text-slate-400',
            triggerClassName
          )}
        >
          <span className="flex items-center gap-2 truncate flex-1 min-w-0">
            <MapPin className={cn('h-3.5 w-3.5 shrink-0', hasError ? 'text-red-500' : selected ? 'text-brand' : 'text-slate-400')} />
            <span className="truncate font-semibold text-slate-900 dark:text-slate-100">{displayLabel || placeholder}</span>
          </span>
          {selected && (
            <span className="flex items-center gap-1 shrink-0 ml-1.5" onClick={(e) => e.stopPropagation()}>
              {/* A span, not a <button>: it sits inside the trigger <button>, and nested buttons are invalid HTML. */}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditingLocation(selected);
                  setIsSaveModalOpen(true);
                  if (onEditPrecision) {
                    onEditPrecision(selected);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  e.stopPropagation();
                  setEditingLocation(selected);
                  setIsSaveModalOpen(true);
                  if (onEditPrecision) {
                    onEditPrecision(selected);
                  }
                }}
                className={cn(
                  "px-2 py-0.5 rounded-md text-[10px] font-extrabold border transition-all cursor-pointer flex items-center gap-1 shadow-2xs",
                  (precision || selected?.coordinate_precision || (selected?.lat != null ? 'APPROXIMATE' : 'UNKNOWN')) === 'EXACT'
                    ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-300"
                    : "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-300 animate-pulse"
                )}
                title="Click to edit location details, map pin & address"
              >
                {(precision || selected?.coordinate_precision || (selected?.lat != null ? 'APPROXIMATE' : 'UNKNOWN')) === 'EXACT' ? 'Exact (Edit)' : 'Area (Edit)'}
              </span>
            </span>
          )}
          <ChevronDown className="ml-1.5 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side={side}
        sideOffset={4}
        avoidCollisions={true}
        collisionPadding={8}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
        onKeyDownCapture={handleInputKeyDown}
        className="w-[var(--radix-popover-trigger-width)] min-w-[var(--radix-popover-trigger-width)] max-w-[var(--radix-popover-trigger-width)] p-0 shadow-xl border-slate-200/90 overflow-hidden rounded-xl z-[9999] bg-white dark:bg-slate-900 max-h-[var(--radix-popover-content-available-height)] flex flex-col"
      >
        <div className="w-full flex flex-col min-h-0 overflow-hidden flex-1">
          <div className="flex items-center border-b border-slate-100 dark:border-slate-800 px-3 bg-white dark:bg-slate-900 shrink-0">
            <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search code, location name, address or paste Google Maps URL..."
              className="flex h-10 w-full rounded-md bg-transparent py-2.5 text-xs outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
          {paste.status.kind !== 'idle' && (
            <div className="px-2 pt-1.5 shrink-0">
              <PasteLocationStatus status={paste.status} />
            </div>
          )}
          <div ref={listRef} className="flex-1 min-h-0 max-h-[min(280px,var(--radix-popover-content-available-height,280px))] overflow-y-auto overscroll-contain divide-y divide-slate-100 dark:divide-slate-800">
            {(isLoading || isSearchingGoogle) && (
              <div className="py-2.5 px-3 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
                <span>Searching locations &amp; map places...</span>
              </div>
            )}

            {matchingLocations.length > 0 ? (
              <div>
                <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                  <span>Customer Locations</span>
                  <Badge className="bg-amber-50 text-amber-800 text-[9px] px-1.5 py-0 font-bold border border-amber-200/60 shadow-2xs shrink-0">
                    CUSTOMER SCOPED
                  </Badge>
                </div>
                {matchingLocations.map((loc, idx) => {
                  const prec = loc.coordinate_precision || (loc.lat != null ? 'APPROXIMATE' : 'UNKNOWN');
                  const isHighlighted = activeIndex === idx;
                  const doSelectLoc = () => {
                    onChange(loc.id, loc);
                    setOpen(false);
                    if (onEditPrecision && prec === 'APPROXIMATE') {
                      setTimeout(() => {
                        onEditPrecision(loc);
                      }, 100);
                    }
                  };

                  return (
                    <div
                      key={loc.id}
                      data-location-index={idx}
                      className={cn(
                        'text-xs flex items-center justify-between py-2 px-2.5 cursor-pointer min-w-0 transition-colors select-none',
                        isHighlighted
                          ? 'bg-orange-50 dark:bg-orange-950/40 text-brand font-bold ring-1 ring-brand/30'
                          : 'hover:bg-slate-50 text-slate-900 dark:text-slate-100'
                      )}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        doSelectLoc();
                      }}
                      onClick={doSelectLoc}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="font-mono text-[10px] font-black text-slate-900 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shrink-0">
                          {loc.code}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold text-slate-900 dark:text-slate-100">{loc.name}</div>
                          {loc.address && (
                            <div className="truncate text-[10px] text-slate-400">{loc.address}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {prec === 'EXACT' && (
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] font-bold">
                            Exact
                          </Badge>
                        )}
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditingLocation(loc);
                            setIsSaveModalOpen(true);
                            setOpen(false);
                            if (onEditPrecision) {
                              onEditPrecision(loc);
                            }
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditingLocation(loc);
                            setIsSaveModalOpen(true);
                            setOpen(false);
                            if (onEditPrecision) {
                              onEditPrecision(loc);
                            }
                          }}
                          className={cn(
                            "text-[9px] font-extrabold px-2 py-0.5 rounded-md flex items-center gap-1 transition-all shadow-2xs cursor-pointer",
                            prec === 'APPROXIMATE'
                              ? "bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-300"
                              : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 dark:border-slate-700"
                          )}
                          title="Edit location details, coordinates, and precision"
                        >
                          {prec === 'APPROXIMATE' ? (
                            <>
                              <span>≈ Area</span>
                              <span className="text-[9px] underline font-black text-amber-900 dark:text-amber-100">Edit</span>
                            </>
                          ) : (
                            <span className="text-[9px] underline font-bold">Edit</span>
                          )}
                        </button>
                        {prec === 'UNKNOWN' && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[9px] font-bold">
                            ○ Not Pinned
                          </Badge>
                        )}
                        {selected?.id === loc.id && <Check className="h-3.5 w-3.5 text-brand shrink-0" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : !trimmedSearch ? (
              <div>
                <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                  <span>Customer Locations</span>
                  <Badge className="bg-amber-50 text-amber-800 text-[9px] px-1.5 py-0 font-bold border border-amber-200/60 shadow-2xs shrink-0">
                    CUSTOMER SCOPED
                  </Badge>
                </div>
                <div className="px-2.5 py-3 text-xs text-slate-400 text-center">
                  {customerId ? 'No locations found for this customer.' : 'Select a customer first to view customer locations.'}
                </div>
              </div>
            ) : null}

            {/* Live Google Maps & Address Search Results */}
            {googleSuggestions.length > 0 && (
              <div>
                <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                  <span>Google Maps & Address Search</span>
                  <Badge className="bg-emerald-50 text-emerald-800 text-[9px] px-1.5 py-0 font-bold border border-emerald-200/60 shadow-2xs shrink-0 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-600" /> LIVE MAP
                  </Badge>
                </div>
                {googleSuggestions.map((sug, sIdx) => {
                  const gIndex = matchingLocations.length + sIdx;
                  const isHighlighted = activeIndex === gIndex;
                  const doSelectG = () => handleSelectGoogleSuggestion(sug);
                  return (
                    <div
                      key={sug.id}
                      data-location-index={gIndex}
                      className={cn(
                        'text-xs flex items-center justify-between py-2 px-2.5 cursor-pointer transition-colors select-none',
                        isHighlighted
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 font-bold ring-1 ring-emerald-400'
                          : 'hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30'
                      )}
                      onMouseEnter={() => setActiveIndex(gIndex)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        doSelectG();
                      }}
                      onClick={doSelectG}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="truncate font-medium text-slate-800 dark:text-slate-200">{sug.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {canCreate && (
              <div className="border-t border-slate-100 dark:border-slate-800 p-1">
                <div
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const url = findGoogleMapsUrl(trimmedSearch) || (isGoogleMapsUrl(trimmedSearch) || /^https?:\/\//i.test(trimmedSearch) ? trimmedSearch : null);
                    const parsed = parsePastedAddressText(trimmedSearch);
                    setPendingLocationData({
                      name: url ? '' : parsed.name,
                      address: url ? '' : parsed.address,
                      city: url ? '' : parsed.city,
                      postalCode: url ? undefined : parsed.postalCode,
                      code: '',
                      lat: newLocationLat ?? null,
                      lng: newLocationLng ?? null,
                      coordinate_precision: newLocationLat != null ? 'APPROXIMATE' : 'UNKNOWN',
                      sourceUrl: url || undefined,
                    });
                    setIsSaveModalOpen(true);
                    setOpen(false);
                  }}
                  onClick={() => {
                    const url = findGoogleMapsUrl(trimmedSearch) || (isGoogleMapsUrl(trimmedSearch) || /^https?:\/\//i.test(trimmedSearch) ? trimmedSearch : null);
                    const parsed = parsePastedAddressText(trimmedSearch);
                    setPendingLocationData({
                      name: url ? '' : parsed.name,
                      address: url ? '' : parsed.address,
                      city: url ? '' : parsed.city,
                      postalCode: url ? undefined : parsed.postalCode,
                      code: '',
                      lat: newLocationLat ?? null,
                      lng: newLocationLng ?? null,
                      coordinate_precision: newLocationLat != null ? 'APPROXIMATE' : 'UNKNOWN',
                      sourceUrl: url || undefined,
                    });
                    setIsSaveModalOpen(true);
                    setOpen(false);
                  }}
                  className="text-xs font-bold text-brand cursor-pointer flex items-center gap-2 py-2 px-2.5 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-950/40 select-none"
                >
                  <Plus className="w-4 h-4 text-brand shrink-0" />
                  <span>
                    {findGoogleMapsUrl(trimmedSearch) || isGoogleMapsUrl(trimmedSearch) || /^https?:\/\//i.test(trimmedSearch)
                      ? 'Create location from Google Maps link'
                      : `Create "${trimmedSearch}"`}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>

      <LocationFormDialog
        isOpen={isSaveModalOpen}
        onClose={() => {
          setIsSaveModalOpen(false);
          setPendingLocationData(null);
          setEditingLocation(null);
        }}
        location={editingLocation}
        defaultCustomerId={customerId || editingLocation?.customerId}
        initialData={pendingLocationData}
        onSuccessLocation={(updatedOrCreated) => {
          setCreatedLocation(updatedOrCreated);

          const updateCache = (old: any) => {
            if (!old) return { data: [updatedOrCreated] };
            if (Array.isArray(old)) {
              const idx = old.findIndex((item: any) => item.id === updatedOrCreated.id);
              if (idx >= 0) {
                const next = [...old];
                next[idx] = updatedOrCreated;
                return next;
              }
              return [updatedOrCreated, ...old];
            }
            if (Array.isArray(old.data)) {
              const idx = old.data.findIndex((item: any) => item.id === updatedOrCreated.id);
              if (idx >= 0) {
                const nextData = [...old.data];
                nextData[idx] = updatedOrCreated;
                return { ...old, data: nextData };
              }
              return { ...old, data: [updatedOrCreated, ...old.data] };
            }
            return old;
          };

          if (customerId) queryClient.setQueryData(['locations', customerId], updateCache);
          if (updatedOrCreated.customerId) queryClient.setQueryData(['locations', updatedOrCreated.customerId], updateCache);
          queryClient.setQueryData(['locations'], updateCache);
          queryClient.setQueryData(['locations-lookup-all'], updateCache);

          queryClient.invalidateQueries({ queryKey: ['locations'] });
          onChange(updatedOrCreated.id, updatedOrCreated);
          setSearch('');
          setEditingLocation(null);
        }}
      />
    </Popover>
  );
}
