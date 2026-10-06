/**
 * Route: /link-details?kind=trip|customer&id=… — one customer link.
 * Also /link-details?kind=trip&trip=<trip id> and ?kind=customer&customer=<id>:
 * that trip's / customer's current link (from the trip and customer pages).
 *
 * Top to bottom: what the link is (trip or all-trucks page, customer, note)
 * with Send / Copy / Open; how often it was opened; when it stops working
 * (quick choices, a date, or the default); what the customer sees on it; the
 * open history (when, device, rough place); older links of the same trip or
 * customer; and Make a new link / Turn off now.
 */
import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Linking, Alert, Switch, TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays, Check, Copy, ExternalLink, EyeOff, Link2, MapPin, Monitor, PencilLine, RefreshCw, Route, Share2, Smartphone, Users, XCircle,
} from 'lucide-react-native';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { Toast } from '@mercon/mobile-shared/components/Toast';
import { DatePickerModal } from '@mercon/mobile-shared/components/common/DateTimePickerModal';
import { AppTopBar } from '@/components/AppTopBar';
import { setStringAsync } from '@/lib/clipboard';
import { shareTextToWhatsApp } from '@/features/dashboard/components/ActiveTripsSection';
import { BG, EmptyState, INK, LINE, MUTED, SectionLabel, SkeletonCard, p, tap } from '@/features/notifications/components/parts';
import { Chip } from '@/features/trips/details/components/parts';
import { TONE } from '@/features/trips/details/tripDetailsModel';
import { linksApi, type LinkChanges, type LinkDetail, type LinkKind, type LinkRow } from '../linksApi';
import {
  EXPIRY_PRESETS, STATUS_CHIP, VIEW_ROWS, ago, defaultExpiryText, expiryFromDays, hiddenCount, isPhone, lifeLine, linkSubtitle, linkTitle,
  placeOf, when, type ViewKey,
} from '../linkModel';

const OPENS_FIRST = 25;

/** The link to show: by id, or the current one of a trip / customer. */
function useLinkTarget() {
  const params = useLocalSearchParams<{ kind?: string; id?: string; trip?: string; customer?: string }>();
  const kind: LinkKind = params.kind === 'customer' ? 'customer' : 'trip';
  const lookup = useQuery({
    queryKey: ['tracking-link-for', kind, params.trip ?? null, params.customer ?? null],
    enabled: !params.id && !!(params.trip || params.customer),
    queryFn: async () => {
      const list = await linksApi.list({
        status: 'all', kind,
        ...(params.trip ? { trip_id: String(params.trip) } : { customer_id: String(params.customer) }),
      });
      return list.links.find((l) => l.status === 'live') ?? list.links[0] ?? null;
    },
  });
  const id = params.id ? String(params.id) : lookup.data?.id ?? null;
  return { kind, id, resolving: !params.id && lookup.isLoading, notFound: !params.id && lookup.isSuccess && !lookup.data };
}

export default function LinkDetailScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { kind, id, resolving, notFound } = useLinkTarget();
  const [toast, setToast] = useState<string | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [allOpens, setAllOpens] = useState(false);

  const q = useQuery({
    queryKey: ['tracking-link', kind, id],
    queryFn: () => linksApi.get(kind, id!),
    enabled: !!id,
    refetchInterval: 60_000,
  });
  const d = q.data;
  // "5 min ago" is measured from the last load (it refreshes every minute).
  const now = q.dataUpdatedAt;

  const done = (data: LinkDetail) => {
    qc.setQueryData(['tracking-link', data.kind, data.id], data);
    qc.invalidateQueries({ queryKey: ['tracking-links'] });
  };
  const update = useMutation({
    mutationFn: (changes: LinkChanges) => linksApi.update(kind, id!, changes),
    onSuccess: (data) => { done(data); setToast('Saved'); },
    onError: (e) => Alert.alert('Couldn’t save', getApiErrorMessage(e)),
  });
  const revoke = useMutation({
    mutationFn: () => linksApi.revoke(kind, id!),
    onSuccess: (data) => { done(data); setToast('Link turned off'); },
    onError: (e) => Alert.alert('Couldn’t turn the link off', getApiErrorMessage(e)),
  });
  const replace = useMutation({
    mutationFn: () => linksApi.replace(kind, id!),
    onSuccess: (data) => {
      done(data);
      qc.invalidateQueries({ queryKey: ['tracking-link', kind, id] });
      router.replace({ pathname: '/link-details', params: { kind: data.kind, id: data.id } });
    },
    onError: (e) => Alert.alert('Couldn’t make a new link', getApiErrorMessage(e)),
  });

  const back = () => (router.canGoBack() ? router.back() : router.replace('/links'));

  if (resolving || (id && q.isLoading)) {
    return (
      <SafeAreaView style={s.screen} edges={['top']}>
        <AppTopBar title="Customer link" onBack={back} />
        <View style={[s.pad, { paddingTop: 12, gap: 12 }]}><SkeletonCard rows={2} /><SkeletonCard rows={3} /></View>
      </SafeAreaView>
    );
  }
  if (notFound || !id || !d) {
    return (
      <SafeAreaView style={s.screen} edges={['top']}>
        <AppTopBar title="Customer link" onBack={back} />
        <EmptyState
          icon={Link2}
          title={q.isError ? 'Couldn’t load the link' : 'No link yet'}
          text={q.isError ? getApiErrorMessage(q.error) : 'A link is made the first time it is shared with the customer.'}
        />
      </SafeAreaView>
    );
  }

  const editable = d.status !== 'revoked';
  const busy = update.isPending || revoke.isPending || replace.isPending;

  const copy = async () => {
    tap();
    setToast((await setStringAsync(d.url)) ? 'Link copied' : 'Couldn’t copy the link');
  };
  const send = () => {
    tap();
    const text = d.kind === 'customer'
      ? `*${d.customer?.name ?? 'Your trucks'} · live trucks*\nAll your trucks on the road, live: ${d.url}`
      : `*${[d.trip?.ref_id, d.customer?.name].filter(Boolean).join(' · ') || 'Your trip'}*${d.trip?.route_label ? `\n${d.trip.route_label}` : ''}\nTrack live: ${d.url}`;
    shareTextToWhatsApp(text, 'Tracking link').catch(() => {});
  };
  const confirmReplace = () => Alert.alert(
    'Make a new link?',
    'The current link stops working for everyone who has it. The new one keeps the same note, expiry and settings.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Make new link', style: 'destructive', onPress: () => replace.mutate() }],
  );
  const confirmRevoke = () => Alert.alert(
    'Turn this link off now?',
    d.kind === 'trip'
      ? 'Anyone with it sees “this link has expired”. Sharing the trip again makes a new link.'
      : 'Anyone with it sees “this link has expired”. You can make a new link for the customer any time.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Turn off', style: 'destructive', onPress: () => revoke.mutate() }],
  );

  const chip = STATUS_CHIP[d.status];
  const tone = d.kind === 'trip' ? TONE.violet : TONE.sky;
  const KindIcon = d.kind === 'trip' ? Route : Users;
  const opens = allOpens ? d.opens : d.opens.slice(0, OPENS_FIRST);
  const hidden = hiddenCount(d);

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <AppTopBar title="Customer link" onBack={back} />
      <ScrollView
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 120, gap: 22 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={Colors.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── What it is ─────────────────────────────────────────────── */}
        <View style={s.pad}>
          <View style={[p.card, { padding: 16, gap: 14 }]}>
            <View style={s.headRow}>
              <View style={[s.kindIcon, { backgroundColor: tone.bg }]}><KindIcon size={20} color={tone.fg} strokeWidth={2.2} /></View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={s.kindLabel}>{d.kind === 'trip' ? 'Trip link' : 'All-trucks page'}</Text>
                <Text style={s.headTitle} numberOfLines={2}>{linkTitle(d)}</Text>
                <Text style={s.sub} numberOfLines={1}>{linkSubtitle(d)}</Text>
              </View>
              <Chip label={d.expiring_soon ? 'Expiring soon' : chip.label} tone={d.expiring_soon ? 'amber' : chip.tone} dot />
            </View>

            <TouchableOpacity style={s.urlBox} onPress={copy} activeOpacity={0.7} accessibilityLabel="Copy link">
              <Link2 size={15} color={MUTED} />
              <Text style={[s.url, !editable && s.urlDead]} numberOfLines={1}>{d.url.replace(/^https?:\/\//, '')}</Text>
              <Copy size={15} color={MUTED} />
            </TouchableOpacity>

            {editable ? (
              <View style={s.actions}>
                <TouchableOpacity style={[s.action, s.actionPrimary]} onPress={send} activeOpacity={0.85} disabled={d.status !== 'live'}>
                  <Share2 size={16} color={Colors.white} strokeWidth={2.3} />
                  <Text style={s.actionPrimaryText}>Send on WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.actionSoft} onPress={copy} activeOpacity={0.7} accessibilityLabel="Copy link">
                  <Copy size={17} color={INK} strokeWidth={2.2} />
                </TouchableOpacity>
                <TouchableOpacity style={s.actionSoft} onPress={() => Linking.openURL(d.url).catch(() => {})} activeOpacity={0.7} accessibilityLabel="Open what the customer sees">
                  <ExternalLink size={17} color={INK} strokeWidth={2.2} />
                </TouchableOpacity>
              </View>
            ) : null}

            <LabelEditor value={d.label} editable={editable} saving={update.isPending} onSave={(label) => update.mutate({ label })} />

            <Text style={s.meta}>
              {`Made ${when(d.created_at, now)}${d.created_by ? ` by ${d.created_by.name}` : ''}`}
            </Text>
          </View>
        </View>

        {/* ── Numbers ────────────────────────────────────────────────── */}
        <View style={s.pad}>
          <View style={[p.card, s.stats]}>
            <Stat value={String(d.open_count)} label="Opens" />
            <View style={s.vline} />
            <Stat value={String(d.summary.devices)} label="Devices" />
            <View style={s.vline} />
            <Stat value={d.last_opened_at ? ago(d.last_opened_at, now) : '—'} label="Last opened" small />
          </View>
        </View>

        {/* ── Expiry ─────────────────────────────────────────────────── */}
        <View style={s.pad}>
          <SectionLabel title="Link works until" />
          <View style={[p.card, { padding: 14, gap: 12 }]}>
            <View style={s.lifeRow}>
              <CalendarDays size={18} color={d.status === 'live' ? INK : MUTED} />
              <Text style={s.lifeText}>{lifeLine(d, now)}</Text>
            </View>
            {editable ? (
              <>
                <View style={s.presetWrap}>
                  <Preset
                    label={d.kind === 'trip' ? 'Follow the trip' : 'Never'}
                    on={!d.expiry_custom}
                    onPress={() => update.mutate({ expires_at: null })}
                    disabled={busy}
                  />
                  {EXPIRY_PRESETS.map((pr) => (
                    <Preset key={pr.label} label={pr.label} on={false} onPress={() => update.mutate({ expires_at: expiryFromDays(pr.days!) })} disabled={busy} />
                  ))}
                  <Preset label="Pick a date…" on={false} onPress={() => setDateOpen(true)} disabled={busy} icon />
                </View>
                <Text style={s.hint}>
                  {d.expiry_custom
                    ? 'You set this expiry — the link keeps working until then, even after delivery.'
                    : `Default: ${defaultExpiryText(d)}.`}
                  {' Quick choices count from now.'}
                </Text>
              </>
            ) : null}
          </View>
        </View>

        {/* ── What the customer sees ─────────────────────────────────── */}
        <View style={s.pad}>
          <SectionLabel
            title="What the customer sees"
            right={hidden ? <View style={s.hiddenPill}><EyeOff size={12} color={TONE.amber.fg} /><Text style={s.hiddenText}>{hidden} hidden</Text></View> : null}
          />
          <View style={p.card}>
            {VIEW_ROWS.map((row, i) => (
              <ViewRow
                key={row.key}
                row={row}
                detail={d}
                first={i === 0}
                disabled={!editable || busy}
                onChange={(value) => update.mutate({ view: { [row.key]: value } as LinkChanges['view'] })}
              />
            ))}
          </View>
          {d.kind === 'customer' ? (
            <Text style={[s.hint, { marginTop: 8, paddingHorizontal: 4 }]}>
              Trucks opened from this page show only what both this page and the trip’s own link allow.
            </Text>
          ) : null}
        </View>

        {/* ── Open history ───────────────────────────────────────────── */}
        <View style={s.pad}>
          <SectionLabel title="Open history" count={d.summary.logged || undefined} />
          {d.summary.places.length ? (
            <View style={s.places}>
              {d.summary.places.map((pl) => (
                <View key={pl.label} style={s.place}>
                  <MapPin size={12} color={MUTED} />
                  <Text style={s.placeText}>{pl.label}</Text>
                  <Text style={s.placeCount}>{pl.count}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {opens.length ? (
            <View style={p.card}>
              {opens.map((o, i) => {
                const DevIcon = isPhone(o.device) ? Smartphone : Monitor;
                const place = placeOf(o);
                return (
                  <View key={o.id} style={[s.openRow, i > 0 && p.rowBorder]}>
                    <View style={s.openIcon}><DevIcon size={16} color={INK} /></View>
                    <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                      <Text style={s.openTitle} numberOfLines={1}>{o.device ?? 'Unknown device'}</Text>
                      <Text style={s.sub} numberOfLines={1}>{place ?? 'Place unknown'}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 1 }}>
                      <Text style={s.openTime}>{ago(o.opened_at, now)}</Text>
                      <Text style={s.openWhen}>{when(o.opened_at, now)}</Text>
                    </View>
                  </View>
                );
              })}
              {!allOpens && d.opens.length > OPENS_FIRST ? (
                <TouchableOpacity style={[s.showAll, p.rowBorder]} onPress={() => setAllOpens(true)}>
                  <Text style={s.showAllText}>{`Show all ${d.opens.length}`}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <View style={[p.card, { padding: 16 }]}>
              <Text style={s.sub}>Not opened yet. Each time the customer opens the link it shows up here.</Text>
            </View>
          )}
          <Text style={[s.hint, { marginTop: 8, paddingHorizontal: 4 }]}>
            {d.summary.earlier_opens ? `${d.summary.earlier_opens} earlier opens were counted before the history was kept. ` : ''}
            Place is approximate, from the visitor’s internet address (not stored) — IP Geolocation by DB-IP.
          </Text>
        </View>

        {/* ── Older links ────────────────────────────────────────────── */}
        {d.history.length ? (
          <View style={s.pad}>
            <SectionLabel title={d.kind === 'trip' ? 'Other links of this trip' : 'Other links of this customer'} count={d.history.length} />
            <View style={p.card}>
              {d.history.map((h, i) => (
                <HistoryRow
                  key={h.id}
                  link={h}
                  first={i === 0}
                  now={now}
                  onPress={() => { tap(); router.push({ pathname: '/link-details', params: { kind: h.kind, id: h.id } }); }}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* ── Replace / turn off ─────────────────────────────────────── */}
        <View style={[s.pad, { gap: 10 }]}>
          <TouchableOpacity style={s.bigBtn} onPress={confirmReplace} disabled={busy} activeOpacity={0.8}>
            {replace.isPending ? <ActivityIndicator color={INK} /> : <RefreshCw size={17} color={INK} />}
            <Text style={s.bigBtnText}>Make a new link</Text>
          </TouchableOpacity>
          {editable ? (
            <TouchableOpacity style={[s.bigBtn, s.dangerBtn]} onPress={confirmRevoke} disabled={busy} activeOpacity={0.8}>
              {revoke.isPending ? <ActivityIndicator color="#D92D20" /> : <XCircle size={17} color="#D92D20" />}
              <Text style={[s.bigBtnText, { color: '#D92D20' }]}>Turn off now</Text>
            </TouchableOpacity>
          ) : (
            <Text style={[s.hint, { textAlign: 'center' }]}>This link is off for good. Make a new link to share again.</Text>
          )}
        </View>
      </ScrollView>

      <DatePickerModal
        visible={dateOpen}
        onClose={() => setDateOpen(false)}
        selectedDate={toDDMMYYYY(d.expires_at ?? new Date(now + 7 * 86_400_000).toISOString())}
        onSelectDate={(day) => {
          setDateOpen(false);
          const end = endOfDay(day);
          if (end) update.mutate({ expires_at: end });
        }}
      />
      <Toast visible={!!toast} message={toast ?? ''} onDismiss={() => setToast(null)} />
    </SafeAreaView>
  );
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDDMMYYYY = (iso: string) => { const x = new Date(iso); return `${pad2(x.getDate())}/${pad2(x.getMonth() + 1)}/${x.getFullYear()}`; };
/** The picked day, till the end of it (local time). */
function endOfDay(ddmmyyyy: string): string | null {
  const [dd, mm, yyyy] = ddmmyyyy.split('/').map(Number);
  if (!dd || !mm || !yyyy) return null;
  return new Date(yyyy, mm - 1, dd, 23, 59, 0).toISOString();
}

function Stat({ value, label, small }: { value: string; label: string; small?: boolean }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statValue, small && { fontSize: 15 }]} numberOfLines={1}>{value}</Text>
      <Text style={s.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function Preset({ label, on, onPress, disabled, icon }: { label: string; on: boolean; onPress: () => void; disabled?: boolean; icon?: boolean }) {
  return (
    <TouchableOpacity
      style={[s.preset, on && s.presetOn, disabled && { opacity: 0.5 }]}
      onPress={() => { tap(); onPress(); }}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      {on ? <Check size={13} color={Colors.white} strokeWidth={3} /> : icon ? <CalendarDays size={13} color={INK} /> : null}
      <Text style={[s.presetText, on && { color: Colors.white }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function LabelEditor({ value, editable, saving, onSave }: { value: string | null; editable: boolean; saving: boolean; onSave: (v: string | null) => void }) {
  const [text, setText] = useState(value ?? '');
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <TouchableOpacity style={s.labelRow} onPress={() => { setText(value ?? ''); setEditing(true); }} disabled={!editable} activeOpacity={0.7}>
        <PencilLine size={15} color={MUTED} />
        <Text style={[s.labelText, !value && { color: MUTED }]} numberOfLines={2}>
          {value || (editable ? 'Add a note — who it was sent to, why…' : 'No note')}
        </Text>
      </TouchableOpacity>
    );
  }
  const save = () => {
    setEditing(false);
    const next = text.trim() || null;
    if (next !== (value ?? null)) onSave(next);
  };
  return (
    <View style={s.labelEdit}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="e.g. Sent to the Jeddah warehouse"
        placeholderTextColor="#A1A1AA"
        style={s.labelInput}
        autoFocus
        maxLength={120}
        returnKeyType="done"
        onSubmitEditing={save}
        onBlur={save}
      />
      <TouchableOpacity style={s.labelSave} onPress={save} disabled={saving}>
        <Text style={s.labelSaveText}>Save</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * One "what the customer sees" switch. Planned arrival, delay reason and photos
 * follow the customer's setting unless this link says otherwise — so they get
 * three choices; the others are on or off.
 */
function ViewRow({ row, detail, first, disabled, onChange }: {
  row: (typeof VIEW_ROWS)[number];
  detail: LinkDetail;
  first: boolean;
  disabled: boolean;
  onChange: (v: boolean | null) => void;
}) {
  const own = detail.view[row.key as ViewKey];
  const effective = detail.effective[row.key as ViewKey];
  const base = row.followsCustomer && detail.customer_defaults
    ? detail.customer_defaults[row.key as 'show_deadline' | 'show_delay_reason' | 'show_photos']
    : null;
  // On / off rows toggle from anywhere on the row — a bigger target than the switch.
  const Row = row.followsCustomer ? View : TouchableOpacity;
  const rowProps = row.followsCustomer ? {} : {
    onPress: () => { tap(); onChange(!own); },
    disabled,
    activeOpacity: 0.7,
    accessibilityRole: 'switch' as const,
    accessibilityState: { checked: !!own, disabled },
  };
  return (
    <Row style={[s.viewRow, !first && p.rowBorder, disabled && { opacity: 0.6 }]} {...rowProps}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={[s.viewTitle, !effective && { color: MUTED }]}>{row.title}</Text>
        <Text style={s.viewText}>{row.text}</Text>
        {row.followsCustomer ? (
          <View style={s.segment}>
            {([null, true, false] as const).map((v) => {
              const on = own === v;
              const label = v === null ? `Customer setting (${base ? 'shown' : 'hidden'})` : v ? 'Show' : 'Hide';
              return (
                <TouchableOpacity
                  key={String(v)}
                  style={[s.segBtn, on && s.segOn]}
                  onPress={() => { if (!on) { tap(); onChange(v); } }}
                  disabled={disabled}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[s.segText, on && s.segTextOn]} numberOfLines={1}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </View>
      {!row.followsCustomer ? (
        <Switch
          value={!!own}
          onValueChange={(v) => { tap(); onChange(v); }}
          disabled={disabled}
          trackColor={{ true: Colors.primary, false: '#D4D4D8' }}
          ios_backgroundColor="#D4D4D8"
          accessibilityLabel={row.title}
        />
      ) : null}
    </Row>
  );
}

function HistoryRow({ link, first, now, onPress }: { link: LinkRow; first: boolean; now: number; onPress: () => void }) {
  const chip = STATUS_CHIP[link.status];
  return (
    <TouchableOpacity style={[s.histRow, !first && p.rowBorder]} onPress={onPress} activeOpacity={0.7}>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text style={s.openTitle} numberOfLines={1}>{`Made ${when(link.created_at, now)}`}{link.label ? ` · “${link.label}”` : ''}</Text>
        <Text style={s.sub} numberOfLines={1}>{`${link.open_count ? `Opened ${link.open_count}×` : 'Never opened'} · ${lifeLine(link, now)}`}</Text>
      </View>
      <Chip label={chip.label} tone={chip.tone} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  pad: { paddingHorizontal: 16 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  kindIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  kindLabel: { fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.4, textTransform: 'uppercase' },
  headTitle: { fontSize: 17, fontWeight: '700', color: INK },
  sub: { fontSize: 13, color: MUTED },
  urlBox: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, borderRadius: 12, backgroundColor: BG, borderWidth: 1, borderColor: LINE, paddingHorizontal: 12 },
  url: { flex: 1, fontSize: 14, color: INK, fontFamily: 'Menlo' },
  urlDead: { color: MUTED, textDecorationLine: 'line-through' },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 14 },
  actionPrimary: { flex: 1, backgroundColor: '#1A9E55' },
  actionPrimaryText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  actionSoft: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  labelText: { flex: 1, fontSize: 14, color: INK },
  labelEdit: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  labelInput: { flex: 1, height: 42, borderRadius: 12, borderWidth: 1, borderColor: Colors.primary, paddingHorizontal: 12, fontSize: 14, color: INK, backgroundColor: Colors.white },
  labelSave: { height: 42, paddingHorizontal: 14, borderRadius: 12, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  labelSaveText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
  meta: { fontSize: 12, color: MUTED },
  stats: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  vline: { width: 1, alignSelf: 'stretch', backgroundColor: LINE },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  statValue: { fontSize: 20, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 12, fontWeight: '600', color: MUTED },
  lifeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lifeText: { flex: 1, fontSize: 15, fontWeight: '600', color: INK },
  presetWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: LINE, backgroundColor: Colors.white },
  presetOn: { backgroundColor: INK, borderColor: INK },
  presetText: { fontSize: 13, fontWeight: '600', color: INK },
  hint: { fontSize: 12, color: MUTED, lineHeight: 17 },
  hiddenPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: TONE.amber.bg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  hiddenText: { fontSize: 12, fontWeight: '600', color: TONE.amber.fg },
  viewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  viewTitle: { fontSize: 15, fontWeight: '600', color: INK },
  viewText: { fontSize: 13, color: MUTED, lineHeight: 18 },
  segment: { flexDirection: 'row', marginTop: 8, borderRadius: 10, backgroundColor: '#F4F4F5', padding: 3, gap: 3 },
  segBtn: { flexGrow: 1, flexShrink: 1, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  segOn: { backgroundColor: Colors.white, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontSize: 12, fontWeight: '600', color: MUTED },
  segTextOn: { color: INK },
  places: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  place: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: Colors.white, borderWidth: 1, borderColor: LINE },
  placeText: { fontSize: 12, fontWeight: '600', color: INK },
  placeCount: { fontSize: 12, color: MUTED, fontVariant: ['tabular-nums'] },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  openIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  openTitle: { fontSize: 14, fontWeight: '600', color: INK },
  openTime: { fontSize: 13, fontWeight: '600', color: INK, fontVariant: ['tabular-nums'] },
  openWhen: { fontSize: 11, color: MUTED, fontVariant: ['tabular-nums'] },
  showAll: { height: 44, alignItems: 'center', justifyContent: 'center' },
  showAllText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  bigBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 14, backgroundColor: Colors.white, borderWidth: 1, borderColor: LINE },
  dangerBtn: { borderColor: '#F5C2BD', backgroundColor: '#FFF7F6' },
  bigBtnText: { fontSize: 15, fontWeight: '700', color: INK },
});
