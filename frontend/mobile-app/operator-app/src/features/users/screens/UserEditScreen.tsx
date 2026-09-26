/**
 * Add / edit a platform (Admin or Operator) user. Admin-only — the backend
 * rejects POST/PUT/DELETE /users from Operators too. With no ?id= it creates a user.
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleUser, KeyRound, ShieldCheck, Headset } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { useAuth } from '@mercon/mobile-shared/lib/auth-context';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { operatorService, type PlatformUser, type PlatformUserInput } from '@/lib/operator';
import {
  ChoiceCards, DangerButton, Field, FormHeader, PasswordField, SaveBar, Section, SwitchRow, formStyles,
} from '../components/FormKit';
import { USER_MANAGEMENT_KEYS } from './UserManagementScreen';

const ROLE_OPTIONS = [
  { value: 'Operator' as const, title: 'Operator', description: 'Runs trips, drivers, fleet and customers day to day.', Icon: Headset },
  { value: 'Admin' as const, title: 'Admin', description: 'Everything an Operator can do, plus managing users and settings.', Icon: ShieldCheck },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function UserEditScreen() {
  const router = useRouter();
  const { role: myRole, profile } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isNew = !id;

  const users = useQuery({ queryKey: USER_MANAGEMENT_KEYS.users, queryFn: () => operatorService.platformUsers(), enabled: !isNew });
  const user = users.data?.find((u) => u.id === id);

  const body = () => {
    if (myRole !== 'Admin') return <Text style={formStyles.errorText}>Only Admins can add or edit users.</Text>;
    if (!isNew && users.isLoading) return <ActivityIndicator color={Colors.primary} style={{ marginTop: 48 }} />;
    if (!isNew && !user) return <Text style={formStyles.errorText}>{users.error ? getApiErrorMessage(users.error) : 'User not found'}</Text>;
    return <UserForm key={user?.id ?? 'new'} user={user} isSelf={!!user && user.id === profile?.id} onDone={() => router.back()} />;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.gray100 }} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
      <FormHeader
        title={isNew ? 'Add user' : 'Edit user'}
        subtitle={isNew ? 'Web dashboard + Operator app login' : user?.name}
        onBack={() => router.back()}
      />
      {body()}
    </SafeAreaView>
  );
}

type Errors = Partial<Record<'name' | 'phone' | 'email' | 'password', string>>;

/** The form itself; `user` undefined = create. Keyed by user id so state initialises from props. */
function UserForm({ user, isSelf, onDone }: { user?: PlatformUser; isSelf: boolean; onDone: () => void }) {
  const queryClient = useQueryClient();
  const isNew = !user;
  const [name, setName] = useState(user?.name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<PlatformUser['role']>(user?.role ?? 'Operator');
  const [active, setActive] = useState((user?.status ?? 'Active') === 'Active');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const clear = (k: keyof Errors) => errors[k] && setErrors((prev) => ({ ...prev, [k]: undefined }));

  const validate = (): Errors => {
    const e: Errors = {};
    if (!name.trim()) e.name = 'Required';
    if (!phone.trim()) e.phone = 'Required';
    if (email.trim() && !EMAIL_RE.test(email.trim())) e.email = 'Not a valid email';
    if (isNew && !password.trim()) e.password = 'Required for a new user — tap Generate for one';
    return e;
  };

  const handleSave = async () => {
    if (saving) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      const payload: PlatformUserInput = {
        name: name.trim(),
        username: username.trim() || undefined,
        phone: phone.trim(),
        email: email.trim() || null,
        role,
        status: active ? 'Active' : 'Inactive',
        password: password.trim() || undefined,
      };
      if (isNew) await operatorService.createPlatformUser({ ...payload, password: password.trim() });
      else await operatorService.updatePlatformUser(user.id, payload);
      await queryClient.invalidateQueries({ queryKey: USER_MANAGEMENT_KEYS.users });
      onDone();
    } catch (err) {
      Alert.alert(isNew ? 'Could not add user' : 'Could not save user', getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!user) return;
    Alert.alert(
      `Delete ${user.name}?`,
      'They will no longer be able to sign in. To block access for now, turn off "Active" instead.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await operatorService.deletePlatformUser(user.id);
              await queryClient.invalidateQueries({ queryKey: USER_MANAGEMENT_KEYS.users });
              onDone();
            } catch (err) {
              Alert.alert('Could not delete user', getApiErrorMessage(err));
            }
          },
        },
      ],
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={formStyles.scroll} keyboardShouldPersistTaps="handled">
        <Section title="Profile" Icon={CircleUser}>
          <Field label="Full name" required value={name} error={errors.name}
            onChangeText={(v) => { setName(v); clear('name'); }} />
          <Field label="Mobile number" required value={phone} error={errors.phone} keyboardType="phone-pad"
            onChangeText={(v) => { setPhone(v); clear('phone'); }} />
          <Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false}
            placeholder="Optional" hint="Used to sign in. Leave blank to sign in with the mobile number." />
          <Field label="Email" value={email} error={errors.email} keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
            placeholder="Optional" onChangeText={(v) => { setEmail(v); clear('email'); }} />
        </Section>

        <Section title="Access" Icon={ShieldCheck}>
          <ChoiceCards options={ROLE_OPTIONS} value={role} onChange={setRole} />
          <SwitchRow
            title="Active"
            description={active ? 'Can sign in to the dashboard and Operator app.' : 'Sign-in is blocked until turned back on.'}
            value={active}
            onChange={setActive}
          />
        </Section>

        <Section
          title={isNew ? 'Password' : 'Change password'}
          Icon={KeyRound}
          note={isNew ? undefined : 'Leave blank to keep the current password.'}
        >
          <PasswordField
            label={isNew ? 'Password' : 'New password'}
            required={isNew}
            value={password}
            onChangeText={(v) => { setPassword(v); clear('password'); }}
            error={errors.password}
            hint={password ? 'Tap the eye to check it, or Copy to share it with the user.' : undefined}
          />
        </Section>

        {!isNew && !isSelf ? (
          <View style={{ marginTop: 8 }}>
            <DangerButton label="Delete user" onPress={confirmDelete} />
          </View>
        ) : null}
      </ScrollView>

      <SaveBar label={isNew ? 'Add user' : 'Save changes'} onPress={handleSave} saving={saving} />
    </KeyboardAvoidingView>
  );
}
