import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, MapPin, Loader2, Map as MapIcon, Pencil, Check } from 'lucide-react';
import {
  createAddressSearchSession,
  type AddressSearchSession,
  type AddressSuggestion,
} from '@/services/addressSearch';
import { isGoogleMapsUrl } from '@/utils/googleMapsLink';
import { usePastedLocation } from '@/hooks/usePastedLocation';
import AddressLanguagePicker from '@/components/ui/AddressLanguagePicker';
import PasteLocationStatus from '@/components/ui/PasteLocationStatus';
import { cn } from '@/lib/utils';
import { SAUDI_MAP_CONTAINER_PROPS } from '@/utils/saudiMapConfig';

const pinIcon = L.divIcon({
  html: `<div style="background-color: var(--color-brand); color: white; padding: 5px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 4px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; width: 26px; height: 26px;"></div>`,
  className: '',
  iconSize: [26, 26],
  iconAnchor: [13, 26],
});

interface LocationPickerMapProps {
  label: string;
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  /** Center the map here until a pin is placed. */
  defaultCenter?: [number, number];
  /** What this place is called, shown as the route label in delay reports. */
  name: string;
  onNameChange: (name: string) => void;
  /**
   * The full postal address behind the pin. Separate from `name` because the
   * name is a short label reports group by, while this is what the driver's
   * app needs to actually find the place — truncating one into the other is
   * lossy and can't be undone. Optional so callers that only want a pin and a
   * label (the older screens) don't have to care.
   */
  address?: string;
  onAddressChange?: (address: string) => void;
  /**
   * Compact layout: the address search is the only field on screen, and the
   * map and the name/address inputs stay folded away until they are actually
   * needed. Used by the create-trip wizard, where two of these sit side by
   * side and two permanently-open 220px maps pushed the schedule and the price
   * below the fold.
   */
  compact?: boolean;
  /** Compact only — height of the map once it is unfolded. */
  mapHeight?: number;
  /**
   * Pin only: the search box and an always-open map, no name or address
   * inputs. Used by the "Set pin" box, whose one job is to place the pin.
   */
  pinOnly?: boolean;
}

function ClickToPlacePin({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/** Recenters the map when a pin is set via address search (not on every render). */
function FlyToPin({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], Math.max(map.getZoom(), 13), { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);
  return null;
}

/** Leaflet measures its box once; inside a dialog that box is still animating in. */
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

export default function LocationPickerMap({ label, lat, lng, onChange, name, onNameChange, address, onAddressChange, defaultCenter = [24.7136, 46.6753], compact = false, mapHeight = 200, pinOnly = false }: LocationPickerMapProps) {
  const [query, setQuery] = useState('');
  /** Compact only — the map and the manual fields start folded. */
  const [mapOpen, setMapOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [results, setResults] = useState<AddressSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const paste = usePastedLocation();
  /**
   * Held in a ref so the query effect can call the newest resolver without
   * taking the hook as a dependency — adding it would re-run the search effect
   * on every status transition, re-issuing the very lookup that caused it.
   */
  const pasteRef = useRef(paste);
  pasteRef.current = paste;
  /** Both renderings of the last pasted pin, so the operator can switch. */
  const [addressOptions, setAddressOptions] = useState<{ en: string | null; ar: string | null }>({
    en: null,
    ar: null,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSearch = useRef(false);
  /**
   * The current search interaction. Held across keystrokes so all of them
   * share one billing session, and dropped after a pick — the session ends
   * with the Place Details lookup, so the next search must start a new one.
   */
  const sessionRef = useRef<AddressSearchSession | null>(null);
  /**
   * Identifies the only search whose response we still want. Debouncing does
   * not make searches mutually exclusive — clearing a timer that has already
   * fired does nothing, so a slow request stays in flight while the next one
   * starts, and responses can arrive out of order. Anything whose generation
   * no longer matches was superseded, by a later keystroke or by a pick, and
   * must not touch state.
   */
  const searchGeneration = useRef(0);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    setAddressOptions({ en: null, ar: null });
    if (!query.trim()) {
      setResults([]);
      pasteRef.current.reset();
      return;
    }

    // A pasted Google Maps link carries a pin, not a place name — resolve it
    // straight to coordinates instead of running it through Places search.
    // `usePastedLocation` owns the staleness guard, so a second paste landing
    // mid-flight cannot be overwritten by the first.
    if (isGoogleMapsUrl(query.trim())) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setResults([]);
      setShowResults(false);
      setSearching(false);
      void (async () => {
        // Drop the pin the moment it is known, before the address lookup.
        const place = await pasteRef.current.resolve(query.trim(), onChange);
        if (!place) return;
        onNameChange(place.name);
        // Full postal address, not the short label — this is what the driver
        // navigates to.
        onAddressChange?.(place.address);
        setAddressOptions({ en: place.addressEn, ar: place.addressAr });
        skipNextSearch.current = true;
        setQuery(place.address);
      })();
      return;
    }

    pasteRef.current.reset();

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const generation = ++searchGeneration.current;
      const current = () => generation === searchGeneration.current;
      setSearching(true);
      try {
        if (!sessionRef.current) sessionRef.current = createAddressSearchSession();
        const rows = await sessionRef.current.search(query);
        if (!current()) return;
        setResults(rows);
        setShowResults(true);
      } catch {
        if (current()) setResults([]);
      } finally {
        // Only the live request owns the spinner; a superseded one clearing it
        // would report "done" while the newest search is still running.
        if (current()) setSearching(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const pickResult = async (s: AddressSuggestion) => {
    const session = sessionRef.current;
    if (!session) return;
    // Retire any search still in flight. Without this, one landing after the
    // pick would re-open the dropdown over a session that is already spent.
    searchGeneration.current++;
    // Close the dropdown first: resolving is a network round trip, and leaving
    // the list open through it invites a second click on a spent session.
    setShowResults(false);
    const picked = await session.resolve(s.id);
    // The session is spent whether or not it answered — a token is billed once.
    sessionRef.current = null;
    if (!picked) return;

    onChange(picked.lat, picked.lng);
    // Fill the name from the address that was just searched, so the common
    // path costs no extra typing. Overwrites deliberately: a new pin is a new
    // place, and carrying the old label over would silently mislabel it.
    onNameChange(picked.name);
    // Keep the whole address too. This used to be thrown away the moment the
    // label was extracted, which is why a driver only ever received two
    // coordinates and no way to tell where they were going.
    onAddressChange?.(picked.address);
    skipNextSearch.current = true;
    setQuery(picked.address);
  };

  const center: [number, number] = lat != null && lng != null ? [lat, lng] : defaultCenter;
  const hasPin = lat != null && lng != null;
  // Every caller's form requires the name, so while it is still blank the
  // inputs stay open instead of hiding behind the disclosure.
  const showDetails = !compact || detailsOpen || !name.trim();

  const searchField = (
    <div className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder="Search an address, or paste a Google Maps link"
          className="w-full h-9 rounded-lg bg-muted/60 border border-transparent focus:border-primary/40 focus:bg-background pl-8 pr-8 text-sm outline-none transition-colors"
        />
        {(searching || paste.status.kind === 'resolving' || paste.status.kind === 'naming') && (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
        )}
      </div>
      <PasteLocationStatus status={paste.status} className="mt-1" />
      {showResults && results.length > 0 && (
        <div className="absolute z-[500] mt-1 w-full bg-popover text-popover-foreground rounded-md shadow-lg border max-h-52 overflow-y-auto">
          {results.map((r) => (
            <button
              type="button"
              key={r.id}
              onClick={() => void pickResult(r)}
              className="w-full text-left px-3 py-2 text-xs hover:bg-muted border-b border-border/50 last:border-b-0"
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const nameField = (
    <input
      type="text"
      value={name}
      onChange={(e) => onNameChange(e.target.value)}
      placeholder="Location name — e.g. Khamis Sorting Center"
      maxLength={120}
      className="w-full h-9 rounded-lg bg-muted/60 border border-transparent focus:border-primary/40 focus:bg-background px-3 text-sm outline-none transition-colors"
    />
  );

  // Editable so a pin dropped by hand (never searched) can still be given an
  // address — otherwise the driver gets coordinates and nothing else.
  const addressField = onAddressChange ? (
    <textarea
      value={address ?? ''}
      onChange={(e) => onAddressChange(e.target.value)}
      placeholder="Full address the driver will see — filled in when you search, editable"
      rows={2}
      maxLength={500}
      className="w-full rounded-lg bg-muted/60 border border-transparent focus:border-primary/40 focus:bg-background px-3 py-2 text-xs outline-none transition-colors resize-none"
    />
  ) : null;

  /**
   * Kept out of `addressField` on purpose: in compact mode that field hides
   * behind the "Edit" disclosure once a name is set, which is exactly the
   * state a freshly pasted link lands in — the choice has to stay on screen.
   */
  const languagePicker = onAddressChange ? (
    <AddressLanguagePicker
      addressEn={addressOptions.en}
      addressAr={addressOptions.ar}
      value={address ?? ''}
      onChange={onAddressChange}
    />
  ) : null;

  const mapBlock = (
    <div
      className="rounded-xl overflow-hidden border relative z-0"
      style={{ height: compact || pinOnly ? mapHeight : 220 }}
    >
      <MapContainer 
        center={center} 
        zoom={lat != null ? 14 : 6} 
        minZoom={SAUDI_MAP_CONTAINER_PROPS.minZoom}
        maxZoom={SAUDI_MAP_CONTAINER_PROPS.maxZoom}
        maxBounds={SAUDI_MAP_CONTAINER_PROPS.maxBounds}
        maxBoundsViscosity={SAUDI_MAP_CONTAINER_PROPS.maxBoundsViscosity}
        scrollWheelZoom 
        attributionControl={false} 
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; Esri'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
        />
        <MapResizer />
        <ClickToPlacePin onPick={onChange} />
        {lat != null && lng != null && (
          <>
            <FlyToPin lat={lat} lng={lng} />
            <Marker
              position={[lat, lng]}
              icon={pinIcon}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const m = e.target as L.Marker;
                  const pos = m.getLatLng();
                  onChange(pos.lat, pos.lng);
                },
              }}
            />
          </>
        )}
      </MapContainer>
    </div>
  );

  if (pinOnly) {
    return (
      <div className="flex flex-col gap-2">
        {searchField}
        {languagePicker}
        {mapBlock}
        <span className="text-[11px] text-muted-foreground">Drag the pin or click the map to put it on the gate.</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        {label && <label className="text-xs font-bold text-foreground">{label}</label>}

        {searchField}
        {languagePicker}

        {/* Driver location summary */}
        <div className="rounded-lg border bg-muted/20 px-2.5 py-1.5 space-y-0.5">
          <p className={cn('text-xs font-bold truncate', !name.trim() && 'font-medium text-muted-foreground')}>
            {name.trim() || 'Unnamed Location'}
          </p>
          {address?.trim() && (
            <p className="text-[11px] text-muted-foreground line-clamp-1">{address}</p>
          )}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1 truncate">
              <MapPin size={10} className="shrink-0 text-brand" />
              {hasPin ? `${lat!.toFixed(4)}, ${lng!.toFixed(4)}` : 'No pin set'}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setDetailsOpen((o) => !o)}
                className="flex items-center gap-1 rounded-md border border-border/70 bg-background px-2 py-0.5 text-[10px] font-semibold hover:bg-muted transition-colors"
              >
                {detailsOpen ? <Check size={10} /> : <Pencil size={10} />}
                {detailsOpen ? 'Done' : 'Edit'}
              </button>
              <button
                type="button"
                onClick={() => setMapOpen((o) => !o)}
                className={cn(
                  'flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors',
                  mapOpen
                    ? 'border-brand/40 bg-brand/10 text-brand'
                    : 'border-border/70 bg-background hover:bg-muted'
                )}
              >
                <MapIcon size={10} />
                {mapOpen ? 'Hide map' : 'Map Pin'}
              </button>
            </div>
          </div>
        </div>

        {showDetails && (
          <div className="flex flex-col gap-1.5">
            {nameField}
            {addressField}
          </div>
        )}

        {mapOpen && (
          <div className="flex flex-col gap-1">
            {mapBlock}
            <span className="text-[10px] text-muted-foreground">
              Click map or drag pin to adjust coordinates.
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="col-span-1 md:col-span-2 flex flex-col gap-1.5">
      <label className="text-xs font-bold text-foreground">{label}</label>

      {searchField}
      {nameField}
      {addressField}
      {languagePicker}
      {mapBlock}

      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <MapPin size={11} />
        {hasPin ? (
          <span>{lat!.toFixed(6)}, {lng!.toFixed(6)}</span>
        ) : (
          <span>Search an address or click the map to drop a pin</span>
        )}
      </div>
    </div>
  );
}
