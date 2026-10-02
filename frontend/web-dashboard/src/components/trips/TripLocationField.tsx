import { useState, useEffect, useRef, useMemo } from 'react';
import { MapPin, Search, Building2, Check, Loader2, Map as MapIcon, X, CheckCircle2 } from 'lucide-react';
import TripStopMap from '@/components/trips/TripStopMap';
import { locationService, Location, CoordinatePrecision } from '@/services/locationService';
import {
  createAddressSearchSession,
  AddressSearchSession,
  AddressSuggestion,
} from '@/services/addressSearch';
import { isGoogleMapsUrl } from '@/utils/googleMapsLink';
import { usePastedLocation } from '@/hooks/usePastedLocation';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import AddressLanguagePicker from '@/components/ui/AddressLanguagePicker';
import PasteLocationStatus from '@/components/ui/PasteLocationStatus';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { matchesSearch } from '@/lib/search';

export interface TripLocationFieldProps {
  tone: 'pickup' | 'dropoff';
  label: string;
  locationId: string;
  onLocationChange: (locationId: string, location: Location | null) => void;
  lat: number | null;
  lng: number | null;
  onCoordsChange: (lat: number, lng: number) => void;
  name: string;
  onNameChange: (name: string) => void;
  address: string;
  onAddressChange: (address: string) => void;
  locations: Location[];
  autoFocusSearch?: boolean;
  shortcutBadge?: string;
  precision?: CoordinatePrecision;
  onPrecisionChange?: (precision: CoordinatePrecision) => void;
  updateCanonicalLocation?: boolean;
  onUpdateCanonicalLocationChange?: (update: boolean) => void;
}

export default function TripLocationField({
  tone,
  label,
  locationId,
  onLocationChange,
  lat,
  lng,
  onCoordsChange,
  name,
  onNameChange,
  address,
  onAddressChange,
  locations,
  autoFocusSearch,
  shortcutBadge,
  precision: explicitPrecision,
  onPrecisionChange,
  updateCanonicalLocation = false,
  onUpdateCanonicalLocationChange,
}: TripLocationFieldProps) {
  const isPickup = tone === 'pickup';

  const activeSelectedLocation = useMemo(
    () => locations.find((l) => l.id === locationId) || null,
    [locations, locationId]
  );

  const [query, setQuery] = useState(name || '');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [googleSuggestions, setGoogleSuggestions] = useState<AddressSuggestion[]>([]);
  const [isSearchingGoogle, setIsSearchingGoogle] = useState(false);
  const [isResolvingPlace, setIsResolvingPlace] = useState(false);
  const [isTripOverrideExact, setIsTripOverrideExact] = useState(false);
  const [addressOptions, setAddressOptions] = useState<{ en: string | null; ar: string | null }>({
    en: null,
    ar: null,
  });
  const paste = usePastedLocation();

  const searchSessionRef = useRef<AddressSearchSession | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setQuery(name || '');
  }, [name]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const matchingLocations = useMemo(() => {
    if (!query.trim()) return locations.slice(0, 8);
    return locations.filter((l) => matchesSearch(query, [l.code, l.name, l.city, l.address]));
  }, [locations, query]);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    onNameChange(val);
    setIsDropdownOpen(true);
    setAddressOptions({ en: null, ar: null });

    if (!val.trim()) {
      onAddressChange('');
      onLocationChange('', null);
      setGoogleSuggestions([]);
      setIsSearchingGoogle(false);
      setIsTripOverrideExact(false);
      paste.reset();
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (isGoogleMapsUrl(val.trim())) {
      setGoogleSuggestions([]);
      setIsSearchingGoogle(false);
      setIsDropdownOpen(false);
      void (async () => {
        const place = await paste.resolve(val.trim(), (lat, lng) => {
          onCoordsChange(lat, lng);
          setIsTripOverrideExact(true);
          onPrecisionChange?.('EXACT');
        });
        if (!place) return;
        setQuery(place.name);
        onNameChange(place.name);
        onAddressChange(place.address);
        setAddressOptions({ en: place.addressEn, ar: place.addressAr });
      })();
      return;
    }

    paste.reset();

    if (val.length < 2) {
      setGoogleSuggestions([]);
      setIsSearchingGoogle(false);
      return;
    }

    setIsSearchingGoogle(true);
    debounceRef.current = setTimeout(async () => {
      try {
        if (!searchSessionRef.current) searchSessionRef.current = createAddressSearchSession();
        const suggestions = await searchSessionRef.current.search(val);
        setGoogleSuggestions(suggestions);
      } catch (e) {
        console.error('Google Maps place search failed', e);
        setGoogleSuggestions([]);
      } finally {
        setIsSearchingGoogle(false);
      }
    }, 450);
  };

  const handleSelectLocation = (loc: Location) => {
    setQuery(loc.name);
    onNameChange(loc.name);
    onAddressChange(loc.address || loc.name);
    if (loc.lat != null && loc.lng != null) {
      onCoordsChange(loc.lat, loc.lng);
    }
    onLocationChange(loc.id, loc);
    setIsTripOverrideExact(false);
    onPrecisionChange?.(loc.coordinate_precision || (loc.lat != null ? 'APPROXIMATE' : 'UNKNOWN'));
    setIsDropdownOpen(false);
  };

  const handleSelectGooglePlace = async (suggestion: AddressSuggestion) => {
    if (!searchSessionRef.current) searchSessionRef.current = createAddressSearchSession();
    setIsResolvingPlace(true);
    try {
      const resolved = await searchSessionRef.current.resolve(suggestion.id);
      searchSessionRef.current = null;

      if (resolved) {
        setQuery(resolved.name);
        onNameChange(resolved.name);
        onAddressChange(resolved.address || resolved.name);
        onCoordsChange(resolved.lat, resolved.lng);
        setIsTripOverrideExact(true);
        onPrecisionChange?.('EXACT');
      }
    } catch (e) {
      console.error('Failed to resolve place', e);
    } finally {
      setIsResolvingPlace(false);
      setIsDropdownOpen(false);
    }
  };

  const setExactTripPin = async () => {
    if (lat == null || lng == null) return;
    setIsTripOverrideExact(true);
    onPrecisionChange?.('EXACT');

    if (updateCanonicalLocation && activeSelectedLocation) {
      try {
        const updated = await locationService.update(activeSelectedLocation.id, {
          lat,
          lng,
          address: address || activeSelectedLocation.address,
          coordinate_precision: 'EXACT',
        });
        onLocationChange(activeSelectedLocation.id, updated);
      } catch (err) {
        console.error("Failed to upgrade location master data:", err);
      }
    }
    setIsMapOpen(false);
  };

  const resolvedAddress = address || activeSelectedLocation?.address;
  const hasCoords = lat != null && lng != null;

  const currentPrecision: CoordinatePrecision = useMemo(() => {
    if (!hasCoords) return 'UNKNOWN';
    if (explicitPrecision) return explicitPrecision;
    if (isTripOverrideExact) return 'EXACT';
    return activeSelectedLocation?.coordinate_precision || 'APPROXIMATE';
  }, [hasCoords, explicitPrecision, isTripOverrideExact, activeSelectedLocation]);

  const isPasteBusy = paste.status.kind === 'resolving' || paste.status.kind === 'naming';
  const isBusy = isSearchingGoogle || isPasteBusy;

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
          <MapPin className={cn('w-3.5 h-3.5', isPickup ? 'text-emerald-600' : 'text-brand')} />
          {label} <span className="text-rose-500">*</span>
        </span>
        {shortcutBadge && (
          <kbd className="font-mono bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1.5 py-0.2 rounded text-[10px] text-slate-500 font-semibold">
            {shortcutBadge}
          </kbd>
        )}
      </div>

      <div className={cn('relative', isDropdownOpen ? 'z-40' : 'z-10')}>
        <div className="relative flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            {isBusy ? (
              <Loader2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500 animate-spin pointer-events-none" />
            ) : (
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            )}
            <Input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onFocus={() => setIsDropdownOpen(true)}
              placeholder={`Search customer locations (code, name, address)...`}
              className="h-10 pl-9 pr-8 rounded-xl text-xs font-semibold border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus-visible:ring-brand/20 focus-visible:border-brand"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  onNameChange('');
                  onAddressChange('');
                  onLocationChange('', null);
                  setIsTripOverrideExact(false);
                  setIsDropdownOpen(false);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <Popover open={isMapOpen} onOpenChange={setIsMapOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'h-10 w-10 shrink-0 rounded-xl border flex items-center justify-center transition-all cursor-pointer',
                  currentPrecision === 'EXACT'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800'
                    : 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:border-amber-800'
                )}
                title={currentPrecision === 'EXACT' ? 'Move the pin' : 'Set the exact pin'}
              >
                <MapIcon className="w-4 h-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-2.5 rounded-xl space-y-2.5" align="end">
              <TripStopMap
                tone={tone}
                lat={lat}
                lng={lng}
                onChange={(la, ln) => {
                  onCoordsChange(la, ln);
                  setIsTripOverrideExact(true);
                  onPrecisionChange?.('EXACT');
                }}
                height={180}
              />
              {activeSelectedLocation && hasCoords && (
                <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                  {onUpdateCanonicalLocationChange && (
                    <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300 font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={updateCanonicalLocation}
                        onChange={(e) => onUpdateCanonicalLocationChange(e.target.checked)}
                        className="rounded border-slate-300 text-brand focus:ring-brand/20"
                      />
                      <span>Update Customer Master Location</span>
                    </label>
                  )}
                  <Button
                    size="sm"
                    onClick={setExactTripPin}
                    className="w-full h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Save pin
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {isDropdownOpen && (
          <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in-50 duration-150">
            <div className="p-1.5 space-y-0.5">
              <div className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Customer Locations</span>
                <Badge className="bg-indigo-50 text-indigo-700 text-[9px] px-1.5 py-0 font-bold border border-indigo-200/60 shadow-2xs shrink-0">
                  CUSTOMER SCOPED
                </Badge>
              </div>
              {matchingLocations.length === 0 ? (
                <div className="px-2.5 py-2 text-xs text-slate-400 text-center">No customer locations found</div>
              ) : (
                matchingLocations.map((loc) => {
                  const locPrec = loc.coordinate_precision || (loc.lat != null ? 'APPROXIMATE' : 'UNKNOWN');
                  return (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => handleSelectLocation(loc)}
                      className={cn(
                        'w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer',
                        locationId === loc.id
                          ? 'bg-orange-50 dark:bg-orange-950/40 text-brand font-extrabold'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-200'
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="font-mono text-[10px] font-black text-slate-900 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shrink-0">
                          {loc.code}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold">{loc.name}</div>
                          {loc.city && <div className="truncate text-[10px] text-slate-400">{loc.city}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {locPrec === 'EXACT' && (
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] font-bold">
                            Exact
                          </Badge>
                        )}
                        {locPrec !== 'EXACT' && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-[9px] font-bold">
                            Pin needed
                          </Badge>
                        )}
                        {locationId === loc.id && <Check className="w-4 h-4 text-brand shrink-0" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="p-1.5 space-y-0.5 bg-slate-50/40 dark:bg-slate-900/40">
              <div className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Google Maps Places</span>
                {isSearchingGoogle && <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />}
              </div>
              {!isSearchingGoogle && googleSuggestions.length === 0 && query.length >= 2 && (
                <div className="px-2.5 py-1.5 text-xs text-slate-400">No places found</div>
              )}
              {googleSuggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelectGooglePlace(s)}
                  disabled={isResolvingPlace}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <MapPin className="w-3.5 h-3.5 text-brand shrink-0" />
                  <span className="truncate">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <PasteLocationStatus status={paste.status} />

      {/* Never blocks: the exact site is often only known later, and can be
          pinned from the trip, the Locations list or the operator app. */}
      {currentPrecision !== 'EXACT' && (
        <button
          type="button"
          onClick={() => setIsMapOpen(true)}
          className="flex w-full items-center gap-1.5 rounded-lg px-1 text-left text-[11px] text-amber-800 dark:text-amber-300"
        >
          <MapPin className="size-3 shrink-0" />
          <span>
            <span className="font-semibold">Pin needed</span> — ETA is a guess until the exact pin is set. Set it now, or later from the trip.
          </span>
        </button>
      )}

      {resolvedAddress && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate pl-1">{resolvedAddress}</p>
      )}

      <AddressLanguagePicker
        addressEn={addressOptions.en}
        addressAr={addressOptions.ar}
        value={address}
        onChange={onAddressChange}
      />
    </div>
  );
}
