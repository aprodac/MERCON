/**
 * Small form kit for the account screens (User management, Add/Edit user,
 * Add/Edit driver): header, titled section cards, labelled fields with inline
 * errors, a password field with show/hide + generate, choice cards, a switch
 * row and a save bar pinned above the keyboard.
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Switch, StyleSheet, ActivityIndicator,
  type TextInputProps,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, Copy, Eye, EyeOff, Sparkles, type LucideIcon } from 'lucide-react-native';
import { Colors, Radius, Spacing, Typography } from '@mercon/mobile-shared/theme/tokens';

export function FormHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backBtn} activeOpacity={0.8} onPress={onBack}>
        <ArrowLeft size={20} color={Colors.gray900} strokeWidth={2.2} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.headerSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

export function Section({ title, Icon, note, children }: { title: string; Icon: LucideIcon; note?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionIcon}><Icon size={15} color={Colors.gray700} strokeWidth={2.2} /></View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {note ? <Text style={styles.sectionNote}>{note}</Text> : null}
      <View style={{ gap: Spacing.md }}>{children}</View>
    </View>
  );
}

interface FieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  prefix?: string;
  right?: React.ReactNode;
  /** Renders as a tappable box (e.g. opens a date picker) instead of a text input. */
  onPressBox?: () => void;
}

export function Field({ label, required, hint, error, prefix, right, onPressBox, ...input }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const border = error ? Colors.error : focused ? Colors.gray900 : Colors.gray200;
  return (
    <View>
      <Text style={styles.label}>
        {label}{required ? <Text style={{ color: Colors.error }}> *</Text> : null}
      </Text>
      <TouchableOpacity activeOpacity={onPressBox ? 0.7 : 1} disabled={!onPressBox} onPress={onPressBox}>
        <View style={[styles.inputBox, { borderColor: border }]} pointerEvents={onPressBox ? 'none' : 'auto'}>
          {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
          <TextInput
            {...input}
            editable={!onPressBox && input.editable !== false}
            placeholderTextColor={Colors.gray400}
            style={styles.input}
            onFocus={(e) => { setFocused(true); input.onFocus?.(e); }}
            onBlur={(e) => { setFocused(false); input.onBlur?.(e); }}
          />
          {right}
        </View>
      </TouchableOpacity>
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Readable random password (no look-alike characters) an admin can read out or paste. */
export function generatePassword(length = 10): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function PasswordField({
  label, value, onChangeText, error, hint, required, placeholder,
}: { label: string; value: string; onChangeText: (v: string) => void; error?: string; hint?: string; required?: boolean; placeholder?: string }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = () => {
    onChangeText(generatePassword());
    setVisible(true);
    setCopied(false);
  };
  const copy = async () => {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    setCopied(true);
  };

  return (
    <View style={{ gap: Spacing.xs }}>
      <Field
        label={label}
        required={required}
        value={value}
        onChangeText={(v) => { onChangeText(v); setCopied(false); }}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={placeholder}
        error={error}
        hint={hint}
        right={
          <TouchableOpacity onPress={() => setVisible((v) => !v)} hitSlop={10} style={{ paddingLeft: 8 }}>
            {visible ? <EyeOff size={18} color={Colors.gray500} /> : <Eye size={18} color={Colors.gray500} />}
          </TouchableOpacity>
        }
      />
      <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
        <TouchableOpacity style={styles.smallBtn} activeOpacity={0.75} onPress={generate}>
          <Sparkles size={14} color={Colors.gray800} />
          <Text style={styles.smallBtnText}>Generate</Text>
        </TouchableOpacity>
        {value ? (
          <TouchableOpacity style={styles.smallBtn} activeOpacity={0.75} onPress={copy}>
            {copied ? <Check size={14} color={Colors.success} /> : <Copy size={14} color={Colors.gray800} />}
            <Text style={[styles.smallBtnText, copied && { color: Colors.success }]}>{copied ? 'Copied' : 'Copy'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export function ChoiceCards<T extends string>({
  options, value, onChange,
}: { options: { value: T; title: string; description: string; Icon: LucideIcon }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={{ gap: Spacing.sm }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            activeOpacity={0.8}
            onPress={() => onChange(o.value)}
            style={[styles.choice, active && styles.choiceActive]}
          >
            <View style={[styles.choiceIcon, active && { backgroundColor: Colors.gray900 }]}>
              <o.Icon size={16} color={active ? Colors.white : Colors.gray700} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.choiceTitle}>{o.title}</Text>
              <Text style={styles.choiceDesc}>{o.description}</Text>
            </View>
            <View style={[styles.radio, active && styles.radioActive]}>
              {active ? <View style={styles.radioDot} /> : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function SwitchRow({ title, description, value, onChange }: { title: string; description: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.choiceDesc}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: Colors.gray300, true: Colors.success }}
        thumbColor={Colors.white}
      />
    </View>
  );
}

export function SaveBar({ label, onPress, saving, disabled }: { label: string; onPress: () => void; saving: boolean; disabled?: boolean }) {
  const insets = useSafeAreaInsets();
  const off = saving || disabled;
  return (
    <View style={[styles.saveBar, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
      <TouchableOpacity style={[styles.saveBtn, off && { opacity: 0.5 }]} activeOpacity={0.85} disabled={off} onPress={onPress}>
        {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.saveText}>{label}</Text>}
      </TouchableOpacity>
    </View>
  );
}

export function DangerButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.danger} activeOpacity={0.8} onPress={onPress}>
      <Text style={styles.dangerText}>{label}</Text>
    </TouchableOpacity>
  );
}

export const formStyles = StyleSheet.create({
  scroll: { padding: Spacing.lg, paddingBottom: Spacing['3xl'], gap: Spacing.md },
  row: { flexDirection: 'row', gap: Spacing.md },
  errorText: { fontSize: Typography.sm, color: Colors.error, textAlign: 'center', marginTop: Spacing.xl },
});

const styles = StyleSheet.create({
  header: {
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: Typography.lg, fontWeight: '800', color: Colors.gray900 },
  headerSub: { fontSize: Typography.xs, color: Colors.gray500 },
  section: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: Typography.base, fontWeight: '700', color: Colors.gray900 },
  sectionNote: { fontSize: 12, color: Colors.gray500, marginTop: -6 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.gray700, marginBottom: 6 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    paddingHorizontal: 12,
    minHeight: 46,
  },
  prefix: { fontSize: Typography.base, color: Colors.gray500, marginRight: 6 },
  input: { flex: 1, fontSize: Typography.base, color: Colors.gray900, paddingVertical: 10 },
  error: { fontSize: 12, color: Colors.error, marginTop: 4 },
  hint: { fontSize: 12, color: Colors.gray500, marginTop: 4 },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.gray50,
  },
  smallBtnText: { fontSize: 12, fontWeight: '600', color: Colors.gray800 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  choiceActive: { borderColor: Colors.gray900, backgroundColor: Colors.gray50 },
  choiceIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceTitle: { fontSize: Typography.sm, fontWeight: '700', color: Colors.gray900 },
  choiceDesc: { fontSize: 12, color: Colors.gray500, marginTop: 1 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.gray300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: Colors.gray900 },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.gray900 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  saveBar: {
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  saveBtn: {
    height: 50,
    borderRadius: Radius.lg,
    backgroundColor: Colors.gray900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { color: Colors.white, fontSize: Typography.base, fontWeight: '700' },
  danger: {
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: Colors.dangerLight,
    borderRadius: Radius.lg,
    paddingVertical: 13,
    alignItems: 'center',
  },
  dangerText: { color: Colors.danger, fontWeight: '700', fontSize: Typography.sm },
});
