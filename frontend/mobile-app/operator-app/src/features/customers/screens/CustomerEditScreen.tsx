/**
 * Add / edit a customer. `/customer-edit` with no id creates one
 * (POST /customers); with `?id=` it edits (PATCH /customers/:id).
 * Same fields as the web's Add / Edit Customer pages.
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, MessageCircle, Phone, Smartphone, Truck } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { FilterChip } from '@mercon/mobile-shared/components/Badge';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import {
  operatorService, invalidateOperatorCustomers, useOperatorCustomerById,
  type CreateCustomerInput, type OperatorCustomer,
} from '@/lib/operator';
import { ChoiceCards, Field, FormHeader, SaveBar, Section, SwitchRow, formStyles } from '@/features/users/components/FormKit';

const PAYMENT_TERMS = ['Net 15 Days', 'Net 30 Days', 'Net 45 Days', 'Net 60 Days'];
type Workflow = NonNullable<CreateCustomerInput['driver_workflow']>;
type Errors = Partial<Record<'name' | 'phone' | 'link', string>>;

export default function CustomerEditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isNew = !id;
  const { customer, loading, error } = useOperatorCustomerById(id);

  const body = () => {
    if (isNew) return <CustomerForm onDone={() => router.back()} />;
    if (loading && !customer) return <ActivityIndicator color={Colors.primary} style={{ marginTop: 48 }} />;
    if (!customer) return <Text style={formStyles.errorText}>{error ?? 'Customer not found'}</Text>;
    return <CustomerForm key={customer.id} customer={customer} onDone={() => router.back()} />;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.gray100 }} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
      <FormHeader title={isNew ? 'Add customer' : 'Edit customer'} subtitle={customer?.name} onBack={() => router.back()} />
      {body()}
    </SafeAreaView>
  );
}

function CustomerForm({ customer, onDone }: { customer?: OperatorCustomer; onDone: () => void }) {
  const queryClient = useQueryClient();
  const isNew = !customer;
  const [name, setName] = useState(customer?.name ?? '');
  const [terms, setTerms] = useState(customer?.payment_terms ?? '');
  const [phone, setPhone] = useState(customer?.contact_phone ?? customer?.primary_contact_phone ?? '');
  const [contact, setContact] = useState(customer?.primary_contact_person ?? '');
  const [contact2, setContact2] = useState(customer?.secondary_contact_person ?? '');
  const [phone2, setPhone2] = useState(customer?.secondary_contact_phone ?? '');
  const [whatsapp, setWhatsapp] = useState(customer?.whatsapp_number ?? '');
  const [groupName, setGroupName] = useState(customer?.whatsapp_group_name ?? '');
  const [groupLink, setGroupLink] = useState(customer?.whatsapp_group_link ?? '');
  const [workflow, setWorkflow] = useState<Workflow>(customer?.driver_workflow ?? 'NATIVE');
  const [isActive, setIsActive] = useState(customer?.isActive ?? true);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const clear = (k: keyof Errors) => errors[k] && setErrors((prev) => ({ ...prev, [k]: undefined }));

  const validate = (): Errors => {
    const e: Errors = {};
    if (!name.trim()) e.name = 'Enter the customer’s name';
    if (phone.replace(/[^\d]/g, '').length < 7) e.phone = 'Enter a phone number';
    if (groupLink.trim() && !/^https?:\/\//i.test(groupLink.trim())) e.link = 'Paste the full link, starting with https://';
    return e;
  };

  const handleSave = async () => {
    if (saving) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    const values: CreateCustomerInput = {
      name: name.trim(),
      contact_phone: phone.trim(),
      primary_contact_person: contact.trim(),
      primary_contact_phone: phone.trim(),
      secondary_contact_person: contact2.trim(),
      secondary_contact_phone: phone2.trim(),
      payment_terms: terms,
      whatsapp_number: whatsapp.trim(),
      whatsapp_group_name: groupName.trim(),
      whatsapp_group_link: groupLink.trim(),
      driver_workflow: workflow,
    };

    setSaving(true);
    try {
      if (customer) await operatorService.updateCustomer(customer.id, { ...values, isActive });
      else await operatorService.createCustomer(values);
      invalidateOperatorCustomers();
      await queryClient.invalidateQueries({ queryKey: ['customers'] });
      onDone();
    } catch (err) {
      Alert.alert(isNew ? 'Could not add the customer' : 'Could not save the customer', getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={formStyles.scroll} keyboardShouldPersistTaps="handled">
        <Section title="Company" Icon={Building2}>
          <Field
            label="Customer name"
            required
            value={name}
            onChangeText={(v) => { setName(v); clear('name'); }}
            autoCapitalize="words"
            error={errors.name}
          />
          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 6 }}>Payment terms</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {PAYMENT_TERMS.map((t) => (
                <FilterChip key={t} label={t.replace(' Days', ' days')} active={terms === t} onPress={() => setTerms(terms === t ? '' : t)} />
              ))}
            </View>
          </View>
        </Section>

        <Section title="Contacts" Icon={Phone}>
          <Field
            label="Phone"
            required
            value={phone}
            onChangeText={(v) => { setPhone(v); clear('phone'); }}
            keyboardType="phone-pad"
            placeholder="05XXXXXXXX"
            error={errors.phone}
          />
          <Field label="Contact person" value={contact} onChangeText={setContact} autoCapitalize="words" />
          <View style={formStyles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Second contact" value={contact2} onChangeText={setContact2} autoCapitalize="words" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Their phone" value={phone2} onChangeText={setPhone2} keyboardType="phone-pad" />
            </View>
          </View>
        </Section>

        <Section title="WhatsApp" Icon={MessageCircle}>
          <Field label="WhatsApp number" value={whatsapp} onChangeText={setWhatsapp} keyboardType="phone-pad" placeholder="05XXXXXXXX" />
          <Field label="Group name" value={groupName} onChangeText={setGroupName} />
          <Field
            label="Group link"
            value={groupLink}
            onChangeText={(v) => { setGroupLink(v); clear('link'); }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://chat.whatsapp.com/…"
            error={errors.link}
          />
        </Section>

        <Section title="Driver app" Icon={Truck}>
          <ChoiceCards<Workflow>
            value={workflow}
            onChange={setWorkflow}
            options={[
              { value: 'NATIVE', title: 'MERCON Driver app', description: 'Drivers update trips in our app', Icon: Truck },
              { value: 'EXTERNAL_APP', title: 'Customer’s own app', description: 'Drivers update trips in the customer’s app', Icon: Smartphone },
            ]}
          />
          {!isNew ? (
            <SwitchRow title="Active" description="Inactive customers are kept for history." value={isActive} onChange={setIsActive} />
          ) : null}
        </Section>
        <View />
      </ScrollView>

      <SaveBar label={isNew ? 'Add customer' : 'Save changes'} onPress={handleSave} saving={saving} />
    </KeyboardAvoidingView>
  );
}
