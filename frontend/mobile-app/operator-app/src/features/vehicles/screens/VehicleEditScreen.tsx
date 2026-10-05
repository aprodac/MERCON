/**
 * Add / edit a vehicle. `/vehicle-edit` with no id creates one (POST /vehicles);
 * with `?id=` it edits (PATCH /vehicles/:id). Same fields as the web's Add /
 * Edit truck pages: truck, load, GPS tracker, trailer and — when editing —
 * status and the assigned driver (saved on the driver, like the web does).
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StatusBar, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Check, Container, MapPin, Truck, UserRound } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { FilterChip } from '@mercon/mobile-shared/components/Badge';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';
import {
  operatorService, invalidateOperatorVehicles, invalidateOperatorDrivers, useOperatorVehicleById,
  type CreateVehicleInput, type OperatorVehicle, type UpdateVehicleInput,
} from '@/lib/operator';
import { ListSearch } from '@/components/ListSearch';
import { USER_MANAGEMENT_KEYS } from '@/features/users/screens/UserManagementScreen';
import { niceName } from '@/features/trips/create/components/ui';
import { Field, FormHeader, SaveBar, Section, SwitchRow, formStyles } from '@/features/users/components/FormKit';

type AssetType = CreateVehicleInput['asset_type'];
type Status = NonNullable<UpdateVehicleInput['status']>;
const ASSET_TYPES: AssetType[] = ['Flatbed', 'Reefer', 'Box', 'Tanker'];
const STATUSES: Status[] = ['Available', 'OnTrip', 'Maintenance', 'Inactive'];
const STATUS_LABELS: Record<Status, string> = { Available: 'Available', OnTrip: 'On Trip', Maintenance: 'Maintenance', Inactive: 'Inactive' };
type Errors = Partial<Record<'plate' | 'capacity' | 'trailer', string>>;

export default function VehicleEditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isNew = !id;
  const { vehicle, loading, error } = useOperatorVehicleById(id);

  const body = () => {
    if (isNew) return <VehicleForm onDone={() => router.back()} />;
    if (loading && !vehicle) return <ActivityIndicator color={Colors.primary} style={{ marginTop: 48 }} />;
    if (!vehicle) return <Text style={formStyles.errorText}>{error ?? 'Vehicle not found'}</Text>;
    return <VehicleForm key={vehicle.id} vehicle={vehicle} onDone={() => router.back()} />;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.gray100 }} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
      <FormHeader title={isNew ? 'Add vehicle' : 'Edit vehicle'} subtitle={vehicle?.plate_number} onBack={() => router.back()} />
      {body()}
    </SafeAreaView>
  );
}

function VehicleForm({ vehicle, onDone }: { vehicle?: OperatorVehicle; onDone: () => void }) {
  const queryClient = useQueryClient();
  const isNew = !vehicle;
  const originalDriverId = vehicle?.assignedDriver?.id ?? null;

  const [plate, setPlate] = useState(vehicle?.plate_number ?? '');
  const [assetType, setAssetType] = useState<AssetType>((vehicle?.asset_type as AssetType) ?? 'Flatbed');
  const [capacity, setCapacity] = useState(vehicle?.capacity_kg ? String(vehicle.capacity_kg) : '');
  const [status, setStatus] = useState<Status>((vehicle?.status as Status) ?? 'Available');
  const [gps, setGps] = useState(vehicle?.icces_device_id ?? '');
  const [hasTailgate, setHasTailgate] = useState(!!vehicle?.has_tailgate);
  const [hasTrailer, setHasTrailer] = useState(!!vehicle?.trailer_number);
  const [trailerPlate, setTrailerPlate] = useState(vehicle?.trailer_number ?? '');
  const [trailerType, setTrailerType] = useState<AssetType>((vehicle?.trailer_type as AssetType) ?? 'Flatbed');
  const [trailerCapacity, setTrailerCapacity] = useState(vehicle?.trailer_capacity_kg ? String(vehicle.trailer_capacity_kg) : '');
  const [driverId, setDriverId] = useState<string | null>(originalDriverId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const drivers = useQuery({ queryKey: USER_MANAGEMENT_KEYS.drivers, queryFn: () => operatorService.driverAccounts(), enabled: !isNew, staleTime: 60_000 });
  const pickedDriver = drivers.data?.find((d) => d.id === driverId) ?? (driverId && driverId === originalDriverId ? vehicle?.assignedDriver : null);
  const driverLabel = pickedDriver ? niceName(`${pickedDriver.first_name} ${pickedDriver.last_name}`.trim()) : '';

  const clear = (k: keyof Errors) => errors[k] && setErrors((prev) => ({ ...prev, [k]: undefined }));

  const validate = (): Errors => {
    const e: Errors = {};
    if (!plate.trim()) e.plate = 'Enter the plate number';
    if (!(parseInt(capacity, 10) > 0)) e.capacity = 'Enter the load in kg';
    if (hasTrailer && !trailerPlate.trim()) e.trailer = 'Enter the trailer plate, or switch the trailer off';
    return e;
  };

  const handleSave = async () => {
    if (saving) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    const values: CreateVehicleInput = {
      plate_number: plate.trim(),
      asset_type: assetType,
      capacity_kg: parseInt(capacity, 10),
      icces_device_id: gps.trim() || null,
      trailer_number: hasTrailer ? trailerPlate.trim() : null,
      trailer_type: hasTrailer ? trailerType : null,
      trailer_capacity_kg: hasTrailer && parseInt(trailerCapacity, 10) > 0 ? parseInt(trailerCapacity, 10) : null,
      has_tailgate: hasTailgate,
    };

    setSaving(true);
    try {
      if (vehicle) {
        await operatorService.updateVehicle(vehicle.id, { ...values, status });
        // The assignment lives on the driver, so it is saved there (as the web does).
        if (driverId !== originalDriverId) {
          try {
            if (originalDriverId) await operatorService.updateDriver(originalDriverId, { assigned_vehicle_id: null });
            if (driverId) await operatorService.updateDriver(driverId, { assigned_vehicle_id: vehicle.id });
          } catch (err) {
            Alert.alert('Vehicle saved, driver not changed', getApiErrorMessage(err));
          }
          invalidateOperatorDrivers();
          await queryClient.invalidateQueries({ queryKey: ['drivers'] });
          await queryClient.invalidateQueries({ queryKey: USER_MANAGEMENT_KEYS.drivers });
        }
      } else {
        await operatorService.createVehicle(values);
      }
      invalidateOperatorVehicles();
      await queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      onDone();
    } catch (err) {
      Alert.alert(isNew ? 'Could not add the vehicle' : 'Could not save the vehicle', getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={formStyles.scroll} keyboardShouldPersistTaps="handled">
        <Section title="Truck" Icon={Truck}>
          <Field
            label="Plate number"
            required
            value={plate}
            onChangeText={(v) => { setPlate(v.toUpperCase()); clear('plate'); }}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="DRA-6484"
            error={errors.plate}
          />
          <TypeChips label="Type" value={assetType} onChange={setAssetType} />
          <Field
            label="Load (kg)"
            required
            value={capacity}
            onChangeText={(v) => { setCapacity(v.replace(/[^0-9]/g, '')); clear('capacity'); }}
            keyboardType="number-pad"
            placeholder="20000"
            error={errors.capacity}
          />
        </Section>

        {!isNew ? (
          <Section title="Status" Icon={Activity}>
            <View style={s.chips}>
              {STATUSES.map((st) => <FilterChip key={st} label={STATUS_LABELS[st]} active={status === st} onPress={() => setStatus(st)} />)}
            </View>
          </Section>
        ) : null}

        {!isNew ? (
          <Section title="Driver" Icon={UserRound}>
            <Field label="Assigned driver" value={driverLabel} placeholder="No driver" onPressBox={() => setPickerOpen(true)} />
          </Section>
        ) : null}

        <Section title="GPS tracker" Icon={MapPin}>
          <Field label="Device ID" value={gps} onChangeText={setGps} autoCapitalize="characters" autoCorrect={false} placeholder="Optional" />
        </Section>

        <Section title="Trailer" Icon={Container}>
          <SwitchRow title="Has a tailgate" description="Customer messages say WITH TAILGATE when this truck is on a trip." value={hasTailgate} onChange={setHasTailgate} />
          <SwitchRow title="Has a trailer" description="Adds the trailer’s plate and load." value={hasTrailer} onChange={(v) => { setHasTrailer(v); clear('trailer'); }} />
          {hasTrailer ? (
            <>
              <Field
                label="Trailer plate"
                required
                value={trailerPlate}
                onChangeText={(v) => { setTrailerPlate(v.toUpperCase()); clear('trailer'); }}
                autoCapitalize="characters"
                autoCorrect={false}
                error={errors.trailer}
              />
              <TypeChips label="Trailer type" value={trailerType} onChange={setTrailerType} />
              <Field label="Trailer load (kg)" value={trailerCapacity} onChangeText={(v) => setTrailerCapacity(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" />
            </>
          ) : null}
        </Section>
        <View />
      </ScrollView>

      <SaveBar label={isNew ? 'Add vehicle' : 'Save changes'} onPress={handleSave} saving={saving} />

      <DriverPicker
        visible={pickerOpen}
        drivers={drivers.data ?? []}
        loading={drivers.isLoading}
        selectedId={driverId}
        onPick={(next) => { setDriverId(next); setPickerOpen(false); }}
        onClose={() => setPickerOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

function TypeChips({ label, value, onChange }: { label: string; value: AssetType; onChange: (v: AssetType) => void }) {
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <View style={s.chips}>
        {ASSET_TYPES.map((t) => <FilterChip key={t} label={t} active={value === t} onPress={() => onChange(t)} />)}
      </View>
    </View>
  );
}

type PickerDriver = { id: string; first_name: string; last_name: string; phone_primary?: string | null };

function DriverPicker({ visible, drivers, loading, selectedId, onPick, onClose }: {
  visible: boolean; drivers: PickerDriver[]; loading: boolean; selectedId: string | null; onPick: (id: string | null) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? drivers.filter((d) => `${d.first_name} ${d.last_name} ${d.phone_primary ?? ''}`.toLowerCase().includes(q)) : drivers;
  }, [drivers, query]);

  const row = (id: string | null, title: string, sub?: string | null) => (
    <TouchableOpacity key={id ?? 'none'} style={s.pick} activeOpacity={0.7} onPress={() => onPick(id)} accessibilityRole="button" accessibilityState={{ selected: selectedId === id }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.pickTitle} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={s.pickSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {selectedId === id ? <Check size={18} color={Colors.primary} strokeWidth={2.4} /> : null}
    </TouchableOpacity>
  );

  return (
    <AppModal visible={visible} onClose={onClose} type="bottom-sheet" title="Assigned driver">
      <View style={{ gap: 10, paddingBottom: 8 }}>
        <ListSearch value={query} onChangeText={setQuery} placeholder="Search name or phone" />
        <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
          {row(null, 'No driver')}
          {loading ? <ActivityIndicator color={Colors.primary} style={{ marginVertical: 16 }} /> : shown.map((d) => row(d.id, niceName(`${d.first_name} ${d.last_name}`.trim()), d.phone_primary))}
        </ScrollView>
      </View>
    </AppModal>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F1F1F3' },
  pickTitle: { fontSize: 15, fontWeight: '600', color: '#3E3C3D' },
  pickSub: { fontSize: 13, color: '#6B6B76', marginTop: 1 },
});
