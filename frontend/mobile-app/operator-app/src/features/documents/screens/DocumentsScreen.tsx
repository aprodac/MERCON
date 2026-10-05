/**
 * Documents — driver and truck documents, kept apart and grouped by who they
 * belong to. Route: /documents.
 *
 * Shows what the web's document folders show, by the same rule: one line per
 * document type set up for drivers / trucks (Settings → document types, not
 * the disabled ones), holding the newest document filed under it — or
 * "Missing". Old files and files with no document type are left out.
 *
 * Top switch: Drivers | Vehicles | Company. Under it the status pills, search, then a
 * grid of folders — one per driver or truck, coloured by its worst document:
 * red when something is expired or missing, amber when something is about to
 * expire, green when everything is in order. Open a folder to see its
 * documents as sheets in the same colours; tap a sheet to view the file,
 * upload a new one (a file such as a PDF, or a photo from the camera or gallery, with its expiry date)
 * or delete it — deleted documents go to the web's Recently deleted for 30 days.
 *
 * Company has no folders: it is one folder, opened straight away — the
 * company document types from Settings, or (when none are set up) Contract,
 * Insurance, Invoice and Customs clearance, plus every company document on file.
 *
 * WhatsApp in an open folder turns its sheets into a pick list: choose the
 * documents, then the files themselves go through the phone's share sheet.
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Linking, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookUser, Camera, ClipboardCheck, Eye, FileBadge, FileSignature, FileText, FolderOpen, IdCard, ImageIcon,
  Plus, ShieldCheck, Trash2, Truck, ArrowLeft, Building2, Check, Upload, X, type LucideIcon,
} from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { api, getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';
import { capturePhoto, pickFromGallery } from '@mercon/mobile-shared/lib/camera';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { DatePickerModal } from '@mercon/mobile-shared/components/common/DateTimePickerModal';
import { EmptyState, ErrorState, SkeletonBlock } from '@mercon/mobile-shared/ui';
import { AppTopBar } from '@/components/AppTopBar';
import { FilterChips } from '@/components/FilterChips';
import { ListSearch, listPage } from '@/components/ListSearch';
import { CompanyAvatar, shortName } from '@/features/trips/create/components/ui';
import { WhatsAppIcon } from '@/features/dashboard/components/VehicleCard';
import { shareDocumentFiles } from '../shareDocuments';

const INK = '#3E3C3D';
const MUTED = '#6B6B76';
const DAY = 86_400_000;
const PAGE_SIZE = 200;
const MAX_PAGES = 5;
/** Same window as the backend's documentStatusService. */
const EXPIRING_DAYS = 30;

type Kind = 'Driver' | 'Vehicle' | 'Company';

/** The id the web files company documents under (UploadDocumentModal's COMPANY_ENTITY_ID). */
const COMPANY_ID = '00000000-0000-0000-0000-000000000000';
/** Kinds a company document can be filed as when Settings has no company document types (backend DocType values). */
const COMPANY_KINDS: [string, string][] = [['Contract', 'Contract'], ['Insurance', 'Insurance'], ['Invoice', 'Invoice'], ['CustomsClearance', 'Customs clearance']];
type State = 'expired' | 'expiring' | 'missing' | 'valid' | 'optional';
type Filter = 'all' | 'expired' | 'expiring' | 'missing' | 'valid';

interface DocumentType {
  id: string;
  name: string;
  ownerType: string;
  requirementStatus: 'MANDATORY' | 'OPTIONAL' | 'DISABLED';
  isActive: boolean;
  displayOrder: number;
  requiresExpiryDate: boolean;
  requiresIssueDate: boolean;
  /** Not a configured type: file it under this legacy doc_type instead of a document_type_id. */
  legacy?: string;
}

interface FiledDocument {
  id: string;
  entity_type: string;
  entity_id: string | null;
  documentTypeId: string | null;
  doc_type?: string | null;
  file_url: string | null;
  expiry_date: string | null;
  files?: { id: string; file_url: string }[];
}

interface Owner { id: string; kind: Kind; name: string; sub?: string; photo?: string | null }
interface Slot { type: DocumentType; doc: FiledDocument | null; state: State; days: number | null }
interface Group { owner: Owner; slots: Slot[]; worst: number; requiredDone: number; requiredTotal: number }

/** Lower comes first: what needs attention leads its card, and its owner leads the list. */
const RANK: Record<State, number> = { expired: 0, missing: 1, expiring: 2, valid: 3, optional: 4 };

function slotOf(type: DocumentType, doc: FiledDocument | null, now: number): Slot {
  if (!doc) return { type, doc, state: type.requirementStatus === 'MANDATORY' ? 'missing' : 'optional', days: null };
  if (!type.requiresExpiryDate || !doc.expiry_date) return { type, doc, state: 'valid', days: null };
  const days = Math.floor((new Date(doc.expiry_date).getTime() - now) / DAY);
  if (Number.isNaN(days)) return { type, doc, state: 'valid', days: null };
  return { type, doc, state: days < 0 ? 'expired' : days <= EXPIRING_DAYS ? 'expiring' : 'valid', days };
}

function slotText(s: Slot): string {
  if (s.state === 'missing') return 'Missing';
  if (s.state === 'optional') return 'Not added';
  if (s.days === null || !s.doc?.expiry_date) return 'On file';
  const date = new Date(s.doc.expiry_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (s.state === 'expired') return s.days === -1 ? 'Expired yesterday' : s.days >= -60 ? `Expired ${-s.days} days ago` : `Expired ${date}`;
  if (s.state === 'expiring') return s.days === 0 ? 'Expires today' : s.days === 1 ? 'Expires tomorrow' : `Expires in ${s.days} days`;
  return `Valid until ${date}`;
}

/** Each state has its own colour, so a card reads at a glance: red expired, amber expiring, green in order. */
const TONE: Record<State, { fg: string; bg: string; edge: string; fold: string; label: string }> = {
  expired: { fg: '#B42318', bg: '#FEF3F2', edge: '#FECDCA', fold: '#FDA29B', label: 'Expired' },
  missing: { fg: '#B42318', bg: '#FFFFFF', edge: '#FDA29B', fold: '#FECDCA', label: 'Missing' },
  expiring: { fg: '#B45309', bg: '#FFF8EB', edge: '#FEDF89', fold: '#FEC84B', label: 'Expiring' },
  valid: { fg: '#146C3C', bg: '#ECFDF3', edge: '#ABEFC6', fold: '#75E0A7', label: 'Valid' },
  optional: { fg: '#6B6B76', bg: '#FFFFFF', edge: '#D9D9DE', fold: '#E9E9EC', label: 'Not added' },
};

/** The second line on a document: the date that matters for its state. */
function slotDate(s: Slot): string {
  if (!s.doc) return s.state === 'missing' ? 'Tap to upload' : 'Optional';
  if (s.days === null || !s.doc.expiry_date) return 'No expiry date';
  if (s.state === 'expiring') return s.days === 0 ? 'Today' : s.days === 1 ? 'Tomorrow' : `In ${s.days} days`;
  return new Date(s.doc.expiry_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** An icon for the kind of document, so a licence and an insurance paper don't look the same. */
function docIcon(label: string): LucideIcon {
  const t = label.toLowerCase();
  if (/licen[cs]e|iqama|identity/.test(t)) return IdCard;
  if (/passport|visa/.test(t)) return BookUser;
  if (/insurance/.test(t)) return ShieldCheck;
  if (/registration|isth?imara|card|plate/.test(t)) return FileBadge;
  if (/fahas|inspection|mvpi|check/.test(t)) return ClipboardCheck;
  if (/contract|agreement/.test(t)) return FileSignature;
  return FileText;
}

async function fetchTypes(): Promise<DocumentType[]> {
  const { data } = await api.get('/document-types', { params: { isActive: true } });
  return ((data.data ?? []) as DocumentType[])
    .filter((t) => t.isActive !== false && t.requirementStatus !== 'DISABLED')
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

/** Newest first, as the web's folders read them — so the first document met for a type is the current one. */
async function fetchFiled(): Promise<FiledDocument[]> {
  const all: FiledDocument[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data } = await api.get('/documents', { params: { scope: 'library', per_page: PAGE_SIZE, page } });
    const rows = (data.data ?? []) as FiledDocument[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE || all.length >= (data.meta?.total ?? 0)) break;
  }
  return all;
}

async function fetchOwners(): Promise<Owner[]> {
  const [drivers, vehicles] = await Promise.all([
    api.get('/drivers', { params: { per_page: 1000 } }),
    api.get('/vehicles', { params: { mode: 'lookup', per_page: 1000 } }),
  ]);
  const owners: Owner[] = [];
  for (const d of (drivers.data.data ?? []) as { id: string; first_name?: string; last_name?: string; ref_id?: string | null; avatar_url?: string | null; photo_url?: string | null }[]) {
    owners.push({ id: d.id, kind: 'Driver', name: shortName(`${d.first_name ?? ''} ${d.last_name ?? ''}`.trim()) || 'Driver', sub: d.ref_id ?? undefined, photo: d.avatar_url ?? d.photo_url });
  }
  for (const v of (vehicles.data.data ?? []) as { id: string; plate_number?: string; ref_id?: string | null }[]) {
    owners.push({ id: v.id, kind: 'Vehicle', name: v.plate_number || 'Truck', sub: v.ref_id ?? undefined });
  }
  return owners;
}

const toIso = (ddmmyyyy: string): string | null => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(ddmmyyyy.trim());
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const todayText = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

export default function DocumentsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<Kind>('Driver');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<{ owner: Owner; slot: Slot } | null>(null);
  /** The folder that is open; null = the grid of folders. */
  const [openId, setOpenId] = useState<string | null>(null);
  // Fixed while the page is open, so a line doesn't change group mid-scroll; refresh moves it on.
  const [now, setNow] = useState(() => Date.now());

  const types = useQuery({ queryKey: ['documents', 'types'], queryFn: fetchTypes, staleTime: 5 * 60_000 });
  const filed = useQuery({ queryKey: ['documents', 'filed'], queryFn: fetchFiled });
  const owners = useQuery({ queryKey: ['documents', 'owner-list'], queryFn: fetchOwners, staleTime: 5 * 60_000 });

  const groups = useMemo(() => {
    // owner id → document type id → its newest document
    const current = new Map<string, Map<string, FiledDocument>>();
    for (const doc of filed.data ?? []) {
      if (!doc.entity_id || !doc.documentTypeId) continue;
      let perType = current.get(doc.entity_id);
      if (!perType) { perType = new Map(); current.set(doc.entity_id, perType); }
      if (!perType.has(doc.documentTypeId)) perType.set(doc.documentTypeId, doc);
    }
    const toGroup = (owner: Owner, slots: Slot[]): Group => {
      const required = slots.filter((x) => x.type.requirementStatus === 'MANDATORY');
      return {
        owner,
        slots,
        worst: Math.min(4, ...slots.map((x) => RANK[x.state])),
        requiredTotal: required.length,
        requiredDone: required.filter((x) => x.state === 'valid' || x.state === 'expiring').length,
      };
    };
    const list = (owners.data ?? []).map((owner) => toGroup(
      owner,
      (types.data ?? []).filter((t) => t.ownerType === owner.kind).map((t) => slotOf(t, current.get(owner.id)?.get(t.id) ?? null, now)),
    ));

    // The company's one folder: its configured types (or the fallback kinds), then every other company document on file.
    const companyDocs = (filed.data ?? []).filter((d) => d.entity_type === 'Company' || d.entity_type === 'Other');
    const companyTypes = (types.data ?? []).filter((t) => t.ownerType === 'Company');
    const used = new Set<string>();
    const typed = companyTypes.map((t) => {
      const doc = companyDocs.find((d) => d.documentTypeId === t.id) ?? null;
      if (doc) used.add(doc.id);
      return slotOf(t, doc, now);
    });
    const pseudo = (id: string, name: string, legacy: string): DocumentType => ({
      id, name, legacy, ownerType: 'Company', requirementStatus: 'OPTIONAL', isActive: true, displayOrder: 0, requiresExpiryDate: false, requiresIssueDate: false,
    });
    const others = companyDocs.filter((d) => !used.has(d.id)).map((d) => {
      const kindName = COMPANY_KINDS.find(([code]) => code === d.doc_type)?.[1] ?? d.doc_type ?? 'Document';
      return slotOf({ ...pseudo(`doc:${d.id}`, kindName, d.doc_type || 'Contract'), requiresExpiryDate: true }, d, now);
    });
    const blanks = companyTypes.length ? [] : COMPANY_KINDS.map(([code, name]) => slotOf(pseudo(`new:${code}`, name, code), null, now));
    list.push(toGroup({ id: COMPANY_ID, kind: 'Company', name: 'Company' }, [...typed, ...others, ...blanks]));
    return list;
  }, [owners.data, types.data, filed.data, now]);

  const ofKind = useMemo(() => groups.filter((g) => g.owner.kind === kind && g.owner.kind !== 'Company'), [groups, kind]);
  const kindCounts = useMemo(() => {
    const c: Record<Kind, number> = { Driver: 0, Vehicle: 0, Company: 0 };
    // Drivers and trucks count folders; the company is one folder, so it counts its documents.
    for (const g of groups) c[g.owner.kind] += g.owner.kind === 'Company' ? g.slots.filter((x) => x.doc).length : 1;
    return c;
  }, [groups]);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, expired: 0, expiring: 0, missing: 0, valid: 0 };
    for (const g of ofKind) for (const x of g.slots) { if (x.state !== 'optional') { c.all += 1; c[x.state] += 1; } }
    return c;
  }, [ofKind]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ofKind
      .map((g) => {
        const ownerHit = !q || `${g.owner.name} ${g.owner.sub ?? ''}`.toLowerCase().includes(q);
        const slots = g.slots.filter((x) => (filter === 'all' || x.state === filter) && (ownerHit || x.type.name.toLowerCase().includes(q)));
        return { ...g, slots };
      })
      .filter((g) => g.slots.length > 0)
      .sort((a, b) => a.worst - b.worst || a.owner.name.localeCompare(b.owner.name));
  }, [ofKind, filter, query]);

  const companyGroup = groups.find((g) => g.owner.kind === 'Company') ?? null;
  const openGroup = kind === 'Company' ? companyGroup : openId ? groups.find((g) => g.owner.id === openId) ?? null : null;
  const first = types.isLoading || filed.isLoading || owners.isLoading;
  const failed = types.error || filed.error || owners.error;
  const refreshing = filed.isRefetching || owners.isRefetching;
  const refresh = () => { setNow(Date.now()); types.refetch(); filed.refetch(); owners.refetch(); };

  const segment = (
    <View style={s.segment}>
      {(['Driver', 'Vehicle', 'Company'] as Kind[]).map((k) => {
        const on = k === kind;
        const TabIcon = k === 'Driver' ? IdCard : k === 'Vehicle' ? Truck : Building2;
        return (
          <TouchableOpacity key={k} style={[s.segItem, on && s.segOn]} activeOpacity={0.8} onPress={() => { setKind(k); setOpenId(null); }} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <TabIcon size={15} color={on ? INK : MUTED} />
            <Text style={[s.segText, on && s.segTextOn]}>{k === 'Driver' ? 'Drivers' : k === 'Vehicle' ? 'Vehicles' : 'Company'}</Text>
            <Text style={s.segCount}>{first ? '–' : kindCounts[k]}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const chip = (key: Filter, label: string, dot?: string) => ({ key, label, dot, count: first ? '–' : counts[key] });

  return (
    <SafeAreaView style={listPage.page} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F6F6F7" />
      <AppTopBar title="Documents" />

      {failed && !filed.data ? (
        <ErrorState message={getApiErrorMessage(failed)} onRetry={refresh} className="flex-1" />
      ) : openGroup ? (
        <ScrollView
          contentContainerStyle={listPage.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />}
        >
          <View style={{ gap: 12 }}>
            {kind === 'Company' ? segment : null}
            <OpenFolder
              key={openGroup.owner.id}
              group={openGroup}
              onBack={kind === 'Company' ? undefined : () => setOpenId(null)}
              onOwner={kind === 'Company' ? undefined : () => router.push({ pathname: openGroup.owner.kind === 'Driver' ? '/driver-details' : '/vehicle-details', params: { id: openGroup.owner.id } })}
              onSlot={(slot) => setPicked({ owner: openGroup.owner, slot })}
            />
          </View>
        </ScrollView>
      ) : (
        <FlatList
          key="folders"
          data={first ? [] : shown}
          keyExtractor={(g) => g.owner.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 10 }}
          contentContainerStyle={listPage.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />}
          ListHeaderComponent={
            <View style={listPage.header}>
              {segment}
              <FilterChips<Filter>
                value={filter}
                onChange={setFilter}
                items={[
                  chip('all', 'All'),
                  chip('expired', 'Expired', '#D92D20'),
                  chip('missing', 'Missing', '#D92D20'),
                  chip('expiring', 'Expiring', '#F59E0B'),
                  chip('valid', 'Valid', '#1F9D55'),
                ]}
              />
              <ListSearch value={query} onChangeText={setQuery} placeholder={kind === 'Vehicle' ? 'Search plate or document' : 'Search driver or document'} />
              {!first ? <Text style={listPage.count}>{shown.length} {shown.length === 1 ? 'folder' : 'folders'}</Text> : null}
            </View>
          }
          renderItem={({ item: g }) => <Folder group={g} onPress={() => setOpenId(g.owner.id)} />}
          ListEmptyComponent={
            first ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {[0, 1, 2, 3].map((i) => <View key={i} style={{ width: '48.4%' }}><SkeletonBlock height={132} radius={14} /></View>)}
              </View>
            ) : (
              <EmptyState
                Icon={FolderOpen}
                title={query || filter !== 'all' ? 'No documents match' : kind === 'Driver' ? 'No drivers yet' : 'No trucks yet'}
                subtitle={query || filter !== 'all' ? 'Try another search or clear the filter.' : undefined}
                className="mt-8"
              />
            )
          }
        />
      )}

      <SlotSheet
        picked={picked}
        onClose={() => setPicked(null)}
        onChanged={() => queryClient.invalidateQueries({ queryKey: ['documents', 'filed'] })}
      />
    </SafeAreaView>
  );
}

function summary(g: Group) {
  const expired = g.slots.filter((x) => x.state === 'expired').length;
  const missing = g.slots.filter((x) => x.state === 'missing').length;
  const expiring = g.slots.filter((x) => x.state === 'expiring').length;
  const onFile = g.slots.filter((x) => x.doc).length;
  // The folder takes the colour of its worst document.
  const state: State = expired || missing ? 'expired' : expiring ? 'expiring' : 'valid';
  const text = [expired ? `${expired} expired` : null, missing ? `${missing} missing` : null, expiring ? `${expiring} expiring` : null].filter(Boolean).join(' · ') || 'All in order';
  return { state, text, onFile, attention: expired + missing + expiring };
}

/** One driver's or truck's folder in the grid: a tab, then the body in the colour of its worst document. */
function Folder({ group: g, onPress }: { group: Group; onPress: () => void }) {
  const sum = summary(g);
  const tone = TONE[sum.state];
  return (
    <TouchableOpacity style={s.folderWrap} activeOpacity={0.8} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${g.owner.name} folder, ${sum.onFile} documents, ${sum.text}`}>
      <View style={[s.folderTab, { backgroundColor: tone.fold }]} />
      <View style={[s.folder, { backgroundColor: tone.bg, borderColor: tone.edge }]}>
        <View style={s.folderTop}>
          {g.owner.kind === 'Driver' ? <CompanyAvatar name={g.owner.name} url={g.owner.photo} size={34} /> : (
            <View style={[s.folderIcon, { backgroundColor: '#FFFFFF' }]}><Truck size={17} color={tone.fg} /></View>
          )}
          {sum.attention ? <View style={[s.folderBadge, { backgroundColor: tone.fg }]}><Text style={s.folderBadgeText}>{sum.attention}</Text></View> : null}
        </View>
        <Text style={s.folderName} numberOfLines={1}>{g.owner.name}</Text>
        <Text style={s.folderCount}>{sum.onFile} {sum.onFile === 1 ? 'document' : 'documents'}</Text>
        <Text style={[s.folderState, { color: tone.fg }]} numberOfLines={1}>{sum.text}</Text>
      </View>
    </TouchableOpacity>
  );
}

/** An open folder: whose it is, then its documents as sheets. WhatsApp turns the sheets into a pick list. */
function OpenFolder({ group: g, onBack, onOwner, onSlot }: { group: Group; onBack?: () => void; onOwner?: () => void; onSlot: (slot: Slot) => void }) {
  const sum = summary(g);
  const headTone = TONE[sum.state];
  const fileOf = (x: Slot) => x.doc?.file_url || x.doc?.files?.[0]?.file_url || null;
  const sendable = g.slots.filter((x) => x.doc && fileOf(x));
  /** null = looking; a set = choosing which documents to send. */
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [sending, setSending] = useState(false);
  const choosing = chosen !== null;

  const toggle = (id: string) => setChosen((prev) => {
    const next = new Set(prev ?? []);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const send = async () => {
    const picks = sendable.filter((x) => chosen?.has(x.type.id));
    if (!picks.length || sending) return;
    setSending(true);
    try {
      const caption = `${g.owner.name} — ${picks.map((x) => x.type.name).join(', ')}`;
      const res = await shareDocumentFiles(picks.map((x) => ({ id: x.doc!.id, url: fileOf(x)! })), caption);
      if (res.onlyFirst) Alert.alert('Sent the first document', 'This build can send one file at a time. Send the others one by one.');
      if (!res.dismissed) setChosen(null);
    } catch (e: any) {
      Alert.alert('Couldn’t send the documents', e?.message ?? getApiErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={s.openHead}>
        {onBack ? (
          <TouchableOpacity style={s.backBtn} onPress={onBack} accessibilityLabel="All folders" hitSlop={8}>
            <ArrowLeft size={18} color={INK} strokeWidth={2.4} />
          </TouchableOpacity>
        ) : null}
        {g.owner.kind === 'Driver' ? <CompanyAvatar name={g.owner.name} url={g.owner.photo} size={40} /> : (
          <View style={s.ownerTile}>{g.owner.kind === 'Vehicle' ? <Truck size={19} color={INK} /> : <Building2 size={19} color={INK} />}</View>
        )}
        <TouchableOpacity style={{ flex: 1, minWidth: 0 }} activeOpacity={onOwner ? 0.7 : 1} disabled={!onOwner} onPress={onOwner} accessibilityRole="button" accessibilityLabel={`Open ${g.owner.name}`}>
          <Text style={s.ownerName} numberOfLines={1}>{g.owner.name}</Text>
          <Text style={[s.meta, { color: sum.onFile ? headTone.fg : MUTED, fontWeight: '600' }]} numberOfLines={1}>{sum.onFile || sum.attention ? sum.text : 'No documents yet'}</Text>
        </TouchableOpacity>
        {sendable.length ? (
          <TouchableOpacity
            style={[s.waBtn, choosing && { backgroundColor: '#F4F4F5' }]}
            activeOpacity={0.8}
            onPress={() => setChosen(choosing ? null : new Set(sendable.map((x) => x.type.id)))}
            accessibilityRole="button"
            accessibilityLabel={choosing ? 'Cancel sending' : 'Send documents on WhatsApp'}
          >
            {choosing ? <X size={18} color={INK} strokeWidth={2.4} /> : <WhatsAppIcon size={19} color="#FFFFFF" />}
          </TouchableOpacity>
        ) : null}
      </View>

      {choosing ? <Text style={s.pickHint}>Choose the documents to send. Ones with no file can’t be sent.</Text> : null}

      {/* Each document is a small sheet of paper, coloured by its state. */}
      <View style={s.sheets}>
        {g.slots.map((x) => {
          const Icon = docIcon(x.type.name);
          const tone = TONE[x.state];
          const canSend = !!x.doc && !!fileOf(x);
          const on = !!chosen?.has(x.type.id);
          return (
            <TouchableOpacity
              key={x.type.id}
              style={[s.sheet, { backgroundColor: tone.bg, borderColor: tone.edge }, !x.doc && s.sheetEmpty, choosing && !canSend && { opacity: 0.4 }, choosing && on && s.sheetOn]}
              activeOpacity={0.75}
              disabled={choosing && !canSend}
              onPress={() => (choosing ? toggle(x.type.id) : onSlot(x))}
              accessibilityRole={choosing ? 'checkbox' : 'button'}
              accessibilityState={choosing ? { checked: on } : undefined}
              accessibilityLabel={`${x.type.name}, ${slotText(x)}`}
            >
              {/* Folded corner, or the tick while choosing */}
              {choosing && canSend ? (
                <View style={[s.tick, on && s.tickOn]}>{on ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}</View>
              ) : <View style={[s.fold, { backgroundColor: tone.fold }]} />}

              <View style={s.sheetTop}>
                <Icon size={20} color={tone.fg} strokeWidth={2} />
                {x.doc || choosing ? null : <Plus size={15} color={tone.fg} strokeWidth={2.6} />}
              </View>
              <Text style={[s.sheetName, !x.doc && { color: MUTED }]} numberOfLines={2}>{x.type.name}</Text>
              <View style={[s.stamp, { backgroundColor: x.doc ? tone.fg : 'transparent', borderColor: tone.fg }]}>
                <Text style={[s.stampText, { color: x.doc ? '#FFFFFF' : tone.fg }]}>{tone.label}</Text>
              </View>
              <Text style={[s.sheetDate, { color: x.doc ? tone.fg : MUTED }]} numberOfLines={1}>{slotDate(x)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {choosing ? (
        <TouchableOpacity style={[s.sendBtn, (!chosen?.size || sending) && { opacity: 0.5 }]} disabled={!chosen?.size || sending} activeOpacity={0.85} onPress={send}>
          {sending ? <ActivityIndicator color="#FFFFFF" /> : <WhatsAppIcon size={18} color="#FFFFFF" />}
          <Text style={s.saveText}>{sending ? 'Getting the files…' : `Send ${chosen?.size ?? 0} on WhatsApp`}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** One document's actions: view, upload (or replace) and delete. */
function SlotSheet({ picked, onClose, onChanged }: { picked: { owner: Owner; slot: Slot } | null; onClose: () => void; onChanged: () => void }) {
  return (
    <AppModal visible={!!picked} onClose={onClose} type="bottom-sheet" title={picked?.slot.type.name ?? ''}>
      {picked ? <SlotActions key={`${picked.owner.id}:${picked.slot.type.id}`} owner={picked.owner} slot={picked.slot} onClose={onClose} onChanged={onChanged} /> : null}
    </AppModal>
  );
}

function SlotActions({ owner, slot, onClose, onChanged }: { owner: Owner; slot: Slot; onClose: () => void; onChanged: () => void }) {
  const [photo, setPhoto] = useState<{ uri: string; fileName?: string | null; mimeType?: string | null } | null>(null);
  const [expiry, setExpiry] = useState('');
  const [issue, setIssue] = useState('');
  const [dateFor, setDateFor] = useState<'expiry' | 'issue' | null>(null);
  const [picking, setPicking] = useState(false);

  const fileUrl = resolveMediaUrl(slot.doc?.file_url || slot.doc?.files?.[0]?.file_url);
  const needsExpiry = slot.type.requiresExpiryDate;
  const needsIssue = slot.type.requiresIssueDate;
  const ready = !!photo && (!needsExpiry || !!toIso(expiry)) && (!needsIssue || !!toIso(issue));

  const pick = async (from: 'camera' | 'gallery') => {
    if (picking) return;
    setPicking(true);
    try {
      const got = from === 'camera' ? await capturePhoto() : await pickFromGallery();
      if (got) setPhoto(got);
    } catch (e: any) {
      Alert.alert(from === 'camera' ? 'Couldn’t open the camera' : 'Couldn’t open your photos', e?.message ?? 'Check the app’s permissions in phone settings.');
    } finally {
      setPicking(false);
    }
  };

  /** Any file on the phone (PDF, image) — needs the file picker that ships with app builds from 5 Oct 2026. */
  const pickFile = async () => {
    if (picking) return;
    setPicking(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const DocumentPicker = require('expo-document-picker');
      const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true, multiple: false });
      const a = res?.assets?.[0];
      if (!res?.canceled && a) setPhoto({ uri: a.uri, fileName: a.name, mimeType: a.mimeType });
    } catch {
      Alert.alert('Update the app to upload files', 'This version can only upload photos. Take or choose a photo instead.');
    } finally {
      setPicking(false);
    }
  };

  const upload = useMutation({
    mutationFn: async () => {
      const name = photo!.fileName || photo!.uri.split('/').pop() || 'document.jpg';
      const form = new FormData();
      form.append('file', { uri: photo!.uri, name, type: photo!.mimeType || (/\.pdf$/i.test(name) ? 'application/pdf' : 'image/jpeg') } as any);
      form.append('entity_type', owner.kind);
      form.append('entity_id', owner.id);
      if (slot.type.legacy) form.append('doc_type', slot.type.legacy);
      else form.append('document_type_id', slot.type.id);
      const expiryIso = toIso(expiry);
      const issueIso = toIso(issue);
      if (expiryIso) form.append('expiry_date', expiryIso);
      if (issueIso) form.append('issue_date', issueIso);
      await api.post('/documents', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => { onChanged(); onClose(); },
    onError: (e) => Alert.alert('Couldn’t upload the document', getApiErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/documents/${slot.doc!.id}`),
    onSuccess: () => { onChanged(); onClose(); },
    onError: (e) => Alert.alert('Couldn’t delete the document', getApiErrorMessage(e)),
  });

  const confirmDelete = () => {
    Alert.alert(`Delete ${slot.type.name}?`, `It is removed from ${owner.name} and kept in Recently deleted on the web for 30 days.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() },
    ]);
  };

  const busy = upload.isPending || remove.isPending;
  const isPdf = !!photo && (photo.mimeType === 'application/pdf' || /\.pdf$/i.test(photo.fileName || photo.uri));

  return (
    <View style={{ gap: 12, paddingBottom: 8 }}>
      <Text style={s.sheetSub}>{owner.name}{'  ·  '}<Text style={{ color: TONE[slot.state].fg, fontWeight: '600' }}>{slotText(slot)}</Text></Text>

      {slot.doc ? (
        <View style={s.actions}>
          <TouchableOpacity style={[s.action, !fileUrl && { opacity: 0.5 }]} disabled={!fileUrl || busy} activeOpacity={0.8} onPress={() => fileUrl && Linking.openURL(fileUrl).catch(() => Alert.alert('Couldn’t open the file'))}>
            <Eye size={18} color={INK} />
            <Text style={s.actionText}>View file</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.action} disabled={busy} activeOpacity={0.8} onPress={confirmDelete}>
            {remove.isPending ? <ActivityIndicator color="#B42318" /> : <Trash2 size={18} color="#B42318" />}
            <Text style={[s.actionText, { color: '#B42318' }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={s.sheetHead}>{slot.doc ? 'Replace with a new one' : 'Upload'}</Text>
      {photo ? (
        <View style={s.preview}>
          {isPdf ? <View style={[s.thumb, { alignItems: 'center', justifyContent: 'center' }]}><FileText size={20} color={INK} /></View> : <Image source={{ uri: photo.uri }} style={s.thumb} />}
          <Text style={[s.actionText, { flex: 1 }]} numberOfLines={1}>{isPdf ? photo.fileName || 'File ready' : 'Photo ready'}</Text>
          <TouchableOpacity onPress={() => setPhoto(null)} hitSlop={10} disabled={busy}><Text style={{ color: MUTED, fontWeight: '600' }}>Change</Text></TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={[s.action, s.actionWide]} disabled={picking} activeOpacity={0.8} onPress={pickFile}>
          <Upload size={18} color="#FFFFFF" />
          <Text style={[s.actionText, { color: '#FFFFFF' }]}>Upload file</Text>
        </TouchableOpacity>
      )}
      {photo ? null : (
        <View style={s.actions}>
          <TouchableOpacity style={s.action} disabled={picking} activeOpacity={0.8} onPress={() => pick('camera')}>
            <Camera size={18} color={INK} />
            <Text style={s.actionText}>Take photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.action} disabled={picking} activeOpacity={0.8} onPress={() => pick('gallery')}>
            <ImageIcon size={18} color={INK} />
            <Text style={s.actionText}>Choose photo</Text>
          </TouchableOpacity>
        </View>
      )}

      {photo ? (
        <>
          {needsIssue ? <DateField label="Issue date" value={issue} onPress={() => setDateFor('issue')} /> : null}
          <DateField label={needsExpiry ? 'Expiry date' : 'Expiry date (optional)'} value={expiry} onPress={() => setDateFor('expiry')} />
          <TouchableOpacity style={[s.save, (!ready || busy) && { opacity: 0.5 }]} disabled={!ready || busy} activeOpacity={0.85} onPress={() => upload.mutate()}>
            {upload.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.saveText}>{slot.doc ? 'Replace document' : 'Upload document'}</Text>}
          </TouchableOpacity>
        </>
      ) : null}

      <DatePickerModal
        visible={dateFor !== null}
        onClose={() => setDateFor(null)}
        selectedDate={(dateFor === 'issue' ? issue : expiry) || todayText()}
        onSelectDate={(d) => { if (dateFor === 'issue') setIssue(d); else setExpiry(d); setDateFor(null); }}
      />
    </View>
  );
}

function DateField({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.date} activeOpacity={0.7} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}${value ? `, ${value}` : ''}`}>
      <Text style={s.dateLabel}>{label}</Text>
      <Text style={[s.dateValue, !value && { color: '#9898A4', fontWeight: '400' }]}>{value || 'Select date'}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  segment: { flexDirection: 'row', gap: 4, backgroundColor: '#E9E9EC', borderRadius: 13, padding: 3 },
  segItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 38, borderRadius: 10 },
  segOn: { backgroundColor: '#FFFFFF' },
  segText: { fontSize: 13, fontWeight: '600', color: MUTED },
  segTextOn: { color: INK },
  segCount: { fontSize: 12, fontWeight: '700', color: '#9898A4', fontVariant: ['tabular-nums'] },
  folderWrap: { flex: 1, maxWidth: '48.6%' },
  folderTab: { width: '46%', height: 13, borderTopLeftRadius: 9, borderTopRightRadius: 9 },
  folder: { borderWidth: 1, borderRadius: 14, borderTopLeftRadius: 0, padding: 11, gap: 3, minHeight: 122 },
  folderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  folderIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  folderBadge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  folderBadgeText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  folderName: { fontSize: 15, fontWeight: '600', color: INK, letterSpacing: -0.2 },
  folderCount: { fontSize: 12, color: MUTED },
  folderState: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  openHead: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', padding: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  waBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center' },
  pickHint: { fontSize: 13, color: MUTED },
  sheetOn: { borderColor: '#25D366', borderWidth: 2 },
  tick: { position: 'absolute', top: 7, right: 7, width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#B4B4BD', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: '#25D366', borderColor: '#25D366' },
  sendBtn: { height: 50, borderRadius: 15, backgroundColor: '#1FAF57', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ownerTile: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  ownerName: { fontSize: 16, fontWeight: '600', color: INK, letterSpacing: -0.2 },
  meta: { fontSize: 13, color: MUTED, marginTop: 1, fontVariant: ['tabular-nums'] },
  sheets: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sheet: { width: '48.4%', minHeight: 132, borderWidth: 1, borderRadius: 10, padding: 9, gap: 5, overflow: 'hidden' },
  sheetEmpty: { borderStyle: 'dashed' },
  fold: { position: 'absolute', top: 0, right: 0, width: 18, height: 18, borderBottomLeftRadius: 8 },
  sheetTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16 },
  sheetName: { fontSize: 13, fontWeight: '600', color: INK, lineHeight: 16, minHeight: 32 },
  stamp: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  stampText: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  sheetDate: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },

  sheetSub: { fontSize: 14, color: MUTED },
  sheetHead: { fontSize: 13, fontWeight: '600', color: MUTED, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, height: 48, borderRadius: 14, backgroundColor: '#F4F4F5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionWide: { flex: 0, backgroundColor: INK },
  actionText: { fontSize: 15, fontWeight: '600', color: INK },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F4F4F5', borderRadius: 14, padding: 8 },
  thumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#E4E4E7' },
  date: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#E4E4E7', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateLabel: { fontSize: 14, color: MUTED },
  dateValue: { fontSize: 15, fontWeight: '600', color: INK },
  save: { height: 50, borderRadius: 15, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
