/**
 * Route: /profile — the last tab: the signed-in operator's own account.
 *
 * One light header card (who you are, how to reach you, edit), then one list
 * of everything you can do from here, grouped: Account (edit profile, change
 * password, access level), Workspace (notifications, user management, web
 * dashboard), App (settings, help, about) and Log out.
 * Data is GET /auth/me and GET /settings/public; edits go to PATCH /auth/me
 * and POST /auth/change-password.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl, TextInput, Alert, ActivityIndicator, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Bell, ChevronRight, Globe, HelpCircle, Info, Lock, LogOut, Mail, Phone, Settings, ShieldCheck, SquarePen, User, UserCog, type LucideIcon } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { api, API_URL, getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { useAuth } from '@mercon/mobile-shared/lib/auth-context';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { ErrorState } from '@mercon/mobile-shared/ui';
import { AppTopBar } from '@/components/AppTopBar';
import { FactRow, Tile } from '@/components/pageCues';
import { useNotifications } from '@/features/notifications/hooks/useNotifications';
import type { Tone } from '@/features/trips/details/tripDetailsModel';
import { ACTION, Card, Chip, INK, MUTED, PAGE, tap } from '../trips/details/components/parts';
import { initialsOf, niceName } from '../trips/create/components/ui';

interface Me {
  id: string;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  isSuperAdmin?: boolean;
}

interface Company {
  appName?: string | null;
  companyLegalName?: string | null;
  vatNumber?: string | null;
  crNumber?: string | null;
  timezone?: string | null;
  supportWhatsapp?: string | null;
}

const ME_KEY = ['auth', 'me'] as const;

type Link = { icon: LucideIcon; tone: Tone | 'brand'; label: string; sub: string; onPress: () => void; badge?: number; disabled?: boolean; danger?: boolean };

export default function ProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile, role, signOut } = useAuth();
  const [sheet, setSheet] = useState<'edit' | 'password' | 'about' | 'access' | null>(null);

  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => (await api.get('/auth/me')).data.data as Me,
  });

  const company = useQuery({
    queryKey: ['settings', 'public'],
    queryFn: async () => (await api.get('/settings/public')).data.data as Company,
    staleTime: 5 * 60_000,
  });
  const notifications = useNotifications();
  const unread = notifications.data?.filter((n) => !n.is_read).length ?? 0;

  // Until /auth/me answers, show what sign-in already gave us.
  const name = me.data?.name ?? profile?.name ?? 'Operator';
  const username = me.data?.username ?? profile?.username ?? '';
  const userRole = me.data?.role ?? role ?? 'Operator';

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You will need to log in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => { await signOut(); router.replace('/login'); } },
    ]);
  };

  const support = (company.data?.supportWhatsapp ?? '').replace(/[^0-9]/g, '');
  // The web dashboard lives on the same host as the API this app talks to.
  const webUrl = (API_URL || '').replace(/\/api\/?$/, '');
  const isAdmin = userRole === 'Admin';
  const version = Constants.expoConfig?.version;

  const groups: { title: string; rows: Link[] }[] = [
    {
      title: 'Account',
      rows: [
        { icon: User, tone: 'blue', label: 'Edit profile', sub: 'Name, phone and email', onPress: () => setSheet('edit'), disabled: !me.data },
        { icon: Lock, tone: 'amber', label: 'Change password', sub: 'Use at least 8 characters', onPress: () => setSheet('password') },
        { icon: ShieldCheck, tone: 'violet', label: 'Access level', sub: `${userRole}${me.data?.isSuperAdmin ? ' · platform admin' : ''}`, onPress: () => setSheet('access') },
      ],
    },
    {
      title: 'Workspace',
      rows: [
        { icon: Bell, tone: 'brand', label: 'Notifications', sub: unread ? `${unread} unread` : 'You’re all caught up', badge: unread || undefined, onPress: () => router.push('/notifications') },
        { icon: UserCog, tone: 'violet', label: 'User management', sub: 'Team accounts and driver logins', onPress: () => router.push('/user-management') },
        { icon: Globe, tone: 'sky', label: 'Web dashboard', sub: webUrl ? webUrl.replace(/^https?:\/\//, '') : 'Not available', onPress: () => { Linking.openURL(webUrl).catch(() => Alert.alert('Couldn’t open the dashboard')); }, disabled: !webUrl },
      ],
    },
    {
      title: 'App',
      rows: [
        { icon: Settings, tone: 'gray', label: 'App settings', sub: 'Notifications and location permissions', onPress: () => { Linking.openSettings().catch(() => Alert.alert('Couldn’t open settings')); } },
        {
          icon: HelpCircle, tone: 'green', label: 'Help & support',
          sub: support ? 'Message support on WhatsApp' : 'No support number set yet',
          onPress: () => { Linking.openURL(`https://wa.me/${support}`).catch(() => Alert.alert('Couldn’t open WhatsApp')); },
          disabled: !support,
        },
        { icon: Info, tone: 'sky', label: 'About', sub: version ? `Version ${version}` : 'Company details', onPress: () => setSheet('about') },
        { icon: LogOut, tone: 'red', label: 'Log out', sub: 'Sign out of your account', onPress: confirmSignOut, danger: true },
      ],
    },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }} edges={['top']}>
      <AppTopBar title="Profile" />

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={me.isRefetching} onRefresh={() => { me.refetch(); company.refetch(); }} tintColor={Colors.primary} />}
      >
        {/* Who you are and how to reach you */}
        <Card style={s.head}>
          <View style={s.who}>
            <View style={s.avatar}><Text style={s.avatarText}>{initialsOf(name)}</Text></View>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text style={s.name} numberOfLines={1}>{niceName(name)}</Text>
              {/* A username that is just the email would repeat the row below. */}
              {username && username !== me.data?.email ? <Text style={s.sub} numberOfLines={1} selectable>{username}</Text> : null}
              <View style={s.heroMeta}>
                <Chip label={userRole} tone={isAdmin ? 'violet' : 'blue'} />
                {me.data?.isSuperAdmin ? <Chip label="Platform admin" tone="amber" /> : null}
              </View>
            </View>
            {me.data ? (
              <TouchableOpacity style={s.editBtn} onPress={() => { tap(); setSheet('edit'); }} accessibilityRole="button" accessibilityLabel="Edit profile" activeOpacity={0.7} hitSlop={4}>
                <SquarePen size={17} color={INK} strokeWidth={2} />
              </TouchableOpacity>
            ) : null}
          </View>
          {me.isError ? <ErrorState message="Could not load your profile." onRetry={() => me.refetch()} /> : (
            <View style={s.contact}>
              <ContactRow icon={Phone} label="Phone" value={me.data?.phone} loading={me.isLoading} />
              <ContactRow icon={Mail} label="Email" value={me.data?.email} loading={me.isLoading} border />
            </View>
          )}
        </Card>

        {/* Everything you can do from here, in one list */}
        <Card style={s.menu}>
          {groups.map((g, gi) => (
            <View key={g.title} style={gi > 0 ? s.group : null}>
              <Text style={s.groupTitle}>{g.title}</Text>
              {g.rows.map((r) => (
                <TouchableOpacity key={r.label} style={[s.item, r.disabled && { opacity: 0.5 }]} disabled={r.disabled} activeOpacity={0.7} onPress={() => { tap(); r.onPress(); }}>
                  <Tile icon={r.icon} tone={r.tone} size={36} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.itemTitle, r.danger && { color: '#B42318' }]}>{r.label}</Text>
                    <Text style={s.itemSub} numberOfLines={1}>{r.sub}</Text>
                  </View>
                  {r.badge ? <View style={s.badge}><Text style={s.badgeText}>{r.badge}</Text></View> : null}
                  {r.danger ? null : <ChevronRight size={18} color="#A1A1AA" />}
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </Card>

        <Text style={s.footer}>{[Constants.expoConfig?.name, version ? `Version ${version}` : null].filter(Boolean).join('  ·  ')}</Text>
      </ScrollView>

      <EditSheet
        visible={sheet === 'edit'}
        me={me.data}
        onClose={() => setSheet(null)}
        onSaved={(next) => queryClient.setQueryData(ME_KEY, (old: Me | undefined) => ({ ...(old as Me), ...next }))}
      />
      <PasswordSheet visible={sheet === 'password'} onClose={() => setSheet(null)} />
      <AppModal visible={sheet === 'access'} onClose={() => setSheet(null)} type="bottom-sheet" title="Access level">
        <View style={{ gap: 12, paddingBottom: 8 }}>
          <View style={s.heroMeta}>
            <Chip label={userRole} tone={isAdmin ? 'violet' : 'blue'} />
            {me.data?.isSuperAdmin ? <Chip label="Platform admin" tone="amber" /> : null}
          </View>
          <Text style={s.body}>
            {isAdmin
              ? 'Admins can use every page of this app and the web dashboard, including company settings on the web.'
              : 'Operators can use every page of this app and the web dashboard. Company settings on the web are for admins.'}
          </Text>
          <Text style={s.sub}>Signed in as {username || name}. Roles are changed in User management.</Text>
        </View>
      </AppModal>
      <AppModal visible={sheet === 'about'} onClose={() => setSheet(null)} type="bottom-sheet" title="About">
        <View style={{ paddingBottom: 8 }}>
          <FactRow first label="Company" value={company.data?.companyLegalName || '—'} />
          {company.data?.vatNumber ? <FactRow label="VAT number" value={company.data.vatNumber} /> : null}
          {company.data?.crNumber ? <FactRow label="CR number" value={company.data.crNumber} /> : null}
          {company.data?.timezone ? <FactRow label="Time zone" value={company.data.timezone} /> : null}
          <FactRow label="App version" value={version ?? '—'} />
        </View>
      </AppModal>
    </SafeAreaView>
  );
}

/** One contact line in the header card: icon tile, label, and the value on the right. */
function ContactRow({ icon, label, value, loading, border }: { icon: LucideIcon; label: string; value?: string | null; loading?: boolean; border?: boolean }) {
  return (
    <View style={[s.contactRow, border && s.contactBorder]}>
      <Tile icon={icon} tone={icon === Mail ? 'sky' : undefined} size={32} />
      <Text style={s.contactLabel}>{label}</Text>
      <Text style={[s.contactValue, !value && { color: MUTED, fontWeight: '400' }]} numberOfLines={1} selectable={!!value}>
        {value || (loading ? '…' : 'Not added')}
      </Text>
    </View>
  );
}

function Field({ label, ...input }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput style={s.input} placeholderTextColor="#A1A1AA" autoCorrect={false} {...input} />
    </View>
  );
}

function SaveButton({ label, busy, disabled, onPress }: { label: string; busy: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.save, (disabled || busy) && { opacity: 0.5 }]} disabled={disabled || busy} onPress={onPress} activeOpacity={0.85}>
      {busy ? <ActivityIndicator color={Colors.white} /> : <Text style={s.saveText}>{label}</Text>}
    </TouchableOpacity>
  );
}

/** The form mounts fresh each time the sheet opens, so it always starts from what's saved. */
function EditSheet({ visible, me, onClose, onSaved }: { visible: boolean; me?: Me; onClose: () => void; onSaved: (next: Partial<Me>) => void }) {
  return (
    <AppModal visible={visible} onClose={onClose} type="bottom-sheet" title="Edit profile">
      {visible && me ? <EditForm me={me} onClose={onClose} onSaved={onSaved} /> : null}
    </AppModal>
  );
}

function EditForm({ me, onClose, onSaved }: { me: Me; onClose: () => void; onSaved: (next: Partial<Me>) => void }) {
  const [name, setName] = useState(me.name ?? '');
  const [phone, setPhone] = useState(me.phone ?? '');
  const [email, setEmail] = useState(me.email ?? '');

  const save = useMutation({
    mutationFn: async () => (await api.patch('/auth/me', { name: name.trim(), phone: phone.trim(), email: email.trim() })).data.data as Partial<Me>,
    onSuccess: (next) => { onSaved(next); onClose(); },
    onError: (e) => Alert.alert('Could not save', getApiErrorMessage(e)),
  });

  return (
    <View style={s.form}>
      <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
      <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+966…" />
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="name@company.com" />
      <SaveButton label="Save" busy={save.isPending} disabled={!name.trim()} onPress={() => save.mutate()} />
    </View>
  );
}

function PasswordSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <AppModal visible={visible} onClose={onClose} type="bottom-sheet" title="Change password">
      {visible ? <PasswordForm onClose={onClose} /> : null}
    </AppModal>
  );
}

function PasswordForm({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');

  const save = useMutation({
    mutationFn: () => api.post('/auth/change-password', { current_password: current, new_password: next }),
    onSuccess: () => { onClose(); Alert.alert('Password changed', 'Use the new password next time you sign in.'); },
    onError: (e) => Alert.alert('Could not change password', getApiErrorMessage(e)),
  });

  const mismatch = again.length > 0 && next !== again;
  const ready = current.length > 0 && next.length >= 8 && next === again;

  return (
    <View style={s.form}>
      <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" />
      <Field label="New password" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" placeholder="At least 8 characters" />
      <Field label="New password again" value={again} onChangeText={setAgain} secureTextEntry autoCapitalize="none" />
      {mismatch ? <Text style={s.error}>The two new passwords don’t match.</Text> : null}
      <SaveButton label="Change password" busy={save.isPending} disabled={!ready} onPress={() => save.mutate()} />
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 130, gap: 12 },
  head: { paddingVertical: 14 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 21, fontWeight: '700', color: Colors.primary, letterSpacing: 0.5 },
  name: { fontSize: 18, fontWeight: '700', color: INK, letterSpacing: -0.2 },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E9E9EC', alignSelf: 'flex-start' },
  contact: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#F1F1F3', paddingTop: 4, marginBottom: -6 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  contactBorder: { borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  contactLabel: { fontSize: 14, color: MUTED },
  contactValue: { flex: 1, textAlign: 'right', fontSize: 14, fontWeight: '600', color: INK },

  menu: { paddingVertical: 12 },
  group: { marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  groupTitle: { fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: INK },
  itemSub: { fontSize: 12, color: MUTED, marginTop: 1 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 12, fontWeight: '700', color: Colors.white },
  footer: { fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 2 },

  sub: { fontSize: 13, color: MUTED },
  body: { fontSize: 15, lineHeight: 21, color: INK },
  form: { gap: 14, paddingBottom: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: MUTED },
  input: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#E4E4E7', paddingHorizontal: 14, fontSize: 15, color: INK, backgroundColor: Colors.white },
  error: { fontSize: 13, color: '#B42318' },
  save: { height: 50, borderRadius: 15, backgroundColor: ACTION, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  saveText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
