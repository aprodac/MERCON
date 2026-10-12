import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import LocationPickerMap from '@/components/trips/LocationPickerMap';
import type { PinPayload } from '@/services/locationService';

interface SetPinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is being pinned — "Jeddah Hub". */
  placeName: string;
  /** The current (possibly approximate) pin, used as the starting point. */
  lat: number | null;
  lng: number | null;
  /** One line under the button saying where the pin will be saved. */
  footnote?: string;
  /** Saves the pin; throw to show the error in the box. */
  onSave: (pin: PinPayload) => Promise<void>;
  /** The driver's geotagged photos at this place — click one to put the pin where it was taken. */
  photoPins?: { id: string; lat: number; lng: number; label: string }[];
  /** Start on this photo's GPS (opened from a photo). */
  preselectPhotoId?: string | null;
}

/** Great-circle metres. */
function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const metersText = (m: number) => (m < 1000 ? `${Math.max(1, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`);

/**
 * The one "Set pin" box, used wherever a stop or location shows "Pin needed":
 * paste a Google Maps / WhatsApp link or search, drag the pin to the gate, save.
 */
export default function SetPinDialog({ open, onOpenChange, placeName, lat, lng, footnote, onSave, photoPins = [], preselectPhotoId = null }: SetPinDialogProps) {
  const [pinLat, setPinLat] = useState<number | null>(lat);
  const [pinLng, setPinLng] = useState<number | null>(lng);
  const [address, setAddress] = useState('');
  const [name, setName] = useState(placeName);
  const [moved, setMoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromPhoto, setFromPhoto] = useState<string | null>(null);

  // Start from the current pin every time the box opens.
  useEffect(() => {
    if (!open) return;
    setPinLat(lat);
    setPinLng(lng);
    setAddress('');
    setName(placeName);
    setMoved(false);
    setError(null);
    setFromPhoto(null);
    const pre = preselectPhotoId ? photoPins.find((p) => p.id === preselectPhotoId) : null;
    if (pre) { setPinLat(pre.lat); setPinLng(pre.lng); setMoved(true); setFromPhoto(pre.id); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lat, lng, placeName]);

  // Cross-check before saving: how far the pin moves from the current one.
  const shift = moved && pinLat != null && pinLng != null && lat != null && lng != null ? metersBetween({ lat, lng }, { lat: pinLat, lng: pinLng }) : null;

  const save = async () => {
    if (pinLat == null || pinLng == null) {
      setError('Paste a link, search, or click the map to place the pin.');
      return;
    }
    // Saving the old guess untouched would only relabel it "exact" — the very
    // mistake this box exists to fix.
    if (!moved) {
      setError('Paste a link, search, or move the pin onto the gate first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ lat: pinLat, lng: pinLng, address: address.trim() || null });
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e?.message || 'Could not save the pin.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Set pin · {placeName}</DialogTitle>
          <DialogDescription>
            {moved || lat == null
              ? 'Paste a location link or search, then drag the pin to the gate.'
              : 'The pin below is only a guess. Paste a location link or search, or drag it to the gate.'}
          </DialogDescription>
        </DialogHeader>

        {photoPins.length > 0 && (
          <div className="space-y-1.5 rounded-lg bg-blue-50 p-2.5 dark:bg-blue-950/30">
            <p className="text-xs font-semibold text-blue-900 dark:text-blue-200">From the driver's photos ({photoPins.length} with GPS)</p>
            <div className="flex flex-wrap gap-1.5">
              {photoPins.map((p, i) => {
                const away = lat != null && lng != null ? metersBetween({ lat, lng }, p) : null;
                const on = fromPhoto === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setPinLat(p.lat); setPinLng(p.lng); setMoved(true); setFromPhoto(p.id); setError(null); }}
                    className={on
                      ? 'rounded-full bg-blue-700 px-2.5 py-1 text-xs font-semibold text-white'
                      : 'rounded-full border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-900 hover:border-blue-400 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-200'}
                  >
                    Photo {i + 1} · {p.label}{away != null ? ` · ${metersText(away)} away` : ''}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {open && (
          <LocationPickerMap
            label=""
            pinOnly
            mapHeight={300}
            lat={pinLat}
            lng={pinLng}
            onChange={(la, ln) => { setPinLat(la); setPinLng(ln); setMoved(true); }}
            name={name}
            onNameChange={setName}
            address={address}
            onAddressChange={setAddress}
          />
        )}

        {shift != null && (
          <p className={shift > 2000
            ? 'rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
            : 'rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'}>
            {fromPhoto ? 'From the photo GPS · ' : ''}{metersText(shift)} from the current pin
            {shift > 2000 ? ' — far off; check it is the right place before saving' : ''}
          </p>
        )}

        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

        <div className="space-y-1.5">
          <Button onClick={save} disabled={saving} className="h-10 w-full gap-1.5 bg-charcoal text-white hover:bg-charcoal-strong">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Save pin
          </Button>
          {footnote && <p className="text-center text-[11px] text-muted-foreground">{footnote}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
