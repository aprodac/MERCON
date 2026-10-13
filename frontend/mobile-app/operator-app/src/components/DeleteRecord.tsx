/**
 * The "Delete …" block at the bottom of an edit page — one behaviour for every
 * record: a red button, a confirmation that says what happens, an optional
 * password step (drivers, as on the web), the server's own reason when it
 * refuses (a truck still on a trip, a quotation with trips), then every list
 * refreshed and the user taken back to the list the record was in.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react-native';
import { Colors } from '@mercon/mobile-shared/theme/tokens';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { getApiErrorMessage } from '@mercon/mobile-shared/lib/api';

export interface DeleteRecordProps {
  /** Button text, e.g. "Delete driver". */
  label: string;
  /** What is being deleted, for the question ("Delete Naseebullah?"). */
  name: string;
  /** What happens, in one or two short sentences. */
  consequence: string;
  /** Ask for the user's password before deleting. */
  needsPassword?: boolean;
  run: (password?: string) => Promise<unknown>;
  /** The list to land on afterwards. */
  backTo: Href;
  /** Old non-React-Query caches to reset (invalidateOperatorDrivers, …). */
  onDeleted?: () => void;
}

export function DeleteRecord({ label, name, consequence, needsPassword, run, backTo, onDeleted }: DeleteRecordProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const go = async (pw?: string) => {
    setBusy(true);
    setError(null);
    try {
      await run(pw);
      onDeleted?.();
      await queryClient.invalidateQueries();
      setAsking(false);
      router.dismissTo(backTo);
    } catch (e) {
      const msg = getApiErrorMessage(e);
      if (asking) setError(msg);
      else Alert.alert('Could not delete', msg);
    } finally {
      setBusy(false);
    }
  };

  const start = () => {
    if (needsPassword) {
      setPassword('');
      setError(null);
      setAsking(true);
      return;
    }
    Alert.alert(`Delete ${name}?`, consequence, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => go() },
    ]);
  };

  return (
    <View style={s.wrap}>
      <TouchableOpacity style={s.btn} onPress={start} disabled={busy} activeOpacity={0.8} accessibilityRole="button">
        {busy && !asking ? <ActivityIndicator color="#B42318" /> : (
          <>
            <Trash2 size={17} color="#B42318" strokeWidth={2.3} />
            <Text style={s.btnText}>{label}</Text>
          </>
        )}
      </TouchableOpacity>

      <AppModal visible={asking} onClose={() => !busy && setAsking(false)} type="bottom-sheet" title={`Delete ${name}?`}>
        <View style={{ gap: 12 }}>
          <Text style={s.body}>{consequence}</Text>
          <Text style={s.label}>Your password, to confirm</Text>
          <TextInput
            style={[s.input, error && { borderColor: '#D92D20' }]}
            value={password}
            onChangeText={(v) => { setPassword(v); setError(null); }}
            secureTextEntry
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Password"
            placeholderTextColor="#9898A4"
            returnKeyType="done"
            onSubmitEditing={() => password && go(password)}
          />
          {error ? <Text style={s.error}>{error}</Text> : null}
          <TouchableOpacity
            style={[s.confirm, (!password || busy) && { opacity: 0.5 }]}
            disabled={!password || busy}
            onPress={() => go(password)}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator color={Colors.white} /> : <Text style={s.confirmText}>{label}</Text>}
          </TouchableOpacity>
        </View>
      </AppModal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 8 },
  btn: { height: 50, borderRadius: 14, borderWidth: 1, borderColor: '#FECDCA', backgroundColor: '#FEF3F2', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnText: { fontSize: 15, fontWeight: '700', color: '#B42318' },
  body: { fontSize: 14, color: '#52525B', lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#3E3C3D' },
  input: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#E4E4E7', paddingHorizontal: 14, fontSize: 16, color: '#3E3C3D', backgroundColor: Colors.white },
  error: { fontSize: 13, color: '#B42318' },
  confirm: { height: 50, borderRadius: 14, backgroundColor: '#D92D20', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  confirmText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: 8, paddingVertical: 4 },
  linkText: { fontSize: 13, fontWeight: '700', color: '#B42318' },
});

/** A small "Delete" link for a card in a list (expenses, maintenance): confirm, delete, refresh. */
export function DeleteLink({ what, consequence, run, onDeleted }: { what: string; consequence: string; run: () => Promise<unknown>; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const ask = () =>
    Alert.alert(`Delete ${what}?`, consequence, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await run();
            onDeleted();
          } catch (e) {
            Alert.alert('Could not delete', getApiErrorMessage(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  return (
    <TouchableOpacity onPress={ask} disabled={busy} hitSlop={8} style={s.link} accessibilityRole="button" accessibilityLabel={`Delete ${what}`}>
      {busy ? <ActivityIndicator size="small" color="#B42318" /> : <Trash2 size={14} color="#B42318" strokeWidth={2.3} />}
      <Text style={s.linkText}>Delete</Text>
    </TouchableOpacity>
  );
}
