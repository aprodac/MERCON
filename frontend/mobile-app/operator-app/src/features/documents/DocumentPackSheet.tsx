/**
 * "Send documents" for one driver or one truck: tick the documents (and
 * photos) to send, keep or drop the details page, and they go out as ONE PDF
 * through the share sheet — a driver's pack and a truck's pack are separate.
 *
 * Documents come from GET /documents/owner-folder (the same per-owner folder
 * the web shows: one slot per document type, its current document and every
 * file in it). The details page is built from GET /drivers/:id or
 * GET /vehicles/:id, plus the trip it is sent for, when opened from a trip.
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Check, FileText, ImageIcon, ListChecks, Send } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { api, getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { INK, MUTED, tap } from '../trips/details/components/parts';
import { TONE } from '../trips/details/tripDetailsModel';
import { buildDocumentPack, sharePdf, type PackCover, type PackFile } from './documentPack';

export type PackOwnerKind = 'Driver' | 'Vehicle';

interface Slot {
  documentType: { id: string; name: string };
  document: { id: string; file_url: string | null; expiry_date: string | null; files?: { id: string; file_url: string }[] } | null;
}

interface Item extends PackFile {
  kind: 'pdf' | 'photo';
  note?: string;
  expired?: boolean;
  /** Off by default (e.g. the profile photo). */
  optional?: boolean;
}

const DAY = 86_400_000;
const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

async function loadItems(kind: PackOwnerKind, id: string): Promise<{ items: Item[]; cover: PackCover }> {
  const [folder, owner] = await Promise.all([
    api.get('/documents/owner-folder', { params: { ownerType: kind, ownerId: id } }),
    api.get(kind === 'Driver' ? `/drivers/${id}` : `/vehicles/${id}`),
  ]);
  const slots = (folder.data?.data?.slots ?? []) as Slot[];
  const items: Item[] = [];
  for (const s of slots) {
    const doc = s.document;
    if (!doc) continue;
    const urls = doc.files?.length ? doc.files.map((f) => ({ id: f.id, url: f.file_url })) : doc.file_url ? [{ id: doc.id, url: doc.file_url }] : [];
    const days = doc.expiry_date ? Math.floor((new Date(doc.expiry_date).getTime() - Date.now()) / DAY) : null;
    urls.forEach((u, i) => {
      items.push({
        id: `${doc.id}-${u.id}`,
        url: u.url,
        label: urls.length > 1 ? `${s.documentType.name} (${i + 1} of ${urls.length})` : s.documentType.name,
        kind: /\.pdf(?:\?|$)/i.test(u.url) ? 'pdf' : 'photo',
        note: doc.expiry_date ? `${days != null && days < 0 ? 'Expired' : 'Valid until'} ${fmtDate(doc.expiry_date)}` : undefined,
        expired: days != null && days < 0,
      });
    });
  }

  const o = owner.data?.data ?? {};
  let cover: PackCover;
  if (kind === 'Driver') {
    const name = `${o.first_name ?? ''} ${o.last_name ?? ''}`.trim() || 'Driver';
    cover = {
      title: name,
      subtitle: 'Driver details',
      rows: [
        ['Name', name],
        ...(o.ref_id ? [['Driver ID', o.ref_id] as [string, string]] : []),
        ...(o.phone_primary ? [['Phone', o.phone_primary] as [string, string]] : []),
        ...(o.license_number ? [['Licence number', o.license_number] as [string, string]] : []),
        ...(o.license_expiry ? [['Licence expiry', fmtDate(o.license_expiry)] as [string, string]] : []),
      ],
    };
    if (o.avatar_url) items.push({ id: `avatar-${id}`, url: o.avatar_url, label: 'Driver photo', kind: 'photo', optional: true });
  } else {
    cover = {
      title: o.plate_number || 'Truck',
      subtitle: 'Truck details',
      rows: [
        ['Plate number', o.plate_number || '—'],
        ...(o.ref_id ? [['Truck ID', o.ref_id] as [string, string]] : []),
        ...(o.asset_type ? [['Type', o.asset_type] as [string, string]] : []),
        ...(o.capacity_kg ? [['Capacity', `${Math.round(o.capacity_kg / 1000)} ton`] as [string, string]] : []),
        ...(o.trailer_number ? [['Trailer', `${o.trailer_number}${o.trailer_type ? ` · ${o.trailer_type}` : ''}`] as [string, string]] : []),
      ],
    };
    if (o.image_url) items.push({ id: `truck-${id}`, url: o.image_url, label: 'Truck photo', kind: 'photo', optional: true });
  }
  return { items, cover };
}

export function DocumentPackSheet({
  visible, onClose, kind, ownerId, ownerName, trip,
}: {
  visible: boolean;
  onClose: () => void;
  kind: PackOwnerKind;
  ownerId: string;
  ownerName: string;
  /** When sent for a trip: printed on the details page. */
  trip?: { ref?: string | null; route?: string | null; date?: string | null } | null;
}) {
  const q = useQuery({ queryKey: ['documents', 'pack', kind, ownerId], queryFn: () => loadItems(kind, ownerId), enabled: visible && !!ownerId });
  // Only what the operator changed; everything else is ticked except the optional photos.
  const [changed, setChanged] = useState<Record<string, boolean>>({});
  const [withCover, setWithCover] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  const isOn = (i: Item) => changed[i.id] ?? !i.optional;
  const chosen = items.filter(isOn);
  const toggle = (i: Item) => {
    tap();
    setChanged((c) => ({ ...c, [i.id]: !isOn(i) }));
  };
  const allOn = items.length > 0 && chosen.length === items.length;
  const setAll = (on: boolean) => setChanged(Object.fromEntries(items.map((i) => [i.id, on])));

  const send = async () => {
    if (!q.data || (!chosen.length && !withCover)) return;
    tap();
    const cover: PackCover | null = withCover
      ? {
        ...q.data.cover,
        rows: [
          ...q.data.cover.rows,
          ...(trip?.ref ? [['For trip', trip.ref] as [string, string]] : []),
          ...(trip?.route ? [['Route', trip.route] as [string, string]] : []),
          ...(trip?.date ? [['Trip date', trip.date] as [string, string]] : []),
        ],
      }
      : null;
    const fileName = `${ownerName} ${kind === 'Driver' ? 'driver' : 'truck'} documents${trip?.ref ? ` ${trip.ref}` : ''}`;
    try {
      setBusy('Preparing…');
      const res = await buildDocumentPack(chosen, cover, fileName, (done, total) => setBusy(total ? `Adding ${Math.min(done + 1, total)} of ${total}…` : 'Preparing…'));
      setBusy('Opening share…');
      await sharePdf(res.uri, `Send ${ownerName} documents`);
      if (res.skipped.length) Alert.alert('Some files were left out', `These couldn't be read and are not in the PDF:\n${res.skipped.join('\n')}`);
    } catch (e) {
      Alert.alert('Could not make the PDF', getApiErrorMessage(e) || (e as Error)?.message || 'Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppModal visible={visible} onClose={busy ? () => {} : onClose} type="bottom-sheet" title={`Send ${kind === 'Driver' ? 'driver' : 'truck'} documents`} maxHeight="88%">
      <Text style={s.lead} numberOfLines={2}>
        {ownerName} — tick what to send. It all goes as one PDF.
      </Text>

      {q.isLoading ? <ActivityIndicator style={{ marginVertical: 30 }} color={Colors.primary} />
        : q.error ? <Text style={[s.lead, { color: TONE.red.fg }]}>Couldn’t load the documents. {getApiErrorMessage(q.error)}</Text>
        : (
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: 6 }}>
            <Row
              on={withCover}
              icon={ListChecks}
              title="Details page"
              note={kind === 'Driver' ? 'Name, ID, phone, licence' : 'Plate, ID, type, capacity'}
              onPress={() => { tap(); setWithCover((v) => !v); }}
            />
            {items.length === 0 ? (
              <Text style={[s.lead, { marginTop: 10 }]}>No documents on file for this {kind === 'Driver' ? 'driver' : 'truck'} yet.</Text>
            ) : (
              <>
                <View style={s.listHead}>
                  <Text style={s.group}>Documents</Text>
                  <TouchableOpacity onPress={() => { tap(); setAll(!allOn); }} hitSlop={8}>
                    <Text style={s.all}>{allOn ? 'Clear all' : 'Select all'}</Text>
                  </TouchableOpacity>
                </View>
                {items.map((i) => (
                  <Row
                    key={i.id}
                    on={isOn(i)}
                    icon={i.kind === 'pdf' ? FileText : ImageIcon}
                    title={i.label}
                    note={i.note ?? (i.kind === 'pdf' ? 'PDF' : 'Photo')}
                    warn={i.expired}
                    onPress={() => toggle(i)}
                  />
                ))}
              </>
            )}
          </ScrollView>
        )}

      <TouchableOpacity
        style={[s.send, (busy || !q.data || (!chosen.length && !withCover)) && { opacity: 0.5 }]}
        disabled={!!busy || !q.data || (!chosen.length && !withCover)}
        onPress={send}
        activeOpacity={0.85}
      >
        {busy ? <ActivityIndicator size="small" color={Colors.white} /> : <Send size={17} color={Colors.white} strokeWidth={2.3} />}
        <Text style={s.sendText}>{busy ?? `Send ${chosen.length + (withCover ? 1 : 0)} as one PDF`}</Text>
      </TouchableOpacity>
    </AppModal>
  );
}

function Row({ on, icon: Icon, title, note, warn, onPress }: { on: boolean; icon: typeof FileText; title: string; note?: string; warn?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.7} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
      <View style={[s.box, on && s.boxOn]}>{on ? <Check size={14} color={Colors.white} strokeWidth={3} /> : null}</View>
      <Icon size={17} color={MUTED} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        {note ? <Text style={[s.note, warn && { color: TONE.red.fg, fontWeight: '600' }]} numberOfLines={1}>{note}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  lead: { fontSize: 13, color: MUTED, marginBottom: 10 },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 2 },
  group: { fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase' },
  all: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F1F3' },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: '#C9CCD6', alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  title: { fontSize: 15, fontWeight: '600', color: INK },
  note: { fontSize: 12, color: MUTED },
  send: { marginTop: 14, height: 50, borderRadius: 14, backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sendText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
});
