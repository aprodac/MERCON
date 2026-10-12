/**
 * "Set pin" for a stop — the operator-app twin of the web's Set pin box. Paste
 * the location link the customer sent (WhatsApp / Google Maps / "lat, lng"),
 * or search, then move the map so the pin sits on the gate, and save.
 *
 * The pin stays fixed in the middle of the map and the map moves under it —
 * easier with a thumb than dragging a small marker.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { getStringAsync } from '../../../../lib/clipboard';
import { Camera, Clipboard as ClipboardIcon, Crosshair, MapPin, Search, TriangleAlert } from 'lucide-react-native';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { operatorService } from '../../../../lib/operator';
import { haversineKm, metersText, type PhotoPin, type Stop } from '../tripDetailsModel';
import { MAP_STYLE_URL } from './TripMap';
import { ACTION, INK, MUTED } from './parts';
import { ML } from '../../../../lib/maplibre';

/** Riyadh — where the map opens when the stop has no pin at all. */
const DEFAULT_CENTER: [number, number] = [46.6753, 24.7136];

interface Props {
  /** `photoPins`: the driver's geotagged photos at this stop, offered as the pin. `preselect`: start on that photo. */
  target: { stop: Stop; label: string; photoPins?: PhotoPin[]; preselect?: string | null } | null;
  /** Formats a photo's time ("08:23"). */
  timeOf?: (iso: string) => string;
  tripId: string;
  onClose: () => void;
  onSaved: () => void;
}

const hasPin = (s: Stop) => Number.isFinite(s.location_lat) && !!(s.location_lat || s.location_lng);

/** A pin chosen on the sheet. `exact`: pasted link or the map moved by hand; a search pick is approximate. */
export interface PickedPin {
  lat: number;
  lng: number;
  address: string | null;
  exact: boolean;
}

/** "Set pin" for a trip's stop — saved on the stop, its place and the place's other open trips. */
export function PinSheet({ target, tripId, timeOf, onClose, onSaved }: Props) {
  const save = async (pin: PickedPin) => {
    if (!target) return;
    const r = await operatorService.pinStop(tripId, target.stop.id, { lat: pin.lat, lng: pin.lng, address: pin.address });
    const others = r.other_trip_count;
    if (r.location_pinned) {
      Alert.alert('Pin saved', `Saved for ${target.stop.location?.name || target.label}${others > 0 ? ` and ${others} other open trip${others === 1 ? '' : 's'}` : ''}.`);
    }
    onSaved();
    onClose();
  };
  return (
    <PinPickerSheet
      visible={!!target}
      title={`Set pin · ${target?.label ?? ''}`}
      start={target && hasPin(target.stop) ? { lat: target.stop.location_lat, lng: target.stop.location_lng } : null}
      photoPins={target?.photoPins}
      preselectPhotoId={target?.preselect ?? null}
      timeOf={timeOf}
      onSave={save}
      onClose={onClose}
    />
  );
}

/**
 * The pin picker itself: paste a link, search, or move the map. `onSave` gets
 * the pin; when it throws the sheet stays open and the error is shown.
 */
export function PinPickerSheet({
  visible,
  title,
  start: startPin,
  initialQuery = '',
  saveLabel = 'Save pin',
  footer,
  photoPins = [],
  preselectPhotoId = null,
  timeOf,
  onSave,
  onClose,
}: {
  visible: boolean;
  title: string;
  start?: { lat: number; lng: number } | null;
  /** The driver's geotagged photos at this place — tap one to put the pin where it was taken. */
  photoPins?: PhotoPin[];
  preselectPhotoId?: string | null;
  timeOf?: (iso: string) => string;
  initialQuery?: string;
  saveLabel?: string;
  footer?: React.ReactNode;
  onSave: (pin: PickedPin) => Promise<void>;
  onClose: () => void;
}) {
  const cameraRef = useRef<any>(null);
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [moved, setMoved] = useState(false);
  const [exact, setExact] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: string; label: string; lat: number; lng: number }[]>([]);
  const [busy, setBusy] = useState<'paste' | 'search' | 'save' | null>(null);
  const [shown, setShown] = useState(false);
  /** Which photo's GPS the pin came from, if any. */
  const [fromPhoto, setFromPhoto] = useState<string | null>(null);

  // Start from the current (guessed) pin each time the sheet opens.
  if (visible !== shown) {
    setShown(visible);
    if (visible) {
      setCenter(startPin ? [startPin.lng, startPin.lat] : null);
      setMoved(false);
      setExact(false);
      setAddress(null);
      setQuery(initialQuery);
      setResults([]);
      setFromPhoto(null);
    }
  }

  // Opened from a photo: start with the pin on that photo's GPS.
  useEffect(() => {
    if (!visible || !preselectPhotoId) return;
    const p = photoPins.find((x) => x.id === preselectPhotoId);
    if (p) setTimeout(() => usePhoto(p), 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, preselectPhotoId]);

  const goTo = (lat: number, lng: number, addr: string | null | undefined, isExact: boolean) => {
    setCenter([lng, lat]);
    setMoved(true);
    setExact(isExact);
    setAddress(addr ?? null);
    setResults([]);
    setFromPhoto(null);
    cameraRef.current?.flyTo({ center: [lng, lat], zoom: 17, duration: 600 });
  };

  // A photo's GPS: where the driver's phone was, so close to the gate but worth a look on the map.
  const usePhoto = (p: PhotoPin) => {
    goTo(p.lat, p.lng, null, true);
    setFromPhoto(p.id);
  };

  // How far the new pin is from the current one — the cross-check before saving.
  const shift = moved && center && startPin ? haversineKm({ lat: startPin.lat, lng: startPin.lng }, { lat: center[1], lng: center[0] }) * 1000 : null;
  // Photos far apart from each other: the driver may have taken some on the way.
  const spread = photoPins.length > 1
    ? Math.max(...photoPins.map((a) => Math.max(...photoPins.map((b) => haversineKm(a, b) * 1000))))
    : 0;

  const pasteLink = async () => {
    const text = (await getStringAsync()).trim();
    if (!text) {
      Alert.alert('Nothing copied', 'Copy the location link from WhatsApp or Google Maps first.');
      return;
    }
    setBusy('paste');
    try {
      const r = await operatorService.resolveLocationText(text);
      goTo(r.lat, r.lng, r.address, true);
    } catch (e) {
      Alert.alert('Could not read that location', getApiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  // Search as the operator types, after a short pause.
  useEffect(() => {
    const q = query.trim();
    if (!visible || q.length < 3) { setResults([]); return; }
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
  }, [query, visible]);

  const save = async () => {
    if (!center || !moved) {
      Alert.alert('Set the pin first', 'Paste the location link, search, or move the map so the pin is on the gate.');
      return;
    }
    setBusy('save');
    try {
      await onSave({ lat: center[1], lng: center[0], address, exact });
    } catch (e) {
      Alert.alert('Could not save the pin', getApiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const start = center ?? DEFAULT_CENTER;
  // Local copy so the marker list below can use it (ML is null on builds without the native map).
  const PhotoMarker = ML ? ML.Marker : View;

  return (
    <AppModal visible={visible} onClose={onClose} type="bottom-sheet" title={title} maxHeight="94%">
      <View style={{ gap: 10 }}>
        {photoPins.length > 0 ? (
          <View style={s.photoBox}>
            <View style={s.photoHead}>
              <Camera size={14} color="#1D4ED8" />
              <Text style={s.photoHeadText}>From the driver's photos ({photoPins.length} with GPS)</Text>
            </View>
            <View style={s.photoChips}>
              {photoPins.map((p, i) => {
                const away = startPin ? haversineKm(startPin, p) * 1000 : null;
                const on = fromPhoto === p.id;
                return (
                  <TouchableOpacity key={p.id} style={[s.photoChip, on && s.photoChipOn]} onPress={() => usePhoto(p)} accessibilityRole="button" accessibilityState={{ selected: on }}>
                    <Crosshair size={13} color={on ? '#FFFFFF' : '#1D4ED8'} />
                    <Text style={[s.photoChipText, on && { color: '#FFFFFF' }]} numberOfLines={1}>
                      Photo {i + 1}{timeOf ? ` · ${timeOf(p.captured_at)}` : ''}{away != null ? ` · ${metersText(away)} away` : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {spread > 300 ? (
              <Text style={s.photoWarn}>These photos are {metersText(spread)} apart — pick the one taken at the gate.</Text>
            ) : null}
          </View>
        ) : null}

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
              <TouchableOpacity key={r.id} style={s.result} onPress={() => goTo(r.lat, r.lng, r.label, false)}>
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
                // Moving the map by hand puts the pin on the gate: exact.
                if (ev.userInteraction) {
                  setMoved(true);
                  setExact(true);
                }
              }}
            >
              <ML.Camera ref={cameraRef} initialViewState={{ center: start, zoom: center ? 15 : 5 }} />
              {/* The pin as it is now (grey) and where each photo was taken (blue) — to compare before saving. */}
              {startPin ? (
                <ML.Marker id="current-pin" lngLat={[startPin.lng, startPin.lat]} anchor="center">
                  <View style={s.oldPin}><Text style={s.oldPinText}>NOW</Text></View>
                </ML.Marker>
              ) : null}
              {photoPins.map((p, i) => (
                <PhotoMarker key={p.id} id={`photo-${p.id}`} lngLat={[p.lng, p.lat]} anchor="center">
                  <View style={[s.photoDot, fromPhoto === p.id && s.photoDotOn]}><Text style={s.photoDotText}>{i + 1}</Text></View>
                </PhotoMarker>
              ))}
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

        {shift != null ? (
          <View style={[s.check, shift > 2000 && s.checkWarn]}>
            {shift > 2000 ? <TriangleAlert size={14} color="#B45309" /> : <MapPin size={14} color="#15803D" />}
            <Text style={[s.checkText, shift > 2000 && { color: '#78350F' }]}>
              {fromPhoto ? 'From the photo GPS · ' : ''}{metersText(shift)} from the current pin
              {shift > 2000 ? ' — far off; check it is the right place before saving' : ''}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity style={[s.btn, busy === 'save' && { opacity: 0.7 }]} onPress={save} disabled={busy === 'save'}>
          <Text style={s.btnText}>{busy === 'save' ? 'Saving…' : saveLabel}</Text>
        </TouchableOpacity>
        {footer}
        <Text style={s.foot}>The driver's navigation, ETA and arrival use this pin.</Text>
      </View>
    </AppModal>
  );
}

const s = StyleSheet.create({
  photoBox: { borderRadius: 14, backgroundColor: '#EFF4FF', padding: 10, gap: 8 },
  photoHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  photoHeadText: { fontSize: 13, fontWeight: '800', color: '#1E3A8A' },
  photoChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  photoChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFFFFF', borderRadius: 999, borderWidth: 1, borderColor: '#BFDBFE', paddingHorizontal: 10, paddingVertical: 6, maxWidth: '100%' },
  photoChipOn: { backgroundColor: '#1D4ED8', borderColor: '#1D4ED8' },
  photoChipText: { fontSize: 12, fontWeight: '700', color: '#1E3A8A' },
  photoWarn: { fontSize: 12, color: '#78350F' },
  oldPin: { backgroundColor: '#6B7280', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 2, borderColor: '#FFFFFF' },
  oldPinText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  photoDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#3B82F6', borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  photoDotOn: { backgroundColor: '#1D4ED8', transform: [{ scale: 1.15 }] },
  photoDotText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, backgroundColor: '#ECFDF3', paddingHorizontal: 10, paddingVertical: 8 },
  checkWarn: { backgroundColor: '#FFFBEB' },
  checkText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#14532D' },
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
