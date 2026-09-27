/** Small building blocks shared by the create-trip steps. */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, FlatList, Image, type KeyboardTypeOptions } from 'react-native';
import { Check, ChevronDown, Search, X, type LucideIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { SkeletonBlock } from '@mercon/mobile-shared/ui';
import { Colors, Spacing, Radius, Typography } from '@mercon/mobile-shared/theme/tokens';
import { AppModal } from '@mercon/mobile-shared/components/common/AppModal';
import { resolveMediaUrl } from '@mercon/mobile-shared/lib/media';

/** A light tap on selections. Silently skipped where haptics aren't available. */
export function tap() {
  Haptics.selectionAsync().catch(() => {});
}

/** Icon-tile colours; each section's colour says what it is about. */
const TONES = {
  blue: { bg: '#E6F1FB', fg: '#185FA5' },
  green: { bg: '#EAF3DE', fg: '#3B6D11' },
  coral: { bg: '#FAECE7', fg: '#993C1D' },
  violet: { bg: '#EEEDFE', fg: '#534AB7' },
  amber: { bg: '#FAEEDA', fg: '#854F0B' },
  gray: { bg: '#F1EFE8', fg: '#5F5E5A' },
} as const;
export type SectionTone = keyof typeof TONES;

/** A white card with a coloured icon tile and a title; `action` sits on the right of the title. */
export function Section({
  icon: Icon,
  tone,
  title,
  badge,
  action,
  highlight,
  children,
  style,
}: {
  icon: LucideIcon;
  tone: SectionTone;
  title: string;
  badge?: React.ReactNode;
  action?: { label: string; onPress: () => void };
  highlight?: 'success' | 'warning';
  children?: React.ReactNode;
  style?: any;
}) {
  const t = TONES[tone];
  return (
    <View style={[ui.section, highlight === 'success' && ui.sectionSuccess, highlight === 'warning' && ui.sectionWarning, style]}>
      <View style={ui.sectionHead}>
        <View style={[ui.iconTile, { backgroundColor: t.bg }]}>
          <Icon size={15} color={t.fg} strokeWidth={2.2} />
        </View>
        <Text style={ui.sectionTitle}>{title}</Text>
        {badge}
        {action ? (
          <TouchableOpacity onPress={action.onPress} hitSlop={10} style={{ marginLeft: 'auto' }}>
            <Text style={ui.sectionAction}>{action.label}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** A large tappable value with a small caption above it (dates and times). */
export function ValueTile({ caption, value, placeholder, onPress, error, style }: { caption: string; value?: string; placeholder?: string; onPress: () => void; error?: boolean; style?: any }) {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={[ui.tile, error && ui.fieldError, style]}>
      <Text style={ui.tileCaption}>{caption}</Text>
      <Text style={[ui.tileValue, !value && ui.placeholder]} numberOfLines={1}>
        {value || placeholder}
      </Text>
    </TouchableOpacity>
  );
}

/** Grey placeholder rows while a list loads. */
export function SkeletonRows({ rows = 3, height = 52 }: { rows?: number; height?: number }) {
  return (
    <View style={{ gap: 8 }}>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonBlock key={i} height={height} radius={12} />
      ))}
    </View>
  );
}

export function Label({ children, style }: { children: React.ReactNode; style?: any }) {
  return <Text style={[ui.label, style]}>{children}</Text>;
}

export function Card({ children, style, tone }: { children: React.ReactNode; style?: any; tone?: 'success' | 'warning' | 'accent' }) {
  const toneStyle = tone === 'success' ? ui.cardSuccess : tone === 'warning' ? ui.cardWarning : tone === 'accent' ? ui.cardAccent : null;
  return <View style={[ui.card, toneStyle, style]}>{children}</View>;
}

/** A tappable field showing the current value; opens a picker. */
export function FieldButton({
  icon,
  value,
  placeholder,
  onPress,
  right,
  error,
  style,
}: {
  icon?: React.ReactNode;
  value?: string | null;
  placeholder: string;
  onPress: () => void;
  right?: React.ReactNode;
  error?: boolean;
  style?: any;
}) {
  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress} style={[ui.field, error && ui.fieldError, style]}>
      {icon}
      <Text style={[ui.fieldText, !value && ui.placeholder]} numberOfLines={1}>
        {value || placeholder}
      </Text>
      {right ?? <ChevronDown size={16} color={Colors.gray400} />}
    </TouchableOpacity>
  );
}

export function TextField({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  prefix,
  error,
  style,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  prefix?: string;
  error?: boolean;
  style?: any;
}) {
  return (
    <View style={[ui.field, error && ui.fieldError, style]}>
      {prefix ? <Text style={ui.prefix}>{prefix}</Text> : null}
      <TextInput
        style={ui.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.gray400}
        keyboardType={keyboardType}
      />
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: any;
}) {
  return (
    <View style={[ui.segment, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            style={[ui.segmentItem, on && ui.segmentItemOn]}
            onPress={() => {
              if (!on) tap();
              onChange(o.value);
            }}
            activeOpacity={0.8}
          >
            <Text style={[ui.segmentText, on && ui.segmentTextOn]} numberOfLines={1}>
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function LinkButton({ label, onPress, color = Colors.primary }: { label: string; onPress: () => void; color?: string }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={8} style={ui.link}>
      <Text style={[ui.linkText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Chip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'accent' }) {
  const s = tone === 'success' ? ui.chipSuccess : tone === 'warning' ? ui.chipWarning : tone === 'accent' ? ui.chipAccent : ui.chipNeutral;
  const t = tone === 'success' ? ui.chipSuccessText : tone === 'warning' ? ui.chipWarningText : tone === 'accent' ? ui.chipAccentText : ui.chipNeutralText;
  return (
    <View style={[ui.chip, s]}>
      <Text style={[ui.chipText, t]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  if (!children) return null;
  return <Text style={ui.errorText}>{children}</Text>;
}

export interface PickerOption {
  value: string;
  label: string;
  sub?: string;
  badge?: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'accent' };
  group?: string;
  leading?: React.ReactNode;
  disabled?: boolean;
}

/**
 * Bottom-sheet list with search. `onCreate` adds a "Use “typed text”" row for
 * free-text values (e.g. a new place).
 */
export function PickerSheet({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
  searchPlaceholder = 'Search',
  onCreate,
  createLabel = 'Add',
  emptyText = 'Nothing found',
}: {
  visible: boolean;
  title: string;
  options: PickerOption[];
  value?: string | null;
  onSelect: (value: string, option: PickerOption) => void;
  onClose: () => void;
  searchPlaceholder?: string;
  onCreate?: (text: string) => void;
  createLabel?: string;
  emptyText?: string;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => `${o.label} ${o.sub ?? ''} ${o.group ?? ''}`.toLowerCase().includes(q));
  }, [options, query]);

  const close = () => {
    setQuery('');
    onClose();
  };

  const rows = useMemo(() => {
    const out: ({ type: 'group'; label: string } | { type: 'option'; option: PickerOption })[] = [];
    let lastGroup: string | undefined;
    filtered.forEach((o) => {
      if (o.group && o.group !== lastGroup) {
        out.push({ type: 'group', label: o.group });
        lastGroup = o.group;
      }
      out.push({ type: 'option', option: o });
    });
    return out;
  }, [filtered]);

  const typed = query.trim();
  const exact = options.some((o) => o.label.toLowerCase() === typed.toLowerCase());

  return (
    <AppModal visible={visible} onClose={close} type="bottom-sheet" title={title} maxHeight="85%">
      <View style={ui.searchBar}>
        <Search size={16} color={Colors.gray500} />
        <TextInput
          style={ui.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={searchPlaceholder}
          placeholderTextColor={Colors.gray400}
          autoCorrect={false}
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
            <X size={16} color={Colors.gray500} />
          </TouchableOpacity>
        ) : null}
      </View>
      {onCreate && typed && !exact ? (
        <TouchableOpacity
          style={ui.createRow}
          onPress={() => {
            onCreate(typed);
            close();
          }}
        >
          <Text style={ui.createText} numberOfLines={1}>
            {createLabel} “{typed}”
          </Text>
        </TouchableOpacity>
      ) : null}
      <FlatList
        data={rows}
        keyExtractor={(r, i) => (r.type === 'group' ? `g-${r.label}-${i}` : r.option.value)}
        keyboardShouldPersistTaps="handled"
        style={{ maxHeight: 440 }}
        ListEmptyComponent={<Text style={ui.empty}>{emptyText}</Text>}
        renderItem={({ item }) => {
          if (item.type === 'group') return <Text style={ui.groupLabel}>{item.label}</Text>;
          const o = item.option;
          const on = o.value === value;
          return (
            <TouchableOpacity
              style={[ui.option, on && ui.optionOn, o.disabled && { opacity: 0.45 }]}
              disabled={o.disabled}
              onPress={() => {
                tap();
                onSelect(o.value, o);
                close();
              }}
            >
              {o.leading}
              <View style={{ flex: 1 }}>
                <Text style={[ui.optionLabel, on && { color: Colors.primaryDark }]} numberOfLines={1}>
                  {o.label}
                </Text>
                {o.sub ? (
                  <Text style={ui.optionSub} numberOfLines={1}>
                    {o.sub}
                  </Text>
                ) : null}
              </View>
              {o.badge ? <Chip label={o.badge.label} tone={o.badge.tone} /> : null}
              {on ? <Check size={16} color={Colors.primary} strokeWidth={2.5} /> : null}
            </TouchableOpacity>
          );
        }}
      />
    </AppModal>
  );
}

/**
 * Names typed all-lowercase ("riyadh → hail") or ALL-CAPS ("IMILE DELIVERY")
 * shown in normal case. Mixed-case names are left as they were written.
 */
export function niceName(s?: string | null): string {
  const v = (s || '').trim();
  if (!v || (v !== v.toLowerCase() && v !== v.toUpperCase())) return v;
  return v.toLowerCase().replace(/(^|[\s\-/(→'’])([a-zÀ-ɏ])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function initialsOf(name?: string | null): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** First and last name only ("Kashif Ali Muhammed Aslam" → "Kashif Aslam"). */
export function shortName(name?: string | null): string {
  const parts = niceName(name).split(/\s+/).filter(Boolean);
  return parts.length > 2 ? `${parts[0]} ${parts[parts.length - 1]}` : parts.join(' ');
}

/** A customer's logo, or their initials when there's no logo (or it fails to load). */
export function CompanyAvatar({ name, url, size = 28 }: { name?: string | null; url?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const uri = !failed ? resolveMediaUrl(url) : null;
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return <Image source={{ uri }} style={[box, ui.companyImg]} resizeMode="cover" onError={() => setFailed(true)} />;
  }
  return (
    <View style={[box, ui.companyFallback]}>
      <Text style={[ui.companyInitials, { fontSize: Math.max(10, size * 0.36) }]}>{initialsOf(name)}</Text>
    </View>
  );
}

export const fmtSar = (n: number) => (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** "2026-09-27" → "Sat 27 Sep" */
export function fmtDay(dateStr?: string | null): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** DD/MM/YYYY (date picker) ⇄ YYYY-MM-DD (form). */
export const toPickerDate = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');
export const fromPickerDate = (ddmmyyyy: string) => (ddmmyyyy ? ddmmyyyy.split('/').reverse().join('-') : '');

export const ui = StyleSheet.create({
  companyImg: { borderWidth: 1, borderColor: Colors.gray200, backgroundColor: Colors.white },
  companyFallback: { backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  companyInitials: { color: Colors.primaryDark, fontWeight: '700' },
  label: { fontSize: Typography.subcaption, fontWeight: '600', color: Colors.gray500, marginTop: Spacing.md, marginBottom: 6 },
  card: { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.gray200, padding: Spacing.md },
  cardSuccess: { backgroundColor: Colors.successLight, borderColor: Colors.successBorder },
  cardWarning: { backgroundColor: Colors.warningLight, borderColor: '#FDE68A' },
  cardAccent: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  section: { backgroundColor: Colors.white, borderRadius: 16, padding: Spacing.md, borderWidth: 1, borderColor: 'transparent' },
  sectionSuccess: { backgroundColor: '#F7FBF1', borderColor: '#C0DD97' },
  sectionWarning: { backgroundColor: '#FFFBF2', borderColor: '#FAC775' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.sm },
  iconTile: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.charcoal },
  sectionAction: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  tile: { backgroundColor: Colors.gray100, borderRadius: 12, paddingHorizontal: Spacing.md, paddingVertical: 9, borderWidth: 1, borderColor: 'transparent' },
  tileCaption: { fontSize: 11, color: Colors.gray500, fontWeight: '500' },
  tileValue: { fontSize: 17, fontWeight: '700', color: Colors.charcoal, marginTop: 2 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 46,
    paddingHorizontal: Spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: Colors.gray100,
  },
  fieldError: { borderColor: Colors.danger },
  fieldText: { flex: 1, fontSize: 14, color: Colors.charcoal, fontWeight: '500' },
  placeholder: { color: Colors.gray400, fontWeight: '400' },
  prefix: { fontSize: 13, color: Colors.gray500, fontWeight: '600' },
  input: { flex: 1, fontSize: 14, color: Colors.charcoal, paddingVertical: 10 },
  segment: { flexDirection: 'row', borderRadius: 12, padding: 3, backgroundColor: Colors.white },
  segmentItem: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
  segmentItemOn: { backgroundColor: Colors.charcoal },
  segmentText: { fontSize: 13, color: Colors.gray600, fontWeight: '500' },
  segmentTextOn: { color: Colors.white, fontWeight: '700' },
  link: { paddingVertical: 6, alignSelf: 'flex-start' },
  linkText: { fontSize: 13, fontWeight: '600' },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  chipText: { fontSize: 11, fontWeight: '600' },
  chipNeutral: { backgroundColor: Colors.gray100 },
  chipNeutralText: { color: Colors.gray600 },
  chipSuccess: { backgroundColor: Colors.successLight },
  chipSuccessText: { color: Colors.success },
  chipWarning: { backgroundColor: Colors.warningLight },
  chipWarningText: { color: Colors.warning },
  chipAccent: { backgroundColor: Colors.primaryLight },
  chipAccentText: { color: Colors.primaryDark },
  errorText: { fontSize: 12, color: Colors.danger, marginTop: 4 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray100,
    marginBottom: Spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.charcoal, paddingVertical: 10 },
  createRow: { paddingVertical: 12, paddingHorizontal: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  createText: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  groupLabel: { fontSize: 11, fontWeight: '700', color: Colors.gray500, paddingTop: Spacing.md, paddingBottom: 4, paddingHorizontal: Spacing.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: Spacing.sm, borderRadius: Radius.sm },
  optionOn: { backgroundColor: Colors.primaryLight },
  optionLabel: { fontSize: 14, color: Colors.charcoal, fontWeight: '500' },
  optionSub: { fontSize: 12, color: Colors.gray500, marginTop: 1 },
  empty: { textAlign: 'center', color: Colors.gray500, paddingVertical: Spacing.xl, fontSize: 13 },
});
