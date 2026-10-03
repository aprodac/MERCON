/**
 * "Set pin" for a stop — the operator-app twin of the web's Set pin box. Paste
 * the location link the customer sent (WhatsApp / Google Maps / "lat, lng"),
 * or search, then move the map so the pin sits on the gate, and save.
 *
 * The pin stays fixed in the middle of the map and the map moves under it —
 * easier with a thumb than dragging a small marker.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, TurboModuleRegistry } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Clipboard as ClipboardIcon, MapPin, Search } from 'lucide-react-native';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { operatorService } from '../../../../lib/operator';
import type { Stop } from '../tripDetailsModel';
import { MAP_STYLE_URL } from './TripMap';
import { ACTION, INK, MUTED } from './parts';

const hasNativeMap = (() => {
  try {
    return !!TurboModuleRegistry.get('MLRNNetworkModule');
  } catch {
    return false;
  }
})();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ML: typeof import('@maplibre/maplibre-react-native') | null = hasNativeMap ? require('@maplibre/maplibre-react-native') : null;

/** Riyadh — where the map opens when the stop has no pin at all. */
const DEFAULT_CENTER: [number, number] = [46.6753, 24.7136];

interface Props {
  target: { stop: Stop; label: string } | null;
  tripId: string;
  onClose: () => void;
  onSaved: () => void;
}

const hasPin = (s: Stop) => Number.isFinite(s.location_lat) && !!(s.location_lat || s.location_lng);

export function PinSheet({ target, tripId, onClose, onSaved }: Props) {
  const cameraRef = useRef<any>(null);
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [moved, setMoved] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: string; label: string; lat: number; lng: number }[]>([]);
  const [busy, setBusy] = useState<'paste' | 'search' | 'save' | null>(null);
  const [shownFor, setShownFor] = useState<Props['target']>(null);

  // Start from the stop's current (guessed) pin each time the sheet opens.
  if (target !== shownFor) {
    setShownFor(target);
    setCenter(target && hasPin(target.stop) ? [target.stop.location_lng, target.stop.location_lat] : null);
    setMoved(false);
    setAddress(null);
    setQuery('');
    setResults([]);
  }

  const goTo = (lat: number, lng: number, addr?: string | null) => {
    setCenter([lng, lat]);
    setMoved(true);
    setAddress(addr ?? null);
    setResults([]);
    cameraRef.current?.flyTo({ center: [lng, lat], zoom: 17, duration: 600 });
  };

  const pasteLink = async () => {
    const text = (await Clipboard.getStringAsync()).trim();
    if (!text) {
      Alert.alert('Nothing copied', 'Copy the location link from WhatsApp or Google Maps first.');
      return;
    }
    setBusy('paste');
    try {
      const r = await operatorService.resolveLocationText(text);
      goTo(r.lat, r.lng, r.address);
    } catch (e) {
      Alert.alert('Could not read that location', getApiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  // Search as the operator types, after a short pause.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) { setResults([]); return; }
    let live = true;
    const t = setTimeout(async () => {
      setBusy('search');
      try {
        const rows = await operatorService.searchPlaces(q);
        if (live) setResults(rows.slice(0, 5));
      } catch {
        if (live) setResults([]);
      } finally {
        if (live) setBusy(null);
      }
    }, 450);
    return () => { live = false; clearTimeout(t); };
  }, [query]);

  const save = async () => {
    if (!target) return;
    if (!center || !moved) {
      Alert.alert('Set the pin first', 'Paste the location link, search, or move the map so the pin is on the gate.');
      return;
    }
    setBusy('save');
    try {
      const r = await operatorService.pinStop(tripId, target.stop.id, { lat: center[1], lng: center[0], address });
      const others = r.other_trip_count;
      if (r.location_pinned) {
        Alert.alert('Pin saved', `Saved for ${target.stop.location?.name || target.label}${others > 0 ? ` and ${others} other open trip${others === 1 ? '' : 's'}` : ''}.`);
      }
      onSaved();
      onClose();
    } catch (e) {
      Alert.alert('Could not save the pin', getApiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const start = center ?? DEFAULT_CENTER;

  return (
    <AppModal visible={!!target} onClose={onClose} type="bottom-sheet" title={`Set pin · ${target?.label ?? ''}`} maxHeight="94%">
      <View style={{ gap: 10 }}>
        <TouchableOpacity style={s.paste} onPress={pasteLink} disabled={busy === 'paste'} activeOpacity={0.8}>
          {busy === 'paste' ? <ActivityIndicator size="small" color={INK} /> : <ClipboardIcon size={17} color={INK} />}
          <Text style={s.pasteText}>Paste location link</Text>
        </TouchableOpacity>

        <View style={s.search}>
          {busy === 'search' ? <ActivityIndicator size="small" color={MUTED} /> : <Search size={16} color={MUTED} />}
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Or search a place"
            placeholderTextColor="#9898A4"
            style={s.searchInput}
            returnKeyType="search"
          />
        </View>
        {results.length > 0 ? (
          <View style={s.results}>
            {results.map((r) => (
              <TouchableOpacity key={r.id} style={s.result} onPress={() => goTo(r.lat, r.lng, r.label)}>
                <MapPin size={14} color={MUTED} />
                <Text style={s.resultText} numberOfLines={2}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {ML ? (
          <View style={s.mapBox}>
            <ML.Map
              style={StyleSheet.absoluteFill}
              mapStyle={MAP_STYLE_URL}
              logo={false}
              compass={false}
              scaleBar={false}
              touchRotate={false}
              touchPitch={false}
              onRegionDidChange={(e) => {
                const ev = e.nativeEvent;
                setCenter(ev.center as [number, number]);
                if (ev.userInteraction) setMoved(true);
              }}
            >
              <ML.Camera ref={cameraRef} initialViewState={{ center: start, zoom: center ? 15 : 5 }} />
            </ML.Map>
            {/* The pin is the map's centre; its tip sits exactly on it. */}
            <View pointerEvents="none" style={s.centerPin}>
              <MapPin size={34} color="#E0503B" fill="#E0503B" strokeWidth={1.6} />
            </View>
            <View pointerEvents="none" style={s.mapHint}>
              <Text style={s.mapHintText}>{moved ? 'Pin placed — move the map to adjust' : 'Move the map so the pin is on the gate'}</Text>
            </View>
          </View>
        ) : (
          <Text style={s.noMap}>
            {moved && center ? `Pin: ${center[1].toFixed(5)}, ${center[0].toFixed(5)}` : 'Paste the link or search to set the pin. (Update the app to move the pin on a map.)'}
          </Text>
        )}

        {address ? <Text style={s.address} numberOfLines={2}>{address}</Text> : null}

        <TouchableOpacity style={[s.btn, busy === 'save' && { opacity: 0.7 }]} onPress={save} disabled={busy === 'save'}>
          <Text style={s.btnText}>{busy === 'save' ? 'Saving…' : 'Save pin'}</Text>
        </TouchableOpacity>
        <Text style={s.foot}>The driver's navigation, ETA and arrival use this pin.</Text>
      </View>
    </AppModal>
  );
}

const s = StyleSheet.create({
  paste: { height: 48, borderRadius: 14, backgroundColor: '#F1F1F3', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  pasteText: { fontSize: 15, fontWeight: '800', color: INK },
  search: { height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#E4E4E9', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 14, color: INK, paddingVertical: 0 },
  results: { borderRadius: 12, borderWidth: 1, borderColor: '#E4E4E9', overflow: 'hidden' },
  result: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E4E4E9' },
  resultText: { flex: 1, fontSize: 13, color: INK },
  mapBox: { height: 300, borderRadius: 16, overflow: 'hidden', backgroundColor: '#EFEBE3' },
  centerPin: { position: 'absolute', left: '50%', top: '50%', marginLeft: -17, marginTop: -34 },
  mapHint: { position: 'absolute', left: 10, bottom: 10, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  mapHintText: { fontSize: 12, fontWeight: '700', color: Colors.gray700 },
  noMap: { fontSize: 13, color: MUTED, lineHeight: 19 },
  address: { fontSize: 12, color: MUTED },
  btn: { height: 50, borderRadius: 14, backgroundColor: ACTION, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  foot: { fontSize: 11, color: MUTED, textAlign: 'center' },
});
