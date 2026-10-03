/**
 * Add / edit a subcontracted carrier. `/third-party-edit` with no id creates
 * one (POST /third-party-providers); with `?id=` it edits (PUT, only the
 * fields that changed). Same fields as the web's Third-Party form.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Building2, FileText, Phone } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import { operatorService, type OperatorThirdPartyProvider, type ThirdPartyProviderInput } from '@/lib/operator';
import { Field, FormHeader, SaveBar, Section, SwitchRow, formStyles } from '@/features/users/components/FormKit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Errors = Partial<Record<'name' | 'phone' | 'email', string>>;

export default function ThirdPartyEditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isNew = !id;
  const [provider, setProvider] = useState<OperatorThirdPartyProvider | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let live = true;
    operatorService.thirdPartyProviderById(id)
      .then((p) => { if (live) setProvider(p); })
      .catch((e) => { if (live) setLoadError(getApiErrorMessage(e)); });
    return () => { live = false; };
  }, [id]);

  const body = () => {
    if (isNew) return <ProviderForm onDone={() => router.back()} />;
    if (loadError) return <Text style={formStyles.errorText}>{loadError}</Text>;
    if (!provider) return <ActivityIndicator color={Colors.primary} style={{ marginTop: 48 }} />;
    return <ProviderForm key={provider.id} provider={provider} onDone={() => router.back()} />;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.gray100 }} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
      <FormHeader
        title={isNew ? 'Add carrier' : 'Edit carrier'}
        subtitle={isNew ? 'A subcontractor you give trips to' : provider?.name}
        onBack={() => router.back()}
      />
      {body()}
    </SafeAreaView>
  );
}

function ProviderForm({ provider, onDone }: { provider?: OperatorThirdPartyProvider; onDone: () => void }) {
  const isNew = !provider;
  const [name, setName] = useState(provider?.name ?? '');
  const [contact, setContact] = useState(provider?.contact_person ?? '');
  const [phone, setPhone] = useState(provider?.phone ?? '');
  const [email, setEmail] = useState(provider?.email ?? '');
  const [address, setAddress] = useState(provider?.address ?? '');
  const [taxId, setTaxId] = useState(provider?.tax_id ?? '');
  const [notes, setNotes] = useState(provider?.notes ?? '');
  const [isActive, setIsActive] = useState(provider?.isActive ?? true);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const clear = (k: keyof Errors) => errors[k] && setErrors((prev) => ({ ...prev, [k]: undefined }));

  const validate = (): Errors => {
    const e: Errors = {};
    if (!name.trim()) e.name = 'Enter the carrier’s name';
    if (phone.trim() && phone.replace(/[^\d]/g, '').length < 7) e.phone = 'This number looks too short';
    if (email.trim() && !EMAIL_RE.test(email.trim())) e.email = 'Enter a valid email';
    return e;
  };

  const handleSave = async () => {
    if (saving) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    const values: ThirdPartyProviderInput = {
      name: name.trim(),
      contact_person: contact.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      tax_id: taxId.trim(),
      notes: notes.trim(),
    };

    setSaving(true);
    try {
      if (provider) {
        const before: Record<string, unknown> = {
          name: provider.name, contact_person: provider.contact_person ?? '', phone: provider.phone ?? '', email: provider.email ?? '',
          address: provider.address ?? '', tax_id: provider.tax_id ?? '', notes: provider.notes ?? '',
        };
        const changed: Partial<ThirdPartyProviderInput> = {};
        (Object.keys(values) as (keyof ThirdPartyProviderInput)[]).forEach((k) => {
          if (values[k] !== before[k]) (changed as Record<string, unknown>)[k] = values[k];
        });
        if (isActive !== (provider.isActive ?? true)) changed.isActive = isActive;
        if (Object.keys(changed).length) await operatorService.updateThirdPartyProvider(provider.id, changed);
      } else {
        await operatorService.createThirdPartyProvider(values);
      }
      onDone();
    } catch (err) {
      Alert.alert(isNew ? 'Could not add the carrier' : 'Could not save the carrier', getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={formStyles.scroll} keyboardShouldPersistTaps="handled">
        <Section title="Carrier" Icon={Building2}>
          <Field
            label="Company name"
            required
            value={name}
            onChangeText={(v) => { setName(v); clear('name'); }}
            placeholder="e.g. Al Faris Transport"
            autoCapitalize="words"
            error={errors.name}
          />
          <Field label="VAT / tax number" value={taxId} onChangeText={setTaxId} keyboardType="number-pad" placeholder="Optional" />
        </Section>

        <Section title="Contact" Icon={Phone}>
          <Field label="Contact person" value={contact} onChangeText={setContact} placeholder="Who you call" autoCapitalize="words" />
          <Field
            label="Phone"
            value={phone}
            onChangeText={(v) => { setPhone(v); clear('phone'); }}
            keyboardType="phone-pad"
            placeholder="05XXXXXXXX"
            error={errors.phone}
          />
          <Field
            label="Email"
            value={email}
            onChangeText={(v) => { setEmail(v); clear('email'); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Optional"
            error={errors.email}
          />
          <Field label="Address" value={address} onChangeText={setAddress} placeholder="City, district" />
        </Section>

        <Section title="Notes" Icon={FileText}>
          <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Payment terms, truck types, anything useful" multiline />
          {!isNew ? (
            <SwitchRow
              title="Active"
              description="Inactive carriers are kept for history but shown as inactive."
              value={isActive}
              onChange={setIsActive}
            />
          ) : null}
        </Section>
        <View />
      </ScrollView>

      <SaveBar label={isNew ? 'Add carrier' : 'Save changes'} onPress={handleSave} saving={saving} />
    </KeyboardAvoidingView>
  );
}
