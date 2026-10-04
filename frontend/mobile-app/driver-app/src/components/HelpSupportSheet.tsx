/**
 * Help & Support (Profile menu). Only contacts the app really has: the
 * operator from GET /mobile/emergency/contact (the same person the Emergency
 * screen's "Call operator" dials) and the support mailbox. No made-up numbers.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Linking, ActivityIndicator } from 'react-native';
import { Phone, Mail, MessageCircle, X, Siren } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';
import { SUPPORT_EMAIL, phoneDigits } from '@mercon/mobile-shared/lib/support';
import { emergencyService, type EmergencyContact } from '../services/emergency';
import { showToast } from './AppToast';

export function HelpSupportSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const { t } = useLanguage();
  // undefined = loading, null = nobody with a phone on file.
  const [contact, setContact] = useState<EmergencyContact | null | undefined>(undefined);

  // Fetched each time the sheet opens; the last answer shows until the new one arrives.
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    emergencyService
      .getContact()
      .then((c) => { if (alive) setContact(c); })
      .catch(() => { if (alive) setContact(null); });
    return () => { alive = false; };
  }, [visible]);

  const open = (url: string, fallback?: string) => {
    Linking.openURL(url).catch(() => {
      if (fallback) Linking.openURL(fallback).catch(() => showToast(t('msg_could_not_open_app', 'Could not open the app on this phone.'), 'error'));
      else showToast(t('msg_could_not_open_app', 'Could not open the app on this phone.'), 'error');
    });
  };

  const digits = contact ? phoneDigits(contact.phone) : '';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <View style={s.sheet} onStartShouldSetResponder={() => true}>
          <View style={s.header}>
            <Text style={s.title}>{t('nav_help_support', 'Help & Support')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel={t('action_close', 'Close')}>
              <X size={22} color="#71717A" />
            </TouchableOpacity>
          </View>

          <Text style={s.section}>{t('title_your_operator', 'Your operator')}</Text>
          {contact === undefined ? (
            <View style={s.row}><ActivityIndicator color="#FA634E" /></View>
          ) : contact === null ? (
            <Text style={s.muted}>{t('msg_no_operator_number_short', 'No operator phone on file')}</Text>
          ) : (
            <>
              <Text style={s.contactName}>{contact.name || t('label_operator', 'Operator')}</Text>
              <Text style={s.contactPhone} selectable>{contact.phone}</Text>
              <View style={s.buttons}>
                <TouchableOpacity style={s.btn} activeOpacity={0.8} onPress={() => open(`tel:${digits ? `+${digits}` : contact.phone}`)}>
                  <Phone size={18} color="#FFFFFF" />
                  <Text style={s.btnText}>{t('action_call', 'Call')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.btn, s.btnWhatsApp]}
                  activeOpacity={0.8}
                  onPress={() => open(`whatsapp://send?phone=${digits}`, `https://wa.me/${digits}`)}
                >
                  <MessageCircle size={18} color="#FFFFFF" />
                  <Text style={s.btnText}>WhatsApp</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <Text style={s.section}>{t('title_email_support', 'Email MERCON support')}</Text>
          <TouchableOpacity style={s.linkRow} activeOpacity={0.7} onPress={() => open(`mailto:${SUPPORT_EMAIL}`)}>
            <Mail size={18} color="#FA634E" />
            <Text style={s.link} selectable>{SUPPORT_EMAIL}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.linkRow, s.emergencyRow]}
            activeOpacity={0.7}
            onPress={() => { onClose(); router.push('/trip/emergency'); }}
          >
            <Siren size={18} color="#DC2626" />
            <Text style={[s.link, { color: '#DC2626' }]}>{t('action_open_emergency', 'Emergency — report an incident')}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontSize: 20, fontWeight: '800', color: '#18181B', flexShrink: 1 },
  section: { fontSize: 13, fontWeight: '700', color: '#71717A', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12 },
  row: { paddingVertical: 8, alignItems: 'flex-start' },
  muted: { fontSize: 15, color: '#71717A' },
  contactName: { fontSize: 17, fontWeight: '700', color: '#18181B' },
  contactPhone: { fontSize: 16, color: '#3E3C3D', writingDirection: 'ltr' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FA634E', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 18, flexGrow: 1, justifyContent: 'center' },
  btnWhatsApp: { backgroundColor: '#16A34A' },
  btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  link: { fontSize: 16, fontWeight: '600', color: '#FA634E', flexShrink: 1 },
  emergencyRow: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#F4F4F5', paddingTop: 16 },
});
