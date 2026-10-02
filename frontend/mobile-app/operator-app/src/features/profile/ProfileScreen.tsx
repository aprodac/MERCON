/**
 * Route: /profile — the last tab: the signed-in operator's own account and
 * the way into every page that isn't a tab of its own.
 *
 * Who you are (name, role), your contact details (editable), the Manage list
 * (fleet, quotations, customers, users), then password and sign out. Data is
 * GET /auth/me; edits go to PATCH /auth/me and POST /auth/change-password.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Building2, CalendarClock, ChevronRight, KeyRound, LogOut, SquarePen, Tag, Truck, UserCog, Users, type LucideIcon } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { api, getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { useAuth } from '@mercon/mobile-shared/lib/auth-context';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { ErrorState } from '@mercon/mobile-shared/ui';
import { AppTopBar } from '@/components/AppTopBar';
import { ACTION, Chip, INK, MUTED, PAGE, tap } from '../trips/details/components/parts';
import { initialsOf, niceName } from '../trips/create/components/ui';

interface Me {
  id: string;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
}

const ME_KEY = ['auth', 'me'] as const;

export default function ProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile, role, signOut } = useAuth();
  const [sheet, setSheet] = useState<'edit' | 'password' | null>(null);

  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => (await api.get('/auth/me')).data.data as Me,
  });

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

  const go = (route: string) => () => router.push(route as never);
  const manage: Link[] = [
    { icon: Truck, label: 'Vehicles', sub: 'Fleet trucks and trailers', onPress: go('/vehicles') },
    { icon: CalendarClock, label: 'Vehicle renewals', sub: 'Expiring vehicle documents', onPress: go('/vehicle-renewals') },
    { icon: Building2, label: '3rd party fleet', sub: 'Subcontractors and 3PL carriers', onPress: go('/third-party') },
    { icon: Tag, label: 'Quotations', sub: 'Rates and lanes', onPress: go('/quotations') },
    { icon: Users, label: 'Customers', sub: 'View, add and edit customers', onPress: go('/customers') },
    { icon: UserCog, label: 'User management', sub: 'Operators, admins and driver logins', onPress: go('/user-management') },
  ];
  const account: Link[] = [
    { icon: KeyRound, label: 'Change password', sub: 'Use at least 8 characters', onPress: () => setSheet('password') },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE }} edges={['top']}>
      <AppTopBar title="Profile" actions={me.data ? [{ icon: SquarePen, label: 'Edit profile', onPress: () => setSheet('edit') }] : []} />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 120, gap: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={me.isRefetching} onRefresh={() => me.refetch()} tintColor={Colors.primary} />}
      >
        {/* 0 · who you are */}
        <View style={s.hero}>
          <View style={s.avatar}><Text style={s.avatarText}>{initialsOf(name)}</Text></View>
          <Text style={s.name} numberOfLines={2}>{niceName(name)}</Text>
          {/* A username that is just the email would repeat the Contact card. */}
          {username && username !== me.data?.email ? <Text style={s.sub} selectable>{username}</Text> : null}
          <Chip label={userRole} tone={userRole === 'Admin' ? 'violet' : 'blue'} style={{ alignSelf: 'center', marginTop: 4 }} />
        </View>

        {/* 1 · how to reach you */}
        <View style={s.block}>
          <Text style={s.heading}>Contact</Text>
          <View style={s.card}>
            {me.isLoading ? <ActivityIndicator style={{ paddingVertical: 20 }} color={MUTED} />
              : me.isError ? <ErrorState message="Could not load your profile." onRetry={() => me.refetch()} />
              : (
                <>
                  <Row label="Phone" value={me.data?.phone || 'Not added'} muted={!me.data?.phone} />
                  <Row label="Email" value={me.data?.email || 'Not added'} muted={!me.data?.email} border />
                </>
              )}
          </View>
        </View>

        {/* 2 · every page that isn't a tab */}
        <LinkList title="Manage" links={manage} />

        {/* 3 · account */}
        <LinkList title="Account" links={account} />

        <TouchableOpacity style={s.signOut} activeOpacity={0.8} onPress={confirmSignOut}>
          <LogOut size={17} color="#B42318" strokeWidth={2.2} />
          <Text style={s.signOutText}>Sign out</Text>
        </TouchableOpacity>

        {Constants.expoConfig?.version ? <Text style={s.version}>Version {Constants.expoConfig.version}</Text> : null}
      </ScrollView>

      <EditSheet
        visible={sheet === 'edit'}
        me={me.data}
        onClose={() => setSheet(null)}
        onSaved={(next) => queryClient.setQueryData(ME_KEY, (old: Me | undefined) => ({ ...(old as Me), ...next }))}
      />
      <PasswordSheet visible={sheet === 'password'} onClose={() => setSheet(null)} />
    </SafeAreaView>
  );
}

type Link = { icon: LucideIcon; label: string; sub: string; onPress: () => void };

function LinkList({ title, links }: { title: string; links: Link[] }) {
  return (
    <View style={s.block}>
      <Text style={s.heading}>{title}</Text>
      <View style={s.card}>
        {links.map((l, i) => (
          <TouchableOpacity key={l.label} style={[s.line, i > 0 && s.lineBorder]} activeOpacity={0.6} onPress={() => { tap(); l.onPress(); }}>
            <View style={s.icon}><l.icon size={18} color={INK} strokeWidth={2} /></View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={s.rowTitle}>{l.label}</Text>
              <Text style={s.sub} numberOfLines={1}>{l.sub}</Text>
            </View>
            <ChevronRight size={18} color="#A1A1AA" />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function Row({ label, value, muted, border }: { label: string; value: string; muted?: boolean; border?: boolean }) {
  return (
    <View style={[s.info, border && s.lineBorder]}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={[s.infoValue, muted && { color: MUTED, fontWeight: '400' }]} numberOfLines={1} selectable>{value}</Text>
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
  hero: { alignItems: 'center', gap: 6, backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: '#E9E9EC', paddingVertical: 22, paddingHorizontal: 16 },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 28, fontWeight: '700', color: Colors.white, letterSpacing: 0.5 },
  name: { fontSize: 22, fontWeight: '700', color: INK, letterSpacing: -0.4, textAlign: 'center', marginTop: 8 },
  sub: { fontSize: 13, color: MUTED },
  block: { gap: 10 },
  heading: { fontSize: 17, fontWeight: '700', color: INK, letterSpacing: -0.2, marginLeft: 2 },
  card: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: '#E9E9EC', paddingHorizontal: 16 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  lineBorder: { borderTopWidth: 1, borderTopColor: '#F1F1F3' },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F4F4F5', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: INK },
  info: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingVertical: 14 },
  infoLabel: { fontSize: 14, color: MUTED },
  infoValue: { flex: 1, textAlign: 'right', fontSize: 14, fontWeight: '600', color: INK },
  signOut: { height: 50, borderRadius: 15, backgroundColor: '#FEF3F2', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  signOutText: { fontSize: 15, fontWeight: '700', color: '#B42318' },
  version: { fontSize: 12, color: MUTED, textAlign: 'center', marginTop: -10 },
  form: { gap: 14, paddingBottom: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: MUTED },
  input: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#E4E4E7', paddingHorizontal: 14, fontSize: 15, color: INK, backgroundColor: Colors.white },
  error: { fontSize: 13, color: '#B42318' },
  save: { height: 50, borderRadius: 15, backgroundColor: ACTION, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  saveText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
