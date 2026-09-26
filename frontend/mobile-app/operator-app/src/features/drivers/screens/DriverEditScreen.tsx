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
import { CircleUser, IdCard, KeyRound, Activity } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { FilterChip } from '@mercon/mobile-shared/components/Badge';
import { DatePickerModal } from '@mercon/mobile-shared/components/common/DateTimePickerModal';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import {
  operatorService, invalidateOperatorDrivers, useOperatorDriverById,
  type OperatorDriver, type UpdateDriverInput,
} from '../../../lib/operator';
import { Field, FormHeader, PasswordField, SaveBar, Section, formStyles } from '@/features/users/components/FormKit';

const STATUSES: NonNullable<UpdateDriverInput['status']>[] = ['Available', 'OnTrip', 'OffDuty', 'Inactive'];
const STATUS_LABELS: Record<string, string> = {
  Available: 'Available',
  OnTrip: 'On Trip',
  OffDuty: 'Off Duty',
  Inactive: 'Inactive',
};

// Same rules as the backend's createDriverBody / updateDriverBody.
const PHONE_RE = /^(\+966|00966|0)?5\d{8}$/;
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
        subtitle={isNew ? 'Profile, licence and app login' : driver ? `${driver.first_name} ${driver.last_name}` : undefined}
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
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const validate = (): Errors => {
    const e: Errors = {};
    if (!firstName.trim()) e.firstName = 'Required';
    if (!lastName.trim()) e.lastName = 'Required';
    if (!PHONE_RE.test(phone.replace(/[\s-]/g, ''))) e.phone = 'Saudi mobile, e.g. 0501234567';
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
        const created = await operatorService.createDriver({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone_primary: phone.trim(),
          license_number: licenseNumber.trim(),
          license_expiry: expiryIso,
        });
        driverId = created.id;
      } else {
        const payload: UpdateDriverInput = {};
        if (firstName.trim() !== driver.first_name) payload.first_name = firstName.trim();
        if (lastName.trim() !== driver.last_name) payload.last_name = lastName.trim();
        if (phone.trim() !== (driver.phone_primary ?? '')) payload.phone_primary = phone.trim();
        if (licenseNumber.trim() !== driver.license_number) payload.license_number = licenseNumber.trim();
        if (licenseExpiry !== initialExpiry) payload.license_expiry = expiryIso;
        if (status !== driver.status) payload.status = status;
        if (Object.keys(payload).length) await operatorService.updateDriver(driver.id, payload);
      }

      if (password && driverId) {
        try {
          await operatorService.setDriverPassword(driverId, password.trim());
        } catch (err) {
          Alert.alert('Driver saved, password not set', getApiErrorMessage(err));
        }
      }

      invalidateOperatorDrivers();
      await queryClient.invalidateQueries({ queryKey: ['user-management', 'drivers'] });
      onDone();
    } catch (err) {
      Alert.alert(isNew ? 'Could not add driver' : 'Could not save driver', getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

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
            hint="The driver signs in to the Driver app with this number."
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

        <Section
          title="App login"
          Icon={KeyRound}
          note={
            isNew
              ? 'Optional. Without a password the driver signs in with mobile number + licence number.'
              : driver?.user
                ? 'This driver already has a password. Type a new one to reset it, or leave blank.'
                : 'No password yet — the driver signs in with mobile number + licence number until you set one.'
          }
        >
          <PasswordField
            label={isNew || !driver?.user ? 'Password' : 'New password'}
            value={password}
            onChangeText={(v) => { setPassword(v); clear('password'); }}
            error={errors.password}
            placeholder="Leave blank to skip"
            hint={password ? 'Tap the eye to check it, or Copy to share it with the driver.' : undefined}
          />
        </Section>
      </ScrollView>

      <SaveBar label={isNew ? 'Add driver' : 'Save changes'} onPress={handleSave} saving={saving} />

      <DatePickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selectedDate={licenseExpiry || toDDMMYYYY(new Date().toISOString())}
        onSelectDate={(d) => { setLicenseExpiry(d); clear('expiry'); setPickerOpen(false); }}
      />
    </KeyboardAvoidingView>
  );
}

export default DriverEditScreen;
