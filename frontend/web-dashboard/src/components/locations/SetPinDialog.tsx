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
}

/**
 * The one "Set pin" box, used wherever a stop or location shows "Pin needed":
 * paste a Google Maps / WhatsApp link or search, drag the pin to the gate, save.
 */
export default function SetPinDialog({ open, onOpenChange, placeName, lat, lng, footnote, onSave }: SetPinDialogProps) {
  const [pinLat, setPinLat] = useState<number | null>(lat);
  const [pinLng, setPinLng] = useState<number | null>(lng);
  const [address, setAddress] = useState('');
  const [name, setName] = useState(placeName);
  const [moved, setMoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from the current pin every time the box opens.
  useEffect(() => {
    if (!open) return;
    setPinLat(lat);
    setPinLng(lng);
    setAddress('');
    setName(placeName);
    setMoved(false);
    setError(null);
  }, [open, lat, lng, placeName]);

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
