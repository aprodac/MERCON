import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin,
  Edit2,
  Save,
  Search,
  Building2,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  X,
  Copy,
  Check,
  MoreVertical,
  Trash2,
  FileText,
  Truck,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import ConfirmModal from '@/components/ui/ConfirmModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SAUDI_MAP_CONTAINER_PROPS } from '@/utils/saudiMapConfig';
import { locationService, CoordinatePrecision, Location } from '@/services/locationService';
import {
  createAddressSearchSession,
  reverseGeocodeDetailed,
  type AddressSearchSession,
  type AddressSuggestion,
} from '@/services/addressSearch';
import { isGoogleMapsUrl } from '@/utils/googleMapsLink';
import { usePastedLocation } from '@/hooks/usePastedLocation';
import { cn } from '@/lib/utils';

const customPinIcon = L.divIcon({
  html: `
    <div style="position: relative; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;">
      <div style="
        width: 26px;
        height: 26px;
        border-radius: 50%;
        background: var(--color-brand);
        border: 2px solid #FFFFFF;
        box-shadow: 0 3px 8px rgba(250, 99, 78, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </div>
    </div>
  `,
  className: 'location-page-pin',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

function FlyToPin({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], Math.max(map.getZoom(), 13), { animate: true });
  }, [lat, lng, map]);
  return null;
}

function MapClickHandler({ onMapClick, enabled }: { onMapClick: (lat: number, lng: number) => void; enabled: boolean }) {
  useMapEvents({
    click(e) {
      if (enabled) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

export default function LocationDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [, setCopiedId] = useState(false);
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'quotations' | 'trips'>('quotations');

  // Fetch Location Data
  const { data: location, isLoading, isError, error } = useQuery<Location & { quotationStops?: any[]; tripStops?: any[] }>({
    queryKey: ['location-detail', id],
    queryFn: () => locationService.getById(id!),
    enabled: !!id,
  });

  // Editable Form State
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country] = useState('Saudi Arabia');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [precision, setPrecision] = useState<CoordinatePrecision>('UNKNOWN');
  const [formError, setFormError] = useState<string | null>(null);

  // Resolution State
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const paste = usePastedLocation();

  const sessionRef = useRef<AddressSearchSession | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Sync Form State when Location Data Loads or Edit Mode Toggles
  useEffect(() => {
    if (location) {
      setCode(location.code || '');
      setName(location.name || '');
      setAddress(location.address || '');
      setCity(location.city || 'Riyadh');
      setPostalCode(location.postalCode || '');
      setLat(location.lat != null ? String(location.lat) : '');
      setLng(location.lng != null ? String(location.lng) : '');
      setPrecision(location.coordinate_precision || 'UNKNOWN');
      setFormError(null);
    }
  }, [location, isEditing]);

  // Click Outside Resolution Dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update Mutation
  const updateMutation = useMutation({
    mutationFn: async (payload: Partial<Location> & { is_active?: boolean }) => {
      if (!id) throw new Error('No location ID');
      return locationService.update(id, payload);
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['location-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      toast.success(`Location "${updated.name}" updated`);
      setIsEditing(false);
      setFormError(null);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to update location.';
      setFormError(msg);
      toast.error(msg);
    },
  });

  // Resolution / Google Maps Paste Handler
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setFormError(null);
    if (!query.trim()) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    if (isGoogleMapsUrl(query.trim())) {
      (async () => {
        setIsSearching(true);
        const place = await paste.resolve(query.trim(), (retLat, retLng) => {
          setLat(retLat.toFixed(6));
          setLng(retLng.toFixed(6));
          setPrecision('APPROXIMATE');
        });
        setIsSearching(false);

        if (!place) return;
        if (!name.trim()) setName(place.name);
        if (place.address) setAddress(place.address);
        setLat(place.lat.toFixed(6));
        setLng(place.lng.toFixed(6));
        setPrecision('APPROXIMATE');
        setShowDropdown(false);
        toast.info('Google Maps link resolved');
      })();
      return;
    }

    const coordMatch = query.trim().match(/^\(?\s*(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)\s*\)?$/);
    if (coordMatch) {
      const rawLat = parseFloat(coordMatch[1]);
      const rawLng = parseFloat(coordMatch[3]);
      if (!isNaN(rawLat) && !isNaN(rawLng)) {
        setLat(rawLat.toFixed(6));
        setLng(rawLng.toFixed(6));
        setPrecision('APPROXIMATE');
        setShowDropdown(false);
        toast.info(`Coordinates (${rawLat.toFixed(4)}, ${rawLng.toFixed(4)}) set`);
        return;
      }
    }

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      if (!sessionRef.current) {
        sessionRef.current = createAddressSearchSession();
      }
      setIsSearching(true);
      try {
        const rows = await sessionRef.current.search(query);
        setSuggestions(rows);
        setShowDropdown(rows.length > 0);
      } catch (err) {
        console.error('Address search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);
  };

  const handleSelectSuggestion = async (suggestion: AddressSuggestion) => {
    if (!sessionRef.current) return;
    setIsSearching(true);
    setShowDropdown(false);
    try {
      const place = await sessionRef.current.resolve(suggestion.id);
      if (place) {
        if (!name.trim()) setName(place.name);
        setAddress(place.address || place.name);
        setLat(place.lat.toFixed(6));
        setLng(place.lng.toFixed(6));
        setPrecision('APPROXIMATE');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  // Map Click Handler in Edit mode
  const handleMapClick = async (clickedLat: number, clickedLng: number) => {
    setLat(clickedLat.toFixed(6));
    setLng(clickedLng.toFixed(6));
    setPrecision('APPROXIMATE');

    if (!address.trim()) {
      try {
        const detail = await reverseGeocodeDetailed(clickedLat, clickedLng);
        if (detail?.address) {
          setAddress(detail.address);
          if ((detail as any)?.city) setCity((detail as any).city);
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const numericLat = parseFloat(lat);
  const numericLng = parseFloat(lng);
  const hasValidCoords = !isNaN(numericLat) && !isNaN(numericLng) && numericLat >= -90 && numericLat <= 90 && numericLng >= -180 && numericLng <= 180;

  const handleCopyId = () => {
    if (location?.id) {
      navigator.clipboard.writeText(location.id);
      setCopiedId(true);
      toast.success('Location ID copied');
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleCopyCoordinates = () => {
    if (hasValidCoords) {
      navigator.clipboard.writeText(`${numericLat.toFixed(6)}, ${numericLng.toFixed(6)}`);
      setCopiedCoords(true);
      toast.success('Coordinates copied');
      setTimeout(() => setCopiedCoords(false), 2000);
    }
  };

  const openGoogleMaps = () => {
    if (hasValidCoords) {
      const url = `https://www.google.com/maps/search/?api=1&query=${numericLat},${numericLng}`;
      window.open(url, '_blank');
    }
  };

  const handleSaveForm = () => {
    if (!code.trim()) {
      setFormError('Location code is required.');
      return;
    }
    if (!name.trim()) {
      setFormError('Location name is required.');
      return;
    }
    if ((precision === 'EXACT' || precision === 'APPROXIMATE') && !hasValidCoords) {
      setFormError('Valid coordinates are required for EXACT or APPROXIMATE precision.');
      return;
    }

    updateMutation.mutate({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      address: address.trim() || null,
      city: city.trim() || null,
      postalCode: postalCode.trim() || null,
      lat: precision === 'UNKNOWN' ? null : numericLat,
      lng: precision === 'UNKNOWN' ? null : numericLng,
      coordinate_precision: precision,
    });
  };

  const handleToggleActive = () => {
    if (!location) return;
    const nextStatus = !location.is_active;
    updateMutation.mutate(
      { is_active: nextStatus },
      {
        onSuccess: () => {
          setIsDeactivateModalOpen(false);
          toast.success(`Location ${nextStatus ? 'activated' : 'deactivated'}`);
        },
      }
    );
  };

  const quotationCount = location?._count?.quotationStops || location?.quotationStops?.length || 0;
  const tripCount = location?._count?.tripStops || location?.tripStops?.length || 0;

  if (isLoading) {
    return (
      <DashboardLayout active="Locations" title="Location Details">
        <div className="flex flex-col items-center justify-center h-[calc(100vh-140px)] space-y-3">
          <Loader2 className="w-7 h-7 animate-spin text-brand" />
          <p className="text-xs font-semibold text-slate-500">Loading location record...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (isError || !location) {
    return (
      <DashboardLayout active="Locations" title="Location Details">
        <div className="max-w-md mx-auto my-12 p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-4 shadow-xs">
          <AlertTriangle className="w-7 h-7 text-rose-600 mx-auto" />
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Location Not Found</h2>
            <p className="text-xs text-slate-500 mt-1">
              {(error as any)?.message || 'The requested location record could not be loaded.'}
            </p>
          </div>
          <Button onClick={() => navigate('/locations')} size="sm" className="bg-brand text-white text-xs font-bold">
            Back to Locations
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout active="Locations" title={`Location · ${location.code}`} fixedViewport>
      <div className="flex flex-col h-[calc(100vh-100px)] max-w-7xl mx-auto px-1 sm:px-2 gap-3 overflow-hidden">

        {/* ── TOP COMPACT HEADER STRIP ── */}
        <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-charcoal text-white dark:bg-slate-100 dark:text-slate-900 shrink-0">
              {location.code}
            </span>
            <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
              {location.name}
            </h1>
            {location.customer && (
              <Link
                to={`/customers/${location.customerId}`}
                className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline truncate border-l border-slate-200 dark:border-slate-800 pl-2.5"
              >
                <Building2 size={13} className="shrink-0" />
                {location.customer.name}
              </Link>
            )}
            <Badge
              variant={location.is_active ? 'default' : 'outline'}
              className={cn(
                'text-[10px] font-bold shrink-0',
                location.is_active ? 'bg-emerald-600 text-white' : 'text-slate-400 border-slate-300'
              )}
            >
              {location.is_active ? 'ACTIVE' : 'INACTIVE'}
            </Badge>
          </div>

          {/* Action Group */}
          <div className="flex items-center gap-2 shrink-0">
            {isEditing ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsEditing(false);
                    setFormError(null);
                  }}
                  className="h-7 text-xs font-semibold px-2.5"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={updateMutation.isPending}
                  onClick={handleSaveForm}
                  className="h-7 text-xs font-bold bg-brand hover:bg-brand-hover text-white shadow-xs gap-1 px-3"
                >
                  {updateMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  Save
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="h-7 text-xs font-bold bg-charcoal dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 shadow-xs gap-1 px-2.5"
                >
                  <Edit2 size={12} /> Edit
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 w-7 p-0 flex items-center justify-center">
                      <MoreVertical size={13} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44 text-xs font-medium">
                    <DropdownMenuItem onClick={() => navigate(`/customers/${location.customerId}`)}>
                      <Building2 className="w-3.5 h-3.5 text-indigo-600 mr-2" /> View Customer
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleCopyId}>
                      <Copy className="w-3.5 h-3.5 text-slate-500 mr-2" /> Copy ID
                    </DropdownMenuItem>
                    {hasValidCoords && (
                      <DropdownMenuItem onClick={openGoogleMaps}>
                        <ExternalLink className="w-3.5 h-3.5 text-emerald-600 mr-2" /> Google Maps
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {location.is_active ? (
                      <DropdownMenuItem
                        onClick={() => setIsDeactivateModalOpen(true)}
                        className="text-rose-600 focus:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Deactivate
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={handleToggleActive}
                        className="text-emerald-600 focus:text-emerald-600 font-bold"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-2" /> Restore Location
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>

        {/* ── Error Banner ── */}
        {formError && (
          <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 flex items-center justify-between text-rose-700 dark:text-rose-400 text-xs font-medium shrink-0">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="shrink-0 text-rose-600" />
              <span>{formError}</span>
            </div>
            <button onClick={() => setFormError(null)} className="p-1 hover:bg-rose-100 rounded">
              <X size={13} />
            </button>
          </div>
        )}

        {/* ── MAIN 2-COLUMN SINGLE VIEWPORT GRID ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 min-h-0 overflow-hidden">

          {/* ───────────────────────── LEFT 7 COLS: DETAILS & USAGE ───────────────────────── */}
          <div className="lg:col-span-7 flex flex-col gap-3 min-h-0 overflow-hidden">

            {/* LOCATION DETAILS / FORM CARD */}
            <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl shadow-2xs shrink-0">
              <CardContent className="p-3 space-y-2.5">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Location Identity & Address
                  </div>
                  {isEditing && (
                    <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                      Editing Mode
                    </span>
                  )}
                </div>

                {isEditing ? (
                  /* EDIT MODE */
                  <div className="space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                          Code <span className="text-brand">*</span>
                        </Label>
                        <Input
                          value={code}
                          onChange={(e) => setCode(e.target.value.toUpperCase())}
                          className="font-mono uppercase font-bold text-xs h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                          Name <span className="text-brand">*</span>
                        </Label>
                        <Input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="text-xs font-medium h-8"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        Street Address
                      </Label>
                      <Input
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="text-xs h-8"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">City</Label>
                        <Input value={city} onChange={(e) => setCity(e.target.value)} className="text-xs h-8" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Postal Code</Label>
                        <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className="text-xs font-mono h-8" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Country</Label>
                        <Input value={country} disabled className="text-xs bg-slate-50 dark:bg-slate-800 text-slate-400 h-8" />
                      </div>
                    </div>
                  </div>
                ) : (
                  /* VIEW MODE */
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 font-medium block">Code / Slug</span>
                      <div className="font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                        {location.code} <span className="text-[10px] text-slate-400 font-normal">({location.slug})</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 font-medium block">City & Country</span>
                      <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                        {location.city || 'Riyadh'}, Saudi Arabia
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 font-medium block">Postal Code</span>
                      <div className="font-mono text-slate-700 dark:text-slate-300 mt-0.5">
                        {location.postalCode || '—'}
                      </div>
                    </div>

                    <div className="col-span-2 sm:col-span-3 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                      <span className="text-[10px] text-slate-400 font-medium block">Address</span>
                      <div className="text-slate-800 dark:text-slate-200 font-medium mt-0.5 truncate">
                        {location.address || 'No street address specified.'}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* TABBED OPERATIONAL USAGE CARD */}
            <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl shadow-2xs flex-1 flex flex-col min-h-0 overflow-hidden">
              <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="flex flex-col h-full min-h-0">
                <div className="px-3 pt-2.5 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Operational Usage
                  </span>
                  <TabsList className="h-7 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <TabsTrigger value="quotations" className="h-6 px-2.5 text-[11px] font-bold rounded-md">
                      Quotations ({quotationCount})
                    </TabsTrigger>
                    <TabsTrigger value="trips" className="h-6 px-2.5 text-[11px] font-bold rounded-md">
                      Trip Stops ({tripCount})
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-3">
                  {/* QUOTATIONS TAB */}
                  <TabsContent value="quotations" className="m-0 h-full">
                    {location.quotationStops && location.quotationStops.length > 0 ? (
                      <div className="space-y-1.5">
                        {location.quotationStops.map((qs: any) => {
                          const q = qs.quotation;
                          if (!q) return null;
                          const origin = q.stops?.[0]?.location?.code || '—';
                          const dest = q.stops?.[q.stops.length - 1]?.location?.code || '—';
                          return (
                            <div
                              key={qs.id}
                              className="p-2 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between text-xs"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <FileText size={13} className="text-indigo-600 shrink-0" />
                                <span className="font-mono font-bold text-slate-900 dark:text-slate-100 truncate">
                                  {q.name || q.quotationNumber}
                                </span>
                                <span className="text-slate-600 dark:text-slate-300 font-medium truncate">
                                  {origin} → {dest}
                                </span>
                                <span className="font-mono font-bold text-slate-900 dark:text-slate-100 shrink-0">
                                  SAR {(q.rate ?? q.rate_amount) != null ? Number(q.rate ?? q.rate_amount).toLocaleString() : '—'}
                                </span>
                              </div>
                              <Link
                                to={`/quotations/${q.id}`}
                                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 flex items-center gap-0.5 shrink-0 ml-2"
                              >
                                Quote <ChevronRight size={12} />
                              </Link>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-400 text-xs py-8">
                        No commercial quotations link this location.
                      </div>
                    )}
                  </TabsContent>

                  {/* TRIPS TAB */}
                  <TabsContent value="trips" className="m-0 h-full">
                    {location.tripStops && location.tripStops.length > 0 ? (
                      <div className="space-y-1.5">
                        {location.tripStops.map((ts: any) => {
                          const t = ts.trip;
                          if (!t) return null;
                          const origin = t.stops?.[0]?.location?.code || t.stops?.[0]?.location_name || '—';
                          const dest = t.stops?.[t.stops.length - 1]?.location?.code || t.stops?.[t.stops.length - 1]?.location_name || '—';
                          return (
                            <div
                              key={ts.id}
                              className="p-2 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between text-xs"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Truck size={13} className="text-brand shrink-0" />
                                <span className="font-mono font-bold text-slate-900 dark:text-slate-100 shrink-0">
                                  {t.ref_id || t.id.substring(0, 8)}
                                </span>
                                <span className="text-slate-600 dark:text-slate-300 font-medium truncate">
                                  {origin} → {dest}
                                </span>
                                <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200 text-[10px] font-bold shrink-0">
                                  {t.status || 'Active'}
                                </Badge>
                              </div>
                              <Link
                                to={`/trips/${t.id}`}
                                className="text-[11px] font-bold text-brand hover:underline flex items-center gap-0.5 shrink-0 ml-2"
                              >
                                Trip <ChevronRight size={12} />
                              </Link>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-400 text-xs py-8">
                        No trips reference this location.
                      </div>
                    )}
                  </TabsContent>
                </div>
              </Tabs>
            </Card>

          </div>

          {/* ───────────────────────── RIGHT 5 COLS: MAP & RESOLVER ───────────────────────── */}
          <div className="lg:col-span-5 flex flex-col h-full min-h-0 overflow-hidden">
            <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl shadow-2xs flex-1 flex flex-col min-h-0 overflow-hidden">

              {/* RESOLVER INPUT BAR AT TOP OF MAP CARD */}
              <div className="p-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 shrink-0 relative" ref={dropdownRef}>
                <div className="relative">
                  <Input
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Paste Google Maps link, coordinates, or address search..."
                    className="text-xs pl-8 pr-20 h-8 bg-white dark:bg-slate-900"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  {isSearching && (
                    <div className="absolute right-2.5 top-2 flex items-center gap-1 text-[10px] text-slate-500 font-semibold">
                      <Loader2 className="w-3 h-3 animate-spin text-brand" /> Resolving
                    </div>
                  )}
                </div>

                {/* Autocomplete Suggestions Dropdown */}
                {showDropdown && suggestions.length > 0 && (
                  <div className="absolute z-50 left-2.5 right-2.5 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                    {suggestions.map((sugg) => (
                      <button
                        key={sugg.id}
                        type="button"
                        onClick={() => handleSelectSuggestion(sugg)}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-800/60 last:border-0 transition-colors flex items-start gap-2 text-xs"
                      >
                        <MapPin size={13} className="text-brand shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
                            {(sugg as any).text || (sugg as any).label || sugg.id}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {(sugg as any).secondaryText || (sugg as any).description || ''}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* MAP DISPLAY */}
              <div className="flex-1 min-h-[220px] w-full relative">
                {hasValidCoords ? (
                  <MapContainer
                    className="h-full w-full"
                    {...SAUDI_MAP_CONTAINER_PROPS}
                  >
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    />
                    <TileLayer
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                    />
                    <FlyToPin lat={numericLat} lng={numericLng} />
                    <MapClickHandler onMapClick={handleMapClick} enabled={isEditing} />
                    <Marker
                      position={[numericLat, numericLng]}
                      icon={customPinIcon}
                      draggable={isEditing}
                      eventHandlers={{
                        dragend(e) {
                          if (isEditing) {
                            const pos = e.target.getLatLng();
                            handleMapClick(pos.lat, pos.lng);
                          }
                        },
                      }}
                    />
                  </MapContainer>
                ) : (
                  <div className="h-full w-full bg-slate-50 dark:bg-slate-800/30 flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                    <MapPin size={24} className="opacity-40 mb-1" />
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      No Coordinates Pinned
                    </p>
                    <p className="text-[10px] text-slate-400 max-w-xs mt-0.5">
                      Paste a Google Maps link above or click on map in edit mode to pin coordinates.
                    </p>
                  </div>
                )}
              </div>

              {/* MAP FOOTER & CONTROLS */}
              <div className="p-2.5 bg-slate-50/80 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2 shrink-0">
                <div className="flex items-center gap-1.5">
                  {precision === 'EXACT' && (
                    <Badge className="bg-emerald-600 text-white text-[10px] font-bold gap-1">
                      <CheckCircle2 size={11} /> EXACT
                    </Badge>
                  )}
                  {precision === 'APPROXIMATE' && (
                    <Badge className="bg-indigo-600 text-white text-[10px] font-bold gap-1">
                      <ShieldCheck size={11} /> APPROXIMATE
                    </Badge>
                  )}
                  {precision === 'UNKNOWN' && (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-bold">
                      UNPINNED
                    </Badge>
                  )}
                  {hasValidCoords && (
                    <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                      {numericLat.toFixed(4)}, {numericLng.toFixed(4)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {hasValidCoords && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={openGoogleMaps}
                        className="h-6 px-2 text-[10px] font-bold gap-1 border-slate-200"
                        title="Open in Google Maps"
                      >
                        <ExternalLink size={11} /> Maps
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCopyCoordinates}
                        className="h-6 px-2 text-[10px] font-bold gap-1 border-slate-200"
                        title="Copy Lat/Lng"
                      >
                        {copiedCoords ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />} Coords
                      </Button>
                    </>
                  )}

                  {precision === 'APPROXIMATE' && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setPrecision('EXACT');
                        if (!isEditing) {
                          updateMutation.mutate({ coordinate_precision: 'EXACT' });
                        }
                      }}
                      className="h-6 px-2 text-[10px] font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                    >
                      Confirm Exact
                    </Button>
                  )}
                </div>
              </div>

            </Card>
          </div>

        </div>

      </div>

      {/* ── Confirm Deactivate Modal ── */}
      <ConfirmModal
        isOpen={isDeactivateModalOpen}
        onClose={() => setIsDeactivateModalOpen(false)}
        onConfirm={handleToggleActive}
        title="Deactivate Location?"
        message={`Deactivate "${location.name}" (${location.code})? It is currently referenced by ${quotationCount} quotation stops and ${tripCount} trip stops. Historical records remain intact.`}
        confirmLabel="Deactivate Location"
        isLoading={updateMutation.isPending}
      />
    </DashboardLayout>
  );
}
