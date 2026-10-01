import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Search, Building2, Check, AlertTriangle, Info, CheckCircle2, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { locationService, Location, CoordinatePrecision } from '@/services/locationService';
import { customerService } from '@/services/customerService';
import { isGoogleMapsUrl, extractCityFromAddress, parsePastedAddressText } from '@/utils/googleMapsLink';
import { usePastedLocation } from '@/hooks/usePastedLocation';
import { createAddressSearchSession, AddressSearchSession, AddressSuggestion } from '@/services/addressSearch';
import PasteLocationStatus from '@/components/ui/PasteLocationStatus';

export function generateSmartLocationCode(name?: string, city?: string): string {
  const cleanCity = (city || '').trim().replace(/^Al\s+/i, '');
  const cleanName = (name || '').trim();

  if (cleanCity && cleanCity.length >= 3) {
    const prefix = cleanCity.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '');
    if (prefix.length === 3) return `${prefix}-01`;
  }

  if (cleanName) {
    const words = cleanName.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      const p1 = words[0][0] || 'L';
      const p2 = words[1][0] || 'O';
      return `${(p1 + p2).toUpperCase()}1`;
    } else if (cleanName.length >= 3) {
      const prefix = cleanName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '');
      if (prefix.length === 3) return `${prefix}-01`;
    }
  }

  return `LOC-${Math.floor(100 + Math.random() * 900)}`;
}

export interface LocationFormInitialData {
  code?: string;
  name?: string;
  city?: string;
  postalCode?: string;
  address?: string;
  lat?: number | string | null;
  lng?: number | string | null;
  coordinate_precision?: CoordinatePrecision;
  sourceUrl?: string;
}

interface LocationFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  location?: Location | null;
  defaultCustomerId?: string;
  initialData?: LocationFormInitialData | null;
  onSuccessLocation?: (location: Location) => void;
}

export default function LocationFormDialog({
  isOpen,
  onClose,
  location,
  defaultCustomerId,
  initialData,
  onSuccessLocation,
}: LocationFormDialogProps) {
  const queryClient = useQueryClient();

  const [customerId, setCustomerId] = useState(defaultCustomerId || '');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [precision, setPrecision] = useState<CoordinatePrecision>('UNKNOWN');
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [googleSuggestions, setGoogleSuggestions] = useState<AddressSuggestion[]>([]);
  const [isSearchingGoogle, setIsSearchingGoogle] = useState(false);
  const searchSessionRef = useRef<AddressSearchSession | null>(null);
  const searchRequestIdRef = useRef(0);
  const paste = usePastedLocation();

  const isEditing = !!location;

  const { data: customersRes } = useQuery({
    queryKey: ['customers-select'],
    queryFn: () => customerService.getAll(),
    enabled: isOpen && !defaultCustomerId,
  });
  const customers = customersRes?.data || [];

  useEffect(() => {
    if (location) {
      setCustomerId(location.customerId || defaultCustomerId || '');
      setCode(location.code || '');
      setName(location.name || '');
      setCity(location.city || '');
      setPostalCode(location.postalCode || '');
      setAddress(location.address || '');
      setLat(location.lat != null ? String(location.lat) : '');
      setLng(location.lng != null ? String(location.lng) : '');
      setPrecision(location.coordinate_precision || (location.lat != null ? 'APPROXIMATE' : 'UNKNOWN'));
      setSearch(location.address || location.name || '');
    } else if (initialData) {
      setCustomerId(defaultCustomerId || '');

      const rawName = initialData.name || '';
      const rawAddress = initialData.address || '';
      const rawCity = initialData.city || '';
      const nameIsUrl = isGoogleMapsUrl(rawName) || /^https?:\/\//i.test(rawName);
      const addressIsUrl = isGoogleMapsUrl(rawAddress) || /^https?:\/\//i.test(rawAddress);
      const cityIsUrl = isGoogleMapsUrl(rawCity) || /^https?:\/\//i.test(rawCity);

      const cleanName = nameIsUrl ? '' : rawName;
      const cleanAddress = addressIsUrl ? '' : rawAddress;
      const cleanCity = cityIsUrl ? '' : (rawCity || extractCityFromAddress(cleanAddress, cleanName));

      setCode(initialData.code ? initialData.code.toUpperCase() : '');
      setName(cleanName);
      setAddress(cleanAddress);
      setCity(cleanCity);
      setPostalCode(initialData.postalCode || '');
      setLat(initialData.lat != null ? String(initialData.lat) : '');
      setLng(initialData.lng != null ? String(initialData.lng) : '');
      setPrecision(initialData.coordinate_precision || (initialData.lat != null ? 'EXACT' : 'UNKNOWN'));

      const activeSearch = initialData.sourceUrl || (addressIsUrl ? rawAddress : nameIsUrl ? rawName : '');
      setSearch(activeSearch);

      if (activeSearch && (isGoogleMapsUrl(activeSearch) || /^https?:\/\//i.test(activeSearch))) {
        handleSearchGoogle(activeSearch);
      }
    } else {
      setCustomerId(defaultCustomerId || '');
      setCode('');
      setName('');
      setCity('');
      setPostalCode('');
      setAddress('');
      setLat('');
      setLng('');
      setPrecision('UNKNOWN');
      setSearch('');
    }
    setError(null);
    setGoogleSuggestions([]);
  }, [location, defaultCustomerId, initialData, isOpen]);

  // Update precision state when coordinates change
  const hasCoords = lat.trim() !== '' && lng.trim() !== '' && !isNaN(Number(lat)) && !isNaN(Number(lng));

  useEffect(() => {
    if (!hasCoords) {
      setPrecision('UNKNOWN');
    } else if (precision === 'UNKNOWN') {
      setPrecision('APPROXIMATE');
    }
  }, [hasCoords, precision]);

  const handleNameChange = (val: string) => {
    setName(val);
  };

  const handleSearchGoogle = async (val: string) => {
    setSearch(val);
    const trimmed = val.trim();
    if (!trimmed) {
      searchRequestIdRef.current++;
      setGoogleSuggestions([]);
      setIsSearchingGoogle(false);
      return;
    }

    if (isGoogleMapsUrl(trimmed)) {
      searchRequestIdRef.current++;
      const place = await paste.resolve(trimmed);
      if (place) {
        if (!name) setName(place.name);
        setAddress(place.address || '');
        const computedCity = extractCityFromAddress(place.address || '', place.name);
        if (computedCity) setCity(computedCity);
        setLat(String(place.lat));
        setLng(String(place.lng));
        setPrecision('EXACT');
        setGoogleSuggestions([]);
      }
      setIsSearchingGoogle(false);
      return;
    }

    const currentRequestId = ++searchRequestIdRef.current;
    setIsSearchingGoogle(true);
    try {
      if (!searchSessionRef.current) searchSessionRef.current = createAddressSearchSession();
      let suggestions = await searchSessionRef.current.search(trimmed);

      // Smart fallback: retry with regional context if 0 results
      if (suggestions.length === 0 && !trimmed.toLowerCase().includes('saudi') && !trimmed.toLowerCase().includes('arabia')) {
        suggestions = await searchSessionRef.current.search(`${trimmed}, Saudi Arabia`);
      }

      if (currentRequestId === searchRequestIdRef.current) {
        setGoogleSuggestions(suggestions);
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (currentRequestId === searchRequestIdRef.current) {
        setIsSearchingGoogle(false);
      }
    }
  };

  const handleSelectGooglePlace = async (sugg: AddressSuggestion) => {
    if (!searchSessionRef.current) return;
    try {
      const resolved = await searchSessionRef.current.resolve(sugg.id);
      if (resolved) {
        if (!name) setName(resolved.name);
        setAddress(resolved.address || resolved.name);
        const computedCity = extractCityFromAddress(resolved.address || '', resolved.name);
        if (computedCity) setCity(computedCity);
        setLat(String(resolved.lat));
        setLng(String(resolved.lng));
        setPrecision('EXACT');
        setSearch(resolved.address || resolved.name);
        setGoogleSuggestions([]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const saveMutation = useMutation({
    mutationFn: (data: any) => {
      return isEditing ? locationService.update(location.id, data) : locationService.create(data);
    },
    onSuccess: (created: Location) => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      toast.success(isEditing ? 'Location updated successfully' : 'Location created successfully');
      onSuccessLocation?.(created);
      onClose();
    },
    onError: (err: any) => {
      setError(err.response?.data?.error?.message || 'Failed to save location.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // The dialog is portalled, but React still bubbles its submit to a parent
    // <form> (the quotation page's), which then ran that page's save.
    e.stopPropagation();
    setError(null);

    const activeCustId = customerId || defaultCustomerId;
    if (!activeCustId) {
      setError('Please select a customer for this location.');
      return;
    }
    if (!code.trim()) {
      setError('Location code is required (e.g. RUH, KHA).');
      return;
    }
    if (!name.trim()) {
      setError('Location name is required.');
      return;
    }

    const numericLat = lat.trim() !== '' ? Number(lat) : null;
    const numericLng = lng.trim() !== '' ? Number(lng) : null;

    if (precision !== 'UNKNOWN' && (numericLat === null || numericLng === null || isNaN(numericLat) || isNaN(numericLng))) {
      setError('Coordinates are required for EXACT or APPROXIMATE precision.');
      return;
    }

    saveMutation.mutate({
      customerId: activeCustId,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      city: city.trim() || null,
      postalCode: postalCode.trim() || null,
      address: address.trim() || null,
      lat: precision === 'UNKNOWN' ? null : numericLat,
      lng: precision === 'UNKNOWN' ? null : numericLng,
      coordinate_precision: precision,
    });
  };

  const isFromGoogleMaps = !isEditing && initialData && (initialData.lat != null || initialData.address);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px] p-6 rounded-2xl">
        <DialogHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <DialogTitle className="text-base font-extrabold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-brand" />
              <span>
                {isEditing
                  ? 'Edit Customer Location'
                  : isFromGoogleMaps
                  ? 'How do you want to save this location?'
                  : 'Create Customer Location'}
              </span>
            </div>
            {isFromGoogleMaps && (
              <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px] font-bold shrink-0 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-600" /> Google Maps Pin
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {isFromGoogleMaps
              ? 'Exact address found from Google Maps. Specify how to name and code this location.'
              : 'Canonical operational hub scoped to customer.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
              {error}
            </div>
          )}

          {/* Customer Selection */}
          {!defaultCustomerId && (
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Customer <span className="text-rose-500">*</span>
              </Label>
              <Select value={customerId} onValueChange={setCustomerId} disabled={isEditing}>
                <SelectTrigger className="h-9 text-xs font-semibold">
                  <SelectValue placeholder="Select Customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs font-semibold">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Code & Name Row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1 col-span-1 min-w-0">
              <Label className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Code <span className="text-rose-500">*</span>
              </Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Enter code (e.g. RUH, BAH)..."
                maxLength={10}
                className="h-9 text-xs font-mono font-bold uppercase truncate"
              />
            </div>
            <div className="space-y-1 col-span-2 min-w-0">
              <Label className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Location Name <span className="text-rose-500">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Enter location name (e.g. Riyadh Hub)..."
                className="h-9 text-xs font-semibold truncate"
              />
            </div>
          </div>

          {/* City & Address */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1 col-span-1 min-w-0">
              <Label className="text-xs font-bold text-slate-900 dark:text-slate-100">City</Label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Enter city (e.g. Riyadh)..."
                className="h-9 text-xs truncate"
              />
            </div>
            <div className="space-y-1 col-span-2 min-w-0">
              <Label className="text-xs font-bold text-slate-900 dark:text-slate-100">Address / Zone</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Enter street address or zone..."
                className="h-9 text-xs truncate"
              />
            </div>
          </div>

          {/* Google Places Search */}
          <div className="space-y-1 relative">
            <Label className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
              <span>Google Maps Pin Resolution</span>
              <span className="text-[10px] text-slate-400 font-normal">Optional</span>
            </Label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => handleSearchGoogle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleSearchGoogle(search);
                    }
                  }}
                  placeholder="Paste Google Maps link or search place..."
                  className="h-9 pl-9 text-xs truncate"
                />
              </div>
              <Button
                type="button"
                onClick={() => void handleSearchGoogle(search)}
                disabled={isSearchingGoogle}
                className="h-9 px-3 text-xs font-bold bg-[#FA634E] hover:bg-[#E04F3A] text-white rounded-xl gap-1 shrink-0 shadow-xs"
              >
                {isSearchingGoogle ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white" /> : <Search className="w-3.5 h-3.5" />}
                <span>Search</span>
              </Button>
            </div>
            {googleSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-[9999] border border-slate-200 dark:border-slate-800 rounded-xl p-1 bg-white dark:bg-slate-900 shadow-2xl max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {googleSuggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelectGooglePlace(s)}
                    className="w-full text-left p-2 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-xs rounded-lg flex items-center gap-2 transition-colors min-w-0 group"
                  >
                    <MapPin className="w-4 h-4 text-[#FA634E] shrink-0" />
                    <span className="truncate min-w-0 font-medium text-slate-800 dark:text-slate-200 group-hover:text-[#FA634E]">{s.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Lat & Lng */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 min-w-0">
              <Label className="text-xs font-bold text-slate-900 dark:text-slate-100">Latitude</Label>
              <Input
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="Lat (e.g. 24.7136)..."
                className="h-9 text-xs font-mono truncate"
              />
            </div>
            <div className="space-y-1 min-w-0">
              <Label className="text-xs font-bold text-slate-900 dark:text-slate-100">Longitude</Label>
              <Input
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="Lng (e.g. 46.6753)..."
                className="h-9 text-xs font-mono truncate"
              />
            </div>
          </div>

          {/* Coordinate Precision Selector */}
          <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800">
            <Label className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between">
              <span>Coordinate Precision</span>
              {precision === 'EXACT' && (
                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">
                  Exact location
                </Badge>
              )}
              {precision === 'APPROXIMATE' && (
                <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] font-bold">
                  Area location
                </Badge>
              )}
              {precision === 'UNKNOWN' && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-bold">
                  ○ Location not pinned
                </Badge>
              )}
            </Label>

            {hasCoords ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPrecision('APPROXIMATE')}
                    className={`p-2 rounded-lg border text-left text-xs transition-all ${
                      precision === 'APPROXIMATE'
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 font-bold text-indigo-900 dark:text-indigo-200'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1">
                      <span>≈ Approximate</span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-normal">General area / hub position</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPrecision('EXACT')}
                    className={`p-2 rounded-lg border text-left text-xs transition-all ${
                      precision === 'EXACT'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 font-bold text-emerald-900 dark:text-emerald-200'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Exact Facility</span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-normal">Confirmed building / dock pin</div>
                  </button>
                </div>

                {precision === 'APPROXIMATE' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPrecision('EXACT')}
                    className="w-full h-7 text-[11px] font-bold text-emerald-700 border-emerald-300 hover:bg-emerald-50 gap-1"
                  >
                    <Check className="w-3 h-3 text-emerald-600" />
                    Confirm: This is the exact facility
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">
                Coordinates are missing. Precision is automatically set to <strong>UNKNOWN (○ Location not pinned)</strong>. Enter coordinates or resolve via Google Maps to select precision.
              </p>
            )}
          </div>

          <DialogFooter className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saveMutation.isPending}
              className="bg-brand hover:bg-brand-hover text-white font-bold"
            >
              {saveMutation.isPending ? 'Saving...' : isEditing ? 'Update Location' : 'Create Location'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
