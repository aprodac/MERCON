import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, StatusBar, FlatList, Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, Star, Truck, Package, Smartphone, Ban, type LucideIcon } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '@mercon/mobile-shared/theme/tokens';
import { Button } from '@mercon/mobile-shared/components/Button';
import { Avatar } from '@mercon/mobile-shared/components/Avatar';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';

const WAIT_TIPS: { Icon: LucideIcon; key: string; defaultText: string }[] = [
  { Icon: Truck, key: 'tip_stay_with_vehicle', defaultText: 'Stay with the vehicle at all times' },
  { Icon: Package, key: 'tip_cargo_secured', defaultText: 'Ensure cargo is secured and sealed' },
  { Icon: Smartphone, key: 'tip_phone_charged', defaultText: 'Keep your phone charged and reachable' },
  { Icon: Ban, key: 'tip_no_unauthorized', defaultText: 'Do not allow unauthorized access to cargo' },
];

const ReplacementDriverScreen = ({ navigation }: any) => {
  const { t } = useLanguage();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.gray100 }}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Success Icon */}
        <View style={styles.successSection}>
          <View style={styles.successCircle}>
            <Check size={40} color={Colors.white} strokeWidth={3} />
          </View>
          <Text style={styles.successTitle}>{t('title_replacement_requested', 'Replacement Requested')}</Text>
          <Text style={styles.successSub}>
            {t('msg_replacement_arranging', 'Your operator has been notified and is arranging a replacement driver.')}
          </Text>
        </View>

        {/* Operator Message */}
        <View style={styles.messageCard}>
          <View style={styles.messageHeader}>
            <View style={styles.operatorAvatar}>
              <Text style={styles.operatorAvatarText}>OP</Text>
            </View>
            <View>
              <Text style={styles.operatorName}>Mohammed Al-Otaibi</Text>
              <Text style={styles.operatorRole}>{t('label_fleet_operator', 'Fleet Operator')}</Text>
            </View>
            <Text style={styles.messageTime}>{t('label_time_2min_ago', '2 min ago')}</Text>
          </View>
          <View style={styles.messageBubble}>
            <Text style={styles.messageText}>
              We've received your emergency report. A replacement driver is being assigned from our Riyadh depot.
              Please stay with the vehicle and ensure cargo is secured. ETA for replacement: 45 minutes.
            </Text>
          </View>
        </View>

        {/* Replacement Driver Card */}
        <Text style={styles.sectionTitle}>{t('title_replacement_driver', 'Replacement Driver')}</Text>
        <View style={styles.driverCard}>
          <Avatar initials="KA" size={56} />
          <View style={styles.driverInfo}>
            <Text style={styles.driverName}>Khalid Al-Zahrani</Text>
            <Text style={[styles.driverId, { writingDirection: 'ltr' }]}>DRV-2024-0147</Text>
            <View style={styles.ratingRow}>
              <Star size={14} color="#F5A623" strokeWidth={2} fill="#F5A623" />
              <Text style={styles.rating}>4.9</Text>
              <Text style={styles.ratingCount}>{t('label_rating_trips', '(312 trips)')}</Text>
            </View>
          </View>
          <View style={styles.driverStatus}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>{t('status_in_transit', 'In Transit')}</Text>
            <Text style={[styles.etaText, { writingDirection: 'ltr' }]}>{t('label_eta_approx_45', '~45 min')}</Text>
          </View>
        </View>

        {/* Trip Handoff Details */}
        <View style={styles.handoffCard}>
          <Text style={styles.handoffTitle}>{t('title_handoff_details', 'Handoff Details')}</Text>
          <View style={styles.handoffRow}>
            <Text style={styles.handoffLabel}>{t('label_trip_id', 'Trip ID')}</Text>
            <Text style={[styles.handoffValue, { writingDirection: 'ltr' }]}>#TRP-2024-0891</Text>
          </View>
          <View style={styles.handoffRow}>
            <Text style={styles.handoffLabel}>{t('label_cargo_type', 'Cargo')}</Text>
            <Text style={styles.handoffValue}>Electronics (2.4T)</Text>
          </View>
          <View style={styles.handoffRow}>
            <Text style={styles.handoffLabel}>{t('label_destination', 'Destination')}</Text>
            <Text style={styles.handoffValue}>Jeddah Port, Gate 7</Text>
          </View>
          <View style={styles.handoffRow}>
            <Text style={styles.handoffLabel}>{t('label_location', 'Location')}</Text>
            <Text style={styles.handoffValue}>Taif Road, KM 340</Text>
          </View>
        </View>

        {/* Instructions */}
        <View style={styles.instructionCard}>
          <Text style={styles.instructionTitle}>{t('title_while_you_wait', 'While You Wait')}</Text>
          {WAIT_TIPS.map((tip, i) => (
            <View key={i} style={styles.instructionRow}>
              <tip.Icon size={16} color={Colors.gray600} strokeWidth={2} />
              <Text style={styles.instructionItem}>{t(tip.key, tip.defaultText)}</Text>
            </View>
          ))}
        </View>

        <Button
          title={t('action_return_home', 'Return Home')}
          onPress={() => navigation?.navigate('Home')}
          variant="outline"
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing['3xl'],
    gap: Spacing.lg,
  },
  successSection: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    ...Shadows.md,
  },
  successTitle: {
    fontSize: Typography['2xl'],
    fontWeight: '800',
    color: Colors.gray900,
    marginBottom: Spacing.sm,
  },
  successSub: {
    fontSize: Typography.sm,
    color: Colors.gray500,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
  messageCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    ...Shadows.sm,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  operatorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  operatorAvatarText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: Typography.sm,
  },
  operatorName: {
    fontSize: Typography.sm,
    fontWeight: '700',
    color: Colors.gray900,
  },
  operatorRole: {
    fontSize: Typography.xs,
    color: Colors.gray500,
  },
  messageTime: {
    fontSize: Typography.xs,
    color: Colors.gray400,
    marginLeft: 'auto',
  },
  messageBubble: {
    backgroundColor: Colors.gray100,
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  messageText: {
    fontSize: Typography.sm,
    color: Colors.gray700,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: Typography.base,
    fontWeight: '700',
    color: Colors.gray900,
  },
  driverCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    ...Shadows.sm,
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: Typography.base,
    fontWeight: '700',
    color: Colors.gray900,
  },
  driverId: {
    fontSize: Typography.xs,
    color: Colors.gray500,
    marginBottom: Spacing.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  rating: {
    fontSize: Typography.sm,
    fontWeight: '700',
    color: Colors.gray900,
  },
  ratingCount: {
    fontSize: Typography.xs,
    color: Colors.gray500,
  },
  driverStatus: {
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
    marginBottom: 2,
  },
  statusText: {
    fontSize: Typography.xs,
    color: Colors.primary,
    fontWeight: '700',
  },
  etaText: {
    fontSize: Typography.xs,
    color: Colors.gray500,
  },
  handoffCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    ...Shadows.sm,
    gap: Spacing.sm,
  },
  handoffTitle: {
    fontSize: Typography.base,
    fontWeight: '700',
    color: Colors.gray900,
    marginBottom: Spacing.xs,
  },
  handoffRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  handoffLabel: {
    fontSize: Typography.sm,
    color: Colors.gray500,
  },
  handoffValue: {
    fontSize: Typography.sm,
    fontWeight: '600',
    color: Colors.gray900,
  },
  instructionCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  instructionTitle: {
    fontSize: Typography.base,
    fontWeight: '700',
    color: Colors.gray900,
    marginBottom: Spacing.xs,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  instructionItem: {
    flex: 1,
    fontSize: Typography.sm,
    color: Colors.gray700,
    lineHeight: 22,
  },
});

export default ReplacementDriverScreen;
