/**
 * Add / edit a driver. `/driver-edit` with no id creates one (POST /drivers);
 * with `?id=` it edits (PATCH /drivers/:id, only the fields that changed —
 * the backend re-validates whatever it's sent, e.g. a past licence expiry).
 * A password typed here is set on save via POST /drivers/:id/set-password,
 * which also creates the driver's app login if it doesn't exist yet.
 */
import React, { useState } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { CircleUser, IdCard, KeyRound, Activity, Truck, CheckCircle2, CircleDashed } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { FilterChip } from '@mercon/mobile-shared/components/Badge';
import { DatePickerModal } from '@mercon/mobile-shared/components/common/DateTimePickerModal';
import { api, getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { DeleteRecord } from '@/components/DeleteRecord';
import { invalidateOperatorVehicles,
  operatorService, invalidateOperatorDrivers, useOperatorDriverById,
  type OperatorDriver, type UpdateDriverInput,
} from '../../../lib/operator';
import { Field, FormHeader, PasswordField, SaveBar, Section, formStyles } from '@/features/users/components/FormKit';
import { AssignmentImpact, TruckPicker } from '@/features/vehicles/components/TruckAssignment';

const STATUSES: NonNullable<UpdateDriverInput['status']>[] = ['Available', 'OnTrip', 'OffDuty', 'Inactive'];
const STATUS_LABELS: Record<string, string> = {
  Available: 'Available',
  OnTrip: 'On Trip',
  OffDuty: 'Off Duty',
  Inactive: 'Inactive',
};

// Same rules as the backend's createDriverBody / updateDriverBody.
const PHONE_RE = /^(\+966|00966|0)?5\d{8}$/;
/** How the backend stores the phone (and the driver's app username): no spaces or dashes. */
const cleanPhone = (v: string) => v.replace(/[\s-]/g, '');
const LICENSE_RE = /^[12]\d{9}$/;

function toDDMMYYYY(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function parseDDMMYYYY(value: string): Date | undefined {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return undefined;
  const [, dd, mm, yyyy] = match;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const DriverEditScreen = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { driver, loading, error } = useOperatorDriverById(id);
  const isNew = !id;

  const body = () => {
    if (isNew) return <DriverForm onDone={() => router.back()} />;
    if (loading && !driver) return <ActivityIndicator color={Colors.primary} style={{ marginTop: 48 }} />;
    if (!driver) return <Text style={formStyles.errorText}>{error ?? 'Driver not found'}</Text>;
    return <DriverForm key={driver.id} driver={driver} onDone={() => router.back()} />;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.gray100 }} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
      <FormHeader
        title={isNew ? 'Add driver' : 'Edit driver'}
        subtitle={!isNew && driver ? `${driver.first_name} ${driver.last_name}` : undefined}
        onBack={() => router.back()}
      />
      {body()}
    </SafeAreaView>
  );
};

type Errors = Partial<Record<'firstName' | 'lastName' | 'phone' | 'license' | 'expiry' | 'password', string>>;

function DriverForm({ driver, onDone }: { driver?: OperatorDriver; onDone: () => void }) {
  const queryClient = useQueryClient();
  const isNew = !driver;
  const initialExpiry = toDDMMYYYY(driver?.license_expiry);

  const [firstName, setFirstName] = useState(driver?.first_name ?? '');
  const [lastName, setLastName] = useState(driver?.last_name ?? '');
  const [phone, setPhone] = useState(driver?.phone_primary ?? '');
  const [licenseNumber, setLicenseNumber] = useState(driver?.license_number ?? '');
  const [licenseExpiry, setLicenseExpiry] = useState(initialExpiry);
  const [status, setStatus] = useState<UpdateDriverInput['status']>((driver?.status as UpdateDriverInput['status']) ?? 'Available');
  const [password, setPassword] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  // The truck they usually drive — changed through the assignment rule (see "When you save").
  const originalTruckId = driver?.assignedVehicleId ?? driver?.assignedVehicle?.id ?? null;
  const [truckId, setTruckId] = useState<string | null>(originalTruckId);
  const [truckLabel, setTruckLabel] = useState(driver?.assignedVehicle?.plate_number ?? '');
  const [truckPickerOpen, setTruckPickerOpen] = useState(false);
  const truckChanged = truckId !== originalTruckId;
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const validate = (): Errors => {
    const e: Errors = {};
    if (!firstName.trim()) e.firstName = 'Required';
    if (!lastName.trim()) e.lastName = 'Required';
    if (!PHONE_RE.test(cleanPhone(phone))) e.phone = 'Saudi mobile, e.g. 0501234567';
    if (!LICENSE_RE.test(licenseNumber.trim())) e.license = '10 digits starting with 1 or 2';
    const expiry = parseDDMMYYYY(licenseExpiry);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!expiry) e.expiry = 'Pick a date';
    else if (licenseExpiry !== initialExpiry && expiry < today) e.expiry = 'Must be today or later';
    if (password && password.trim().length < 4) e.password = 'At least 4 characters';
    return e;
  };

  const handleSave = async () => {
    if (saving) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      const expiryIso = parseDDMMYYYY(licenseExpiry)!.toISOString();
      let driverId = driver?.id;
      if (isNew) {
        // A new driver's truck is set after they exist, through the same rule as an edit.
        const created = await operatorService.createDriver({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone_primary: cleanPhone(phone),
          license_number: licenseNumber.trim(),
          license_expiry: expiryIso,
        });
        driverId = created.id;
      } else {
        const payload: UpdateDriverInput = {};
        if (firstName.trim() !== driver.first_name) payload.first_name = firstName.trim();
        if (lastName.trim() !== driver.last_name) payload.last_name = lastName.trim();
        if (cleanPhone(phone) !== (driver.phone_primary ?? '')) payload.phone_primary = cleanPhone(phone);
        if (licenseNumber.trim() !== driver.license_number) payload.license_number = licenseNumber.trim();
        if (licenseExpiry !== initialExpiry) payload.license_expiry = expiryIso;
        if (status !== driver.status) payload.status = status;
        if (Object.keys(payload).length) await operatorService.updateDriver(driver.id, payload);
      }

      if (truckChanged && driverId) {
        try {
          await operatorService.applyTruckAssignment({ driver_id: driverId, vehicle_id: truckId });
        } catch (err) {
          Alert.alert('Driver saved, truck not changed', getApiErrorMessage(err));
        }
        await queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      }

      let passwordFailed = false;
      if (password && driverId) {
        try {
          await operatorService.setDriverPassword(driverId, password.trim());
        } catch (err) {
          passwordFailed = true;
          Alert.alert('Driver saved, password not set', getApiErrorMessage(err));
        }
      }

      invalidateOperatorDrivers();
      await queryClient.invalidateQueries({ queryKey: ['user-management', 'drivers'] });
      await queryClient.invalidateQueries({ queryKey: ['drivers'] });
      // When editing, stay on the form so the password can be fixed and saved again.
      if (passwordFailed && !isNew) return;
      onDone();
    } catch (err) {
      Alert.alert(isNew ? 'Could not add driver' : 'Could not save driver', getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // `hasAccountPassword` comes from GET /drivers/:id; older servers only sent `user`.
  const hasPassword = Boolean(driver?.hasAccountPassword ?? driver?.user);
  const loginPhone = cleanPhone(phone) || driver?.user?.username || '';

  const clear = (k: keyof Errors) => errors[k] && setErrors((prev) => ({ ...prev, [k]: undefined }));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={formStyles.scroll} keyboardShouldPersistTaps="handled">
        <Section title="Profile" Icon={CircleUser}>
          <View style={formStyles.row}>
            <View style={{ flex: 1 }}>
              <Field label="First name" required value={firstName} error={errors.firstName}
                onChangeText={(v) => { setFirstName(v); clear('firstName'); }} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Last name" required value={lastName} error={errors.lastName}
                onChangeText={(v) => { setLastName(v); clear('lastName'); }} />
            </View>
          </View>
          <Field
            label="Mobile number"
            required
            value={phone}
            onChangeText={(v) => { setPhone(v); clear('phone'); }}
            keyboardType="phone-pad"
            placeholder="05XXXXXXXX"
            error={errors.phone}
          />
        </Section>

        <Section title="Licence" Icon={IdCard}>
          <Field
            label="Licence / Iqama number"
            required
            value={licenseNumber}
            onChangeText={(v) => { setLicenseNumber(v); clear('license'); }}
            keyboardType="number-pad"
            maxLength={10}
            placeholder="10 digits"
            error={errors.license}
          />
          <Field
            label="Licence expiry"
            required
            value={licenseExpiry}
            placeholder="Select date"
            onPressBox={() => setPickerOpen(true)}
            error={errors.expiry}
          />
        </Section>

        {!isNew && (
          <Section title="Status" Icon={Activity}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {STATUSES.map((s) => (
                <FilterChip key={s} label={STATUS_LABELS[s]} active={status === s} onPress={() => setStatus(s)} />
              ))}
            </View>
          </Section>
        )}

        <Section title="Truck" Icon={Truck} note="Optional">
          <Field label="Usual truck" value={truckLabel} placeholder="No truck" onPressBox={() => setTruckPickerOpen(true)} />
          <AssignmentImpact driverId={driver?.id ?? null} vehicleId={truckId} changed={!isNew && truckChanged} />
          {isNew && truckChanged ? (
            <AssignmentImpact driverId={null} vehicleId={truckId} changed />
          ) : null}
        </Section>

        <Section
          title="App login"
          Icon={KeyRound}
          note={isNew ? 'Optional' : hasPassword ? 'Password is set' : 'No password yet'}
        >
          <SignInMethods phone={loginPhone} license={licenseNumber.trim()} hasPassword={!isNew && hasPassword} />
          <Field
            label="Username (driver app)"
            value={loginPhone}
            editable={false}
            hint="Always the mobile number above — change the number to change the username."
          />
          <PasswordField
            label={isNew || !hasPassword ? 'Password' : 'New password'}
            value={password}
            onChangeText={(v) => { setPassword(v); clear('password'); }}
            error={errors.password}
            placeholder={isNew || !hasPassword ? 'Optional' : 'Leave blank to keep'}
          />
        </Section>
        {driver ? (
          <DeleteRecord
            label="Delete driver"
            name={`${driver.first_name} ${driver.last_name}`.trim()}
            consequence="The driver leaves the active list and can no longer sign in to the driver app. Their past trips, documents and pay stay. Admins can restore them from Trash."
            needsPassword
            run={(password) => api.delete(`/drivers/${driver.id}`, { data: { password } })}
            backTo="/drivers"
            onDeleted={() => { invalidateOperatorDrivers(); invalidateOperatorVehicles(); }}
          />
        ) : null}
      </ScrollView>

      <SaveBar label={isNew ? 'Add driver' : 'Save changes'} onPress={handleSave} saving={saving} />

      <TruckPicker
        visible={truckPickerOpen}
        driverId={driver?.id ?? null}
        selectedId={truckId}
        onPick={(nextId, truck) => { setTruckId(nextId); setTruckLabel(truck?.plate_number ?? ''); setTruckPickerOpen(false); }}
        onClose={() => setTruckPickerOpen(false)}
      />

      <DatePickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selectedDate={licenseExpiry || toDDMMYYYY(new Date().toISOString())}
        onSelectDate={(d) => { setLicenseExpiry(d); clear('expiry'); setPickerOpen(false); }}
      />
    </KeyboardAvoidingView>
  );
}

/**
 * How the driver signs in to the driver app, in plain words: mobile number + licence number
 * always works; an app password works too once the office has set one. Passwords are stored
 * scrambled (hashed), so nobody — office included — can read one back; setting a new one is the fix.
 */
export function SignInMethods({ phone, license, hasPassword }: { phone: string; license: string; hasPassword: boolean }) {
  return (
    <View style={signIn.box}>
      <Text style={signIn.title}>How the driver signs in</Text>
      <View style={signIn.row}>
        <CheckCircle2 size={16} color="#15803D" />
        <Text style={signIn.text}>
          Mobile <Text style={signIn.mono}>{phone || '—'}</Text> + licence number <Text style={signIn.mono}>{license || '—'}</Text>
          <Text style={signIn.muted}> — always works</Text>
        </Text>
      </View>
      <View style={signIn.row}>
        {hasPassword ? <CheckCircle2 size={16} color="#15803D" /> : <CircleDashed size={16} color="#9898A4" />}
        <Text style={signIn.text}>
          {hasPassword ? 'Mobile + app password — set' : 'App password — not set'}
          <Text style={signIn.muted}>{hasPassword ? ' (hidden for safety; type a new one below to change it)' : ' — only the licence number works for now'}</Text>
        </Text>
      </View>
    </View>
  );
}

const signIn = {
  box: { backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', padding: 12, gap: 8 } as const,
  title: { fontSize: 12, fontWeight: '800' as const, letterSpacing: 0.5, color: '#52525B', textTransform: 'uppercase' as const },
  row: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 8 },
  text: { flex: 1, fontSize: 14, lineHeight: 20, color: '#3E3C3D' },
  mono: { fontWeight: '700' as const, fontVariant: ['tabular-nums' as const] },
  muted: { color: '#6B6B76' },
};

export default DriverEditScreen;
