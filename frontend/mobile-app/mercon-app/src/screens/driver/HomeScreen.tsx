/** Driver Home Screen Component */
import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, RefreshControl, ActivityIndicator, Alert, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import Svg, { Path, G, Circle } from 'react-native-svg';
import {
  MapPin, Globe, Clock, ChevronRight, ChevronDown, Building2, Navigation,
  Play, CheckCircle2, Wallet, MoreVertical, ArrowRight, ArrowLeft, Route, House, Camera, Settings, RotateCcw,
} from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography, Shadows } from '../../theme/tokens';
import { Badge, DelayReportModal, DriverChargePill, BilingualText } from '../../components';
import { useAuth } from '../../lib/auth-context';
import { useCurrentTrip } from '../../lib/use-current-trip';
import { tripService, statusLabel, stopAddress, stopLabel, isRoundTrip, getEffectiveWorkflowState, getNextExternalAppAction, getTripChargeValue, getMonthlyDriverPayout, type TripStatus, type MobileTrip } from '../../lib/trips';
import { getApiErrorMessage } from '../../lib/api';
import { useLanguage, getLocalizedStatus } from '../../lib/language-context';
import { parseTripRouteNodes, getIntermediateStops, getOutboundIntermediateStops, getReturnIntermediateStops, type TimelineStop } from '../../lib/routeParser';

const WORKFLOW_URDU_LABEL: Record<string, string> = {
  ASSIGNED: 'ٹرپ شروع کریں',
  GOING_TO_PICKUP: 'پک اپ پر جائیں',
  ARRIVED_AT_PICKUP: 'لوڈنگ شروع کریں',
  LOADING: 'لوڈنگ مکمل کریں',
  IN_TRANSIT: 'ڈلیوری پر جائیں',
  ARRIVED_AT_DELIVERY: 'ڈلیوری مکمل کریں',
  DELIVERY_VERIFICATION: 'ڈلیوری مکمل کریں',
  FIRST_DELIVERY_COMPLETED: 'واپسی لوڈنگ شروع کریں',
  RETURN_LOADING: 'واپسی لوڈنگ مکمل کریں',
  IN_TRANSIT_RETURN: 'واپسی ڈلیوری پر جائیں',
  ARRIVED_AT_FINAL_DELIVERY: 'واپسی ڈلیوری مکمل کریں',
  FINAL_DELIVERY_VERIFICATION: 'واپسی ڈلیوری مکمل کریں',
  REVIEW_COMPLETE: 'ٹرپ مکمل کریں',
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/** Header SVG: Dark Charcoal (#3E3C3D) on top-left background touching left/top edges with Coral Red (#FA634E) on right */
function HeaderWaveBg({ width = SCREEN_WIDTH, height = 310 }: { width?: number; height?: number }) {
  const topExtension = 600;
  const totalHeight = height + topExtension;
  return (
    <Svg
      width={width}
      height={totalHeight}
      viewBox={`0 -${topExtension} 400 ${totalHeight}`}
      preserveAspectRatio="none"
      style={[StyleSheet.absoluteFill, { top: -topExtension, height: totalHeight }]}
    >
      {/* 1. Base Coral Red Background (#FA634E) covering full right & main area upwards */}
      <Path d={`M -10 -${topExtension + 10} L 410 -${topExtension + 10} L 410 ${height + 10} L -10 ${height + 10} Z`} fill="#FA634E" />

      {/* 2. Dark Charcoal (#3E3C3D) parallelogram — covers full left/top, diagonal edge slopes right with subtle gap before chip */}
      <Path
        d={`M -10 -${topExtension + 10} L 360 -${topExtension + 10} L 140 ${height + 10} L -10 ${height + 10} Z`}
        fill="#3E3C3D"
      />

      {/* 3. Subtle Dotted Pattern Grid on the Charcoal area extending upwards */}
      <G opacity={0.18}>
        {[-150, -120, -90, -60, -30, 0, 30, 45, 60, 75, 90, 105, 120, 135, 150].map((yVal) => (
          <React.Fragment key={yVal}>
            <Circle cx="35" cy={yVal} r="2.2" fill="#FFFFFF" />
            <Circle cx="50" cy={yVal} r="2.2" fill="#FFFFFF" />
            <Circle cx="65" cy={yVal} r="2.2" fill="#FFFFFF" />
            <Circle cx="80" cy={yVal} r="2.2" fill="#FFFFFF" />
            <Circle cx="95" cy={yVal} r="2.2" fill="#FFFFFF" />
            <Circle cx="110" cy={yVal} r="2.2" fill="#FFFFFF" />
          </React.Fragment>
        ))}
      </G>
    </Svg>
  );
}

/** Badge colour by trip status. */
function statusVariant(s: TripStatus): 'warning' | 'success' | 'info' | 'neutral' {
  if (s === 'InTransit') return 'warning';
  if (s === 'Completed') return 'success';
  if (s === 'AtPickup' || s === 'AtDelivery') return 'info';
  return 'neutral';
}

/** Short "27 Jul, 14:30" label, or a fallback when there's no timestamp. */
function shortWhen(iso?: string | null, fallback = 'Scheduled'): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatCharge(val?: number | string | null): string {
  if (val === null || val === undefined) return '0.00';
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (Number.isNaN(n)) return '0.00';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const HomeScreen = () => {
  const { profile, signOut } = useAuth();
  const { trip, loading, error, refetch, setTrip } = useCurrentTrip();
  const { language, openLanguageModal, t } = useLanguage();
  const [activeTab, setActiveTab] = useState('Home');
  const [advancing, setAdvancing] = useState(false);
  const [delayModalVisible, setDelayModalVisible] = useState(false);
  const [scheduledTrips, setScheduledTrips] = useState<MobileTrip[]>([]);
  const [scheduledLoading, setScheduledLoading] = useState(true);
  const router = useRouter();

//  // Restore current trip workflow screen on mount
//  const restoredRef = useRef(false);
//  useEffect(() => {
//    if (loading || !trip || restoredRef.current) return;
//    restoredRef.current = true;
//    const ws = getEffectiveWorkflowState(trip);
//    if (trip.driver_workflow === 'EXTERNAL_APP') {
//      if (ws !== 'ASSIGNED') {
//        router.push('/trip/external-app');
//      }
//      return;
//    }
//    if (ws === 'GOING_TO_PICKUP') {
//      router.push('/trip/navigate');
//    } else if (ws === 'ARRIVED_AT_PICKUP' || ws === 'LOADING' || ws === 'RETURN_LOADING') {
//      router.push('/trip/pickup');
//    } else if (
//      ws === 'GOING_TO_STOP' || ws === 'ARRIVED_AT_STOP' || ws === 'STOP_VERIFICATION' ||
//      ws === 'GOING_TO_RETURN_STOP' || ws === 'ARRIVED_AT_RETURN_STOP' || ws === 'RETURN_STOP_VERIFICATION'
//    ) {
//      const isReturn = ws.includes('RETURN');
//      router.push({ pathname: '/trip/stop', params: { legIndex: isReturn ? '1' : '0' } });
//    } else if (ws === 'IN_TRANSIT' || ws === 'IN_TRANSIT_RETURN') {
//      const isReturn = ws === 'IN_TRANSIT_RETURN';
//      const legIdx = isReturn ? 1 : 0;
//      const legStops = (trip.stops || []).filter((s) => (s.leg_index ?? 0) === legIdx);
//      const hasUncompletedIntermediate = legStops.some(
//        (s) => s.stop_type !== 'Pickup' && s.stop_type !== 'Dropoff' && !s.actual_departure
//      );
//      if (hasUncompletedIntermediate) {
//        router.push({ pathname: '/trip/stop', params: { legIndex: isReturn ? '1' : '0' } });
//      } else {
//        router.push('/trip/navigate');
//      }
//    } else if (ws === 'ARRIVED_AT_DELIVERY' || ws === 'DELIVERY_VERIFICATION' || ws === 'ARRIVED_AT_FINAL_DELIVERY' || ws === 'FINAL_DELIVERY_VERIFICATION' || ws === 'REVIEW_COMPLETE') {
//      router.push('/trip/delivery');
//    }
//  }, [trip, loading]);

  const fetchScheduled = useCallback(async () => {
    setScheduledLoading(true);
    try {
      const data = await tripService.getScheduled();
      setScheduledTrips(trip ? data.filter((t: MobileTrip) => t.id !== trip.id) : data);
    } catch {
      // silently fail
    } finally {
      setScheduledLoading(false);
    }
  }, [trip]);

  // Load secondary data (scheduled trips) strictly once after primary trip resolves on initial load
  const secondaryLoadedRef = useRef(false);
  useEffect(() => {
    if (!loading && !secondaryLoadedRef.current) {
      secondaryLoadedRef.current = true;
      fetchScheduled();
    }
  }, [loading, fetchScheduled]);

  // Refresh the trip whenever Home regains focus
  const displayTrip = trip || (scheduledTrips.length > 0 ? scheduledTrips[0] : null);
  const remainingScheduled = scheduledTrips.filter((st) => st.id !== displayTrip?.id);

  // `.find()` for stop_type === 'Dropoff' alone would match the OUTBOUND
  // delivery on a round trip (the first Dropoff in sequence), not the true
  // final destination on the return leg. Take the pickup from the front and
  // the dropoff from the back so a round trip's return delivery wins.
  const sortedDisplayStops = [...(displayTrip?.stops ?? [])].sort((a, b) => a.stop_sequence - b.stop_sequence);
  const pickupStop = sortedDisplayStops.find((s) => s.stop_type === 'Pickup') ?? sortedDisplayStops[0];
  const dropoffStop = [...sortedDisplayStops].reverse().find((s) => s.stop_type === 'Dropoff') ?? sortedDisplayStops[sortedDisplayStops.length - 1];
  const intermediateStops = sortedDisplayStops.filter((s) => s.id !== pickupStop?.id && s.id !== dropoffStop?.id);

  const langTag = language === 'en' ? 'EN' : language === 'ur' ? 'اردو' : 'اردو / EN';

  interface WorkflowStateInfo {
    badgeLabel: string;
    btnLabel: string;
    onPress: () => void;
  }

  const getWorkflowStateInfo = (t: MobileTrip): WorkflowStateInfo => {
    if (t.driver_workflow === 'EXTERNAL_APP') {
      const ws = getEffectiveWorkflowState(t);
      const isAssigned = ws === 'ASSIGNED';
      const nextAction = getNextExternalAppAction(t);
      return {
        badgeLabel: isAssigned ? 'Assigned (External)' : 'External App',
        btnLabel: isAssigned ? 'Start Trip' : (nextAction?.label ?? 'Trip Completed'),
        onPress: async () => {
          if (isAssigned) {
            setAdvancing(true);
            try {
              const updated = await tripService.updateStatus(t.id, 'Scheduled', 'GOING_TO_PICKUP');
              setTrip(updated);
            } catch (err) {
              console.warn('Could not update trip status on start:', err);
            } finally {
              setAdvancing(false);
            }
          }
          router.push('/trip/external-app');
        },
      };
    }
    const ws = getEffectiveWorkflowState(t);
    const outboundStops = getOutboundIntermediateStops(t);
    const returnStops = getReturnIntermediateStops(t);
    const hasStops = outboundStops.length > 0;
    const hasReturnStops = returnStops.length > 0;

    switch (ws) {
      case 'ASSIGNED':
      case 'GOING_TO_PICKUP':
        return {
          badgeLabel: 'Assigned',
          btnLabel: 'Start Trip',
          onPress: async () => {
            setAdvancing(true);
            try {
              const updated = await tripService.updateStatus(t.id, 'Scheduled', 'GOING_TO_PICKUP');
              setTrip(updated);
              router.push('/trip/navigate');
            } catch (err) {
              Alert.alert('Error', getApiErrorMessage(err));
            } finally {
              setAdvancing(false);
            }
          },
        };
      case 'ARRIVED_AT_PICKUP':
      case 'LOADING':
        return {
          badgeLabel: 'At Pickup',
          btnLabel: 'Start Loading',
          onPress: () => router.push('/trip/pickup'),
        };
      case 'LOADING_COMPLETED':
        return {
          badgeLabel: 'Loading Completed',
          btnLabel: hasStops ? 'Go to Intermediate Stop' : 'Go to Delivery',
          onPress: () => {
            if (hasStops) {
              router.push('/trip/stop');
            } else {
              router.push('/trip/navigate');
            }
          },
        };
      case 'GOING_TO_STOP':
      case 'ARRIVED_AT_STOP':
      case 'STOP_VERIFICATION':
        return {
          badgeLabel: 'At Intermediate Stop',
          btnLabel: 'Verify Stop & Upload Photo',
          onPress: () => router.push('/trip/stop'),
        };
      case 'IN_TRANSIT': {
        const legStops = (t.stops || []).filter((s) => (s.leg_index ?? 0) === 0);
        const uncompletedStop = legStops.find(
          (s) => s.stop_type !== 'Pickup' && s.stop_type !== 'Dropoff' && !s.actual_departure
        );
        if (uncompletedStop || (hasStops && (t.driver_workflow_state || '').includes('STOP'))) {
          return {
            badgeLabel: 'At Intermediate Stop',
            btnLabel: 'Verify Stop & Upload Photo',
            onPress: () => router.push({ pathname: '/trip/stop', params: { legIndex: '0' } }),
          };
        }
        return {
          badgeLabel: 'In Transit',
          btnLabel: 'Go to Delivery',
          onPress: () => router.push('/trip/navigate'),
        };
      }
      case 'ARRIVED_AT_DELIVERY':
      case 'DELIVERY_VERIFICATION':
        return {
          badgeLabel: 'At Delivery',
          btnLabel: 'Unload & Verify',
          onPress: () => router.push('/trip/delivery'),
        };
      case 'DELIVERY_COMPLETED':
      case 'FIRST_DELIVERY_COMPLETED':
      case 'RETURN_LOADING':
        if (!isRoundTrip(t)) {
          return {
            badgeLabel: 'Delivery Completed',
            btnLabel: 'View Completed Summary',
            onPress: () => router.push('/trip/completed'),
          };
        }
        return {
          badgeLabel: 'Delivery Completed',
          btnLabel: 'Start Return Loading',
          onPress: () => router.push('/trip/pickup'),
        };
      case 'RETURN_LOADING_COMPLETED':
        return {
          badgeLabel: 'Return Loading Completed',
          btnLabel: hasReturnStops ? 'Go to Return Intermediate Stop' : 'Go to Return Delivery',
          onPress: () => {
            if (hasReturnStops) {
              router.push({ pathname: '/trip/stop', params: { legIndex: '1' } });
            } else {
              router.push('/trip/navigate');
            }
          },
        };
      case 'GOING_TO_RETURN_STOP':
      case 'ARRIVED_AT_RETURN_STOP':
      case 'RETURN_STOP_VERIFICATION':
        return {
          badgeLabel: 'At Return Stop',
          btnLabel: 'Verify Return Stop & Upload Photo',
          onPress: () => router.push({ pathname: '/trip/stop', params: { legIndex: '1' } }),
        };
      case 'IN_TRANSIT_RETURN': {
        const legStops = (t.stops || []).filter((s) => (s.leg_index ?? 0) === 1);
        const uncompletedStop = legStops.find(
          (s) => s.stop_type !== 'Pickup' && s.stop_type !== 'Dropoff' && !s.actual_departure
        );
        if (uncompletedStop || (hasReturnStops && (t.driver_workflow_state || '').includes('STOP'))) {
          return {
            badgeLabel: 'At Return Stop',
            btnLabel: 'Verify Return Stop & Upload Photo',
            onPress: () => router.push({ pathname: '/trip/stop', params: { legIndex: '1' } }),
          };
        }
        return {
          badgeLabel: 'In Transit (Return)',
          btnLabel: 'Go to Return Delivery',
          onPress: () => router.push('/trip/navigate'),
        };
      }
      case 'ARRIVED_AT_FINAL_DELIVERY':
      case 'FINAL_DELIVERY_VERIFICATION':
        return {
          badgeLabel: isRoundTrip(t) ? 'At Return Delivery' : 'At Delivery',
          btnLabel: isRoundTrip(t) ? 'Final Unload & Verify' : 'Unload & Verify',
          onPress: () => router.push('/trip/delivery'),
        };
      case 'RETURN_DELIVERY_COMPLETED':
      case 'REVIEW_COMPLETE':
      case 'COMPLETED':
        return {
          badgeLabel: isRoundTrip(t) ? 'Return Delivery Completed' : 'Trip Completed',
          btnLabel: 'View Completed Summary',
          onPress: () => router.push('/trip/completed'),
        };
      default:
        return {
          badgeLabel: statusLabel(t.status),
          btnLabel: 'Start Trip',
          onPress: () => {
            if (t.status === 'Scheduled' || t.status === 'Draft') { router.push('/trip/navigate'); }
            else if (t.status === 'Loading' || t.status === 'AtPickup') { router.push('/trip/pickup'); }
            else { router.push('/trip/delivery'); }
          }
        };
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#FA634E" />

      {/* Main ScrollView containing both Header and Content for smooth pull-to-refresh & continuous scrolling */}
      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={async () => {
              await refetch();
              await fetchScheduled();
            }}
            tintColor="#FFFFFF"
            progressBackgroundColor="#FA634E"
            colors={['#FFFFFF']}
          />
        }
      >
        {/* Header Block inside ScrollView */}
        <View style={styles.headerContainer}>
          <HeaderWaveBg width={SCREEN_WIDTH} height={310} />

          <SafeAreaView style={styles.headerSafe}>
            {/* Top Header Row: Language Top-Left, Driver Charge Top-Right */}
            <View style={styles.topHeaderRow}>
              {/* Select Language on Top-Left */}
              <TouchableOpacity onPress={openLanguageModal} activeOpacity={0.8} style={styles.langPill}>
                <Globe size={15} color="#3E3C3D" strokeWidth={2.2} />
                <Text style={styles.langPillText}>{langTag}</Text>
                <ChevronDown size={14} color="#3E3C3D" strokeWidth={2.2} />
              </TouchableOpacity>

              {/* Driver Charge on Top-Right */}
              <DriverChargePill />
            </View>

            {/* Welcome back / Greeting below Language on the Left */}
            <View style={styles.greetingBox}>
              <Text style={styles.greetingSub}>{t('title_welcome_back', 'Good Morning,')}</Text>
              <Text style={styles.greetingMain}>{t('msg_drive_safe', 'Drive Safe Today!')}</Text>
            </View>
          </SafeAreaView>
        </View>

        {/* ── Current Trip Card Section (Overlapping Header naturally) ── */}
        <View style={styles.cardWrapper}>
          {loading && !displayTrip ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color="#FA634E" />
            </View>
          ) : error && !displayTrip ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={refetch}><Text style={styles.retryText}>{t('action_tap_to_retry', 'Tap to retry')}</Text></TouchableOpacity>
            </View>
          ) : !displayTrip ? (
            <View style={styles.emptyCard}>
              <BilingualText
                ur="فی الحال کوئی فعال ٹرپ نہیں ہے"
                en="No active trip at the moment"
                align="center"
                primaryStyle={styles.emptyTitleUrdu}
                subStyle={styles.emptyTitleEn}
              />
              <BilingualText
                ur="آپ کا تمام کام مکمل ہے، اگلے ٹرپ اسائنمنٹ کا انتظار ہے۔"
                en="You're all caught up. Waiting for your next assignment."
                align="center"
                primaryStyle={styles.emptySubUrdu}
                subStyle={styles.emptySubEn}
                containerStyle={{ marginTop: 8 }}
              />
            </View>
          ) : (
            <View style={styles.refTripCard}>
              {/* Card Header */}
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardTitleCol}>
                  <BilingualText
                    ur={displayTrip.status === 'Scheduled' || displayTrip.status === 'Draft' ? 'اگلا شیڈول شدہ ٹرپ' : 'موجودہ ٹرپ'}
                    en={displayTrip.status === 'Scheduled' || displayTrip.status === 'Draft' ? 'Next Scheduled Trip' : 'Current Trip'}
                    primaryStyle={styles.cardTitleUrduPrimary}
                    subStyle={styles.cardTitleSubEn}
                  />
                </View>

                <View style={styles.headerRightGroup}>
                  {(() => {
                    const stops = displayTrip.stops || [];
                    const stopsCount = stops.length;
                    if (stopsCount > 2) {
                      const isRound = isRoundTrip(displayTrip);
                      const returnStops = stops.filter((s) => (s.leg_index ?? 0) === 1);
                      const outboundStops = stops.filter((s) => (s.leg_index ?? 0) === 0);

                      let badgeStr = '';
                      const activeStop = stops.find((s) => !s.actual_departure);

                      if (isRound && returnStops.length > 0) {
                        if (!activeStop || (activeStop.leg_index ?? 0) === 0) {
                          const activeOutIdx = outboundStops.findIndex((s) => !s.actual_departure);
                          const num = activeOutIdx >= 0 ? activeOutIdx + 1 : outboundStops.length;
                          badgeStr = language === 'ur'
                            ? `روانگی: ${num}/${outboundStops.length}`
                            : language === 'ur-en'
                            ? `روانگی / Outbound: ${num}/${outboundStops.length}`
                            : `Outbound: ${num}/${outboundStops.length}`;
                        } else {
                          const activeRetIdx = returnStops.findIndex((s) => !s.actual_departure);
                          const num = activeRetIdx >= 0 ? activeRetIdx + 1 : returnStops.length;
                          badgeStr = language === 'ur'
                            ? `واپسی: ${num}/${returnStops.length}`
                            : language === 'ur-en'
                            ? `واپسی / Return: ${num}/${returnStops.length}`
                            : `Return: ${num}/${returnStops.length}`;
                        }
                      } else {
                        const activeIdx = stops.findIndex((s) => !s.actual_departure);
                        const currentStopNum = activeIdx >= 0 ? activeIdx + 1 : stopsCount;
                        badgeStr = isRound
                          ? (language === 'ur' ? `لیگ ${currentStopNum}/${stopsCount}` : `Leg ${currentStopNum}/${stopsCount}`)
                          : (language === 'ur' ? `اسٹاپ ${currentStopNum}/${stopsCount}` : `Stop ${currentStopNum}/${stopsCount}`);
                      }

                      return (
                        <View style={[styles.inProgressBadge, { backgroundColor: '#FEF3C7' }]}>
                          <Text style={[styles.inProgressText, { color: '#B45309', fontWeight: '800' }]} numberOfLines={1}>
                            {badgeStr}
                          </Text>
                        </View>
                      );
                    }
                    return null;
                  })()}
                  <View style={styles.inProgressBadge}>
                    <View style={styles.coralDot} />
                    <Text style={styles.inProgressText} numberOfLines={1} ellipsizeMode="tail">
                      {getLocalizedStatus(displayTrip.driver_workflow_state || displayTrip.status, language)}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.moreOptionsBtn}>
                    <MoreVertical size={18} color="#3E3C3D" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Trip ID Row */}
              <View style={styles.tripIdRow}>
                <Text style={styles.tripIdLabel}>{t('label_trip_id', 'Trip ID')}</Text>
                <Text style={styles.tripIdValue}>
                  {displayTrip.ref_id
                    ? (displayTrip.ref_id.startsWith('TRP-') ? displayTrip.ref_id : `TRP-${displayTrip.ref_id}`)
                    : `TRP-${displayTrip.id.slice(0, 8)}`}
                </Text>
              </View>

              <View style={styles.cardDivider} />

              {/* Route Vertical Timeline — unified row layout */}
              {(() => {
                const timelineStops = parseTripRouteNodes(displayTrip);
                const returnLegStartIdx = timelineStops.findIndex((s) => s.legIndex === 1);
                const isReturnLeg = (idx: number) => returnLegStartIdx !== -1 && idx >= returnLegStartIdx;

                const handleStopPress = (st: TimelineStop) => {
                  if (displayTrip?.driver_workflow === 'EXTERNAL_APP') {
                    router.push('/trip/external-app');
                    return;
                  }
                  if (st.isIntermediate) {
                    router.push({ pathname: '/trip/stop', params: { legIndex: String(st.legIndex ?? 0) } } as any);
                  } else {
                    router.push('/trip/navigate');
                  }
                };

                if (timelineStops.length === 0) {
                  const fallbackOrigin = (displayTrip as any).quotation?.name?.split(/→|->|–|-/)[0]?.trim() || displayTrip.origin;
                  const fallbackDest = (displayTrip as any).quotation?.name?.split(/→|->|–|-/)?.[1]?.replace(/\[.*?\]/g, '')?.trim() || displayTrip.destination;

                  return (
                    <View style={styles.routeContainer}>
                      <View style={styles.fallbackRouteBanner}>
                        <Route size={20} color="#FA634E" strokeWidth={2.2} />
                        <View style={styles.fallbackRouteTextCol}>
                          <Text style={styles.fallbackRouteTitle}>
                            {fallbackOrigin && fallbackDest ? `${fallbackOrigin} → ${fallbackDest}` : 'Route Stops Pending Assignment'}
                          </Text>
                          <Text style={styles.fallbackRouteSub}>
                            {fallbackOrigin && fallbackDest ? 'Detailed GPS checkpoints will sync upon dispatch' : 'Contact dispatch for assigned pickup and delivery stops'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                }

                return (
                  <View style={styles.routeContainer}>
                    {timelineStops.map((st, idx) => {
                      const isFirst = idx === 0;
                      const isLast = idx === timelineStops.length - 1;
                      const isReturnStart = returnLegStartIdx !== -1 && idx === returnLegStartIdx;
                      const returnLeg = isReturnLeg(idx);
                      const dotColor = returnLeg ? '#3E3C3D' : '#FA634E';
                      const lineColor = returnLeg ? '#3E3C3D' : '#D8D8DC';
                      const iconColor = returnLeg ? '#3E3C3D' : '#FA634E';

                      return (
                        <React.Fragment key={`row-${st.id}-${idx}`}>
                          {/* Return Leg Pill Divider */}
                          {isReturnStart && (
                            <View style={styles.returnLegDividerRow}>
                              <View style={styles.timelineDotCol}>
                                <View style={styles.returnLegConnector} />
                              </View>
                              <View style={styles.returnLegDivider}>
                                <View style={styles.returnLegDividerLine} />
                                <View style={styles.returnLegPill}>
                                  <RotateCcw size={11} color="#FA634E" strokeWidth={2.5} />
                                  <Text style={styles.returnLegPillText}>{language === 'ur' ? 'واپسی کا سفر' : 'Return Leg'}</Text>
                                </View>
                                <View style={styles.returnLegDividerLine} />
                              </View>
                            </View>
                          )}

                          {/* Stop Row */}
                          <View style={styles.timelineRow}>
                            {/* Left: dot + connector line */}
                            <View style={styles.timelineDotCol}>
                              {isFirst ? (
                                <View style={[styles.pickupNodeOuter, { borderColor: dotColor }]}>
                                  <View style={[styles.pickupNodeInner, { backgroundColor: dotColor }]} />
                                </View>
                              ) : (
                                <View style={[
                                  styles.stopNodeDot,
                                  { borderColor: dotColor },
                                  returnLeg && { backgroundColor: dotColor },
                                ]} />
                              )}
                              {!isLast && (
                                <View style={[styles.dashedLine, { borderColor: lineColor, opacity: returnLeg ? 0.4 : 1 }]} />
                              )}
                            </View>

                            {/* Right: icon + text + nav button — all in one flat row */}
                            <View style={styles.routeRowItem}>
                              <View style={[styles.iconCircleBadge, returnLeg && { backgroundColor: '#F0F0F0' }]}>
                                {st.iconType === 'House' ? (
                                  <House size={20} color={iconColor} strokeWidth={2} />
                                ) : st.iconType === 'MapPin' ? (
                                  <MapPin size={20} color={iconColor} strokeWidth={2} />
                                ) : (
                                  /* Stop node — circle with "STOP" text */
                                  <View style={[styles.stopLetterCircle, { borderColor: iconColor }]}>
                                    <Text style={[styles.stopLetterText, { color: iconColor }]}>{t('label_stop', 'STOP')}</Text>
                                  </View>
                                )}
                              </View>
                              <View style={styles.routeTextCol}>
                                <BilingualText
                                  ur={st.typeUrdu}
                                  en={st.typeEn}
                                  primaryStyle={styles.stageUrduPrimary}
                                  subStyle={styles.stageSubEn}
                                />
                                <Text style={styles.routePlaceName} numberOfLines={1}>
                                  {st.name}
                                </Text>
                                {st.address ? (
                                  <Text style={styles.routeAddressText} numberOfLines={1}>
                                    {st.address}
                                  </Text>
                                ) : null}
                              </View>
                              <TouchableOpacity
                                style={styles.navCircleBtn}
                                activeOpacity={0.7}
                                onPress={() => handleStopPress(st)}
                              >
                                <Navigation size={15} color="#3E3C3D" strokeWidth={2} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        </React.Fragment>
                      );
                    })}
                  </View>
                );
              })()}




              {/* Primary Action CTA & Secondary Delay Button Below */}
              {(() => {
                const info = getWorkflowStateInfo(displayTrip);
                return (
                  <View style={styles.actionsContainer}>
                    <TouchableOpacity
                      style={[styles.primaryCtaBtn, advancing && { opacity: 0.7 }]}
                      activeOpacity={0.88}
                      onPress={() => {
                        setTrip(displayTrip);
                        info.onPress();
                      }}
                      disabled={advancing}
                    >
                      {advancing ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <View style={styles.ctaContentRow}>
                          <BilingualText
                            ur={WORKFLOW_URDU_LABEL[displayTrip.driver_workflow_state || 'ASSIGNED'] || 'ٹرپ شروع کریں'}
                            en={info.btnLabel || 'Start Trip'}
                            align="center"
                            primaryStyle={styles.ctaUrduPrimary}
                            subStyle={styles.ctaSubEn}
                          />
                          {language === 'ur' ? (
                            <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.5} />
                          ) : (
                            <ArrowRight size={20} color="#FFFFFF" strokeWidth={2.5} />
                          )}
                        </View>
                      )}
                    </TouchableOpacity>

                    {/* Secondary Action - Report Delay (Below Start Button) */}
                    <TouchableOpacity
                      style={styles.secondaryDelayBtn}
                      activeOpacity={0.85}
                      onPress={() => setDelayModalVisible(true)}
                    >
                      <Clock size={16} color="#FA634E" strokeWidth={2.2} />
                      <BilingualText
                        ur="تاخیر کی اطلاع دیں"
                        en="Report Delay"
                        align="center"
                        primaryStyle={styles.delayUrduPrimary}
                        subStyle={styles.delaySubEn}
                      />
                    </TouchableOpacity>
                  </View>
                );
              })()}
            </View>
          )}
        </View>

        {/* ── Upcoming Scheduled Trips List Section ── */}
        {remainingScheduled.length > 0 && (
          <View style={styles.scheduledSection}>
            <View style={styles.scheduledSectionHeader}>
              <BilingualText
                ur="دیگر شیڈول شدہ ٹرپس"
                en={`Upcoming Scheduled Trips (${remainingScheduled.length})`}
                primaryStyle={styles.scheduledSectionUrdu}
                subStyle={styles.scheduledSectionEn}
              />
              <TouchableOpacity onPress={() => router.push('/(tabs)/trips' as any)}>
                <Text style={styles.viewAllText}>{t('action_view_all', 'View All')}</Text>
              </TouchableOpacity>
            </View>

            {remainingScheduled.map((st) => {
              const sortedStStops = [...(st.stops ?? [])].sort((a, b) => a.stop_sequence - b.stop_sequence);
              const p = sortedStStops.find((s) => s.stop_type === 'Pickup') ?? sortedStStops[0];
              const d = [...sortedStStops].reverse().find((s) => s.stop_type === 'Dropoff') ?? sortedStStops[sortedStStops.length - 1];
              const quoNameParts = (st as any).quotation?.name ? (st as any).quotation.name.split(/\s*(?:→|->|–|-)\s*/).map((s: string) => s.trim()).filter(Boolean) : [];
              const originLabel = stopLabel(p) || (st.stops?.length ? null : quoNameParts[0]) || st.origin || 'Pickup';
              const destLabel = stopLabel(d) || (st.stops?.length ? null : quoNameParts[1]) || st.destination || 'Delivery';
              const tripRef = st.ref_id
                ? (st.ref_id.startsWith('TRP-') ? st.ref_id : `TRP-${st.ref_id}`)
                : `TRP-${st.id.slice(0, 8)}`;

              return (
                <View key={st.id} style={styles.scheduledCard}>
                  <View style={styles.scheduledCardHeader}>
                    <View style={styles.customerLogoBadge}>
                      <Text style={styles.customerLogoLetter}>{(st.customer?.name || 'M')[0]}</Text>
                    </View>
                    <View style={styles.customerMetaCol}>
                      <Text style={styles.scheduledCustomerName} numberOfLines={1}>
                        {st.customer?.name || 'MERCON Customer'}
                      </Text>
                      <Text style={styles.scheduledTripIdText}>{t('label_trip_id', 'Trip ID')} · {tripRef}</Text>
                    </View>
                    <View style={styles.scheduledPillBadge}>
                      <Text style={styles.scheduledPillText}>{t('status_scheduled', 'Scheduled')}</Text>
                    </View>
                  </View>

                  <View style={styles.scheduledRouteRow}>
                    <Text style={styles.scheduledCityText} numberOfLines={1}>{originLabel}</Text>
                    <ArrowRight size={14} color="#FA634E" strokeWidth={2.2} />
                    <Text style={styles.scheduledCityText} numberOfLines={1}>{destLabel}</Text>
                  </View>

                  <View style={styles.scheduledCardFooter}>
                    <View style={styles.footerTimeRow}>
                      <Clock size={13} color="#64748B" />
                      <Text style={styles.footerTimeText}>{shortWhen(st.planned_start, 'Scheduled')}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.startTripSmallBtn}
                      onPress={async () => {
                        setTrip(st);
                        if (st.driver_workflow === 'EXTERNAL_APP') {
                          try {
                            await tripService.updateStatus(st.id, 'Scheduled', 'GOING_TO_PICKUP');
                          } catch {}
                          router.push('/trip/external-app');
                        } else {
                          router.push('/trip/navigate');
                        }
                      }}
                    >
                      <Text style={styles.startTripSmallBtnText}>{t('action_start_trip', 'Start Trip')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <DelayReportModal
        visible={delayModalVisible}
        tripId={displayTrip?.id ?? null}
        onClose={() => setDelayModalVisible(false)}
        onSuccess={() => refetch()}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EEF1F6',
  },
  topHeaderFill: {
    position: 'absolute',
    top: -1000,
    left: 0,
    right: 0,
    height: 1000 + 310,
    backgroundColor: '#FA634E',
  },
  headerContainer: {
    height: 310,
    width: '100%',
    position: 'relative',
    backgroundColor: '#FA634E',
  },
  headerSafe: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  driverChargePill: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3E3C3D',
    borderRadius: 19,
    paddingHorizontal: 12,
    gap: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  walletIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFF0ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chargeTextCol: {
    justifyContent: 'center',
  },
  chargeAmount: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 15,
  },
  chargeLabel: {
    fontSize: 9.5,
    color: '#D8D8DC',
    lineHeight: 11,
    fontWeight: '500',
  },
  langPill: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 19,
    paddingHorizontal: 12,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  langPillText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#3E3C3D',
  },
  greetingBox: {
    marginTop: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetingSub: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.95)',
    fontWeight: '500',
    textAlign: 'center',
  },
  greetingMain: {
    fontSize: 23,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 2,
    textAlign: 'center',
  },
  mainScroll: {
    flex: 1,
    backgroundColor: '#EEF1F6',
  },
  scrollContent: {
    paddingBottom: 120,
  },
  cardWrapper: {
    paddingHorizontal: 16,
    marginTop: -120,
  },
  centerBox: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
    textAlign: 'center',
  },
  retryText: {
    fontSize: 14,
    color: '#FA634E',
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
    marginTop: 10,
  },
  emptyTitleUrdu: {
    fontSize: 18,
    fontWeight: '800',
    color: '#3E3C3D',
    textAlign: 'center',
  },
  emptyTitleEn: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6E6E80',
    textAlign: 'center',
  },
  emptySubUrdu: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#6E6E80',
    textAlign: 'center',
  },
  emptySubEn: {
    fontSize: 11,
    fontWeight: '500',
    color: '#9898A4',
    textAlign: 'center',
  },

  /* Reference Card */
  refTripCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 20,
    elevation: 6,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitleCol: {
    flexShrink: 1,
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#3E3C3D',
  },
  cardTitleUrduPrimary: {
    fontSize: 18,
    fontWeight: '800',
    color: '#3E3C3D',
  },
  cardTitleSubEn: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6E6E80',
  },
  stageUrduPrimary: {
    fontSize: 14,
    fontWeight: '800',
    color: '#3E3C3D',
  },
  stageSubEn: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6E6E80',
  },
  ctaContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaStackedCol: {
    alignItems: 'center',
  },
  ctaUrduPrimary: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 20,
  },
  ctaSubEn: {
    fontSize: 11.5,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 14,
  },
  delayStackedCol: {
    alignItems: 'center',
  },
  delayUrduPrimary: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FA634E',
    lineHeight: 18,
  },
  delaySubEn: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#6E6E80',
    lineHeight: 13,
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  inProgressBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF0ED',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
    gap: 4,
    flexShrink: 1,
  },
  coralDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FA634E',
  },
  inProgressText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FA634E',
    textTransform: 'capitalize',
    flexShrink: 1,
  },
  moreOptionsBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  tripIdLabel: {
    fontSize: 13,
    color: '#9898A4',
    fontWeight: '500',
  },
  tripIdValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#3E3C3D',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#EEF1F6',
    marginVertical: 16,
  },

  /* Route Timeline — unified per-row layout */
  routeContainer: {
    flexDirection: 'column',
    marginVertical: 4,
  },
  fallbackRouteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F4',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 14,
    padding: 12,
    marginVertical: 6,
  },
  fallbackRouteTextCol: {
    flex: 1,
    marginLeft: 10,
  },
  fallbackRouteTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#3E3C3D',
  },
  fallbackRouteSub: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6E6E80',
    marginTop: 2,
  },
  /* A single timeline row: dot column on left, content on right */
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  /* The Return Leg divider row (has same dot-col on left for line continuity) */
  returnLegDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  /* Fixed-width column that holds the dot + the connector line below it */
  timelineDotCol: {
    width: 28,
    alignItems: 'center',
    paddingTop: 14,
  },
  /* Short dashed line that runs through the divider row to bridge the two legs */
  returnLegConnector: {
    width: 1,
    height: 36,
    borderWidth: 1,
    borderColor: '#D8D8DC',
    borderStyle: 'dashed',
  },
  pickupNodeOuter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#FA634E',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupNodeInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FA634E',
  },
  dashedLine: {
    width: 1,
    height: 46,
    borderWidth: 1,
    borderColor: '#D8D8DC',
    borderStyle: 'dashed',
    marginVertical: 2,
  },
  stopNodeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#3E3C3D',
    backgroundColor: '#FFFFFF',
  },

  routeItemsCol: {
    flex: 1,
    gap: 16,
  },
  routeRowItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  iconCircleBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF0ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeTextCol: {
    flex: 1,
  },
  routeStageLabel: {
    fontSize: 12,
    color: '#9898A4',
    fontWeight: '500',
  },
  routePlaceName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#3E3C3D',
    marginTop: 1,
  },
  routeAddressText: {
    fontSize: 12,
    color: '#6E6E80',
    marginTop: 2,
  },
  navCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F5F7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Stop label — "STOP" text inside icon badge, no border */
  stopLetterCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopLetterText: {
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 12,
    letterSpacing: 0.6,
  },

  /* Return Leg Divider */
  returnLegDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 6,
    paddingVertical: 2,
  },
  returnLegDividerLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: '#EAEAF0',
    borderRadius: 1,
  },
  returnLegPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFF0ED',
    borderWidth: 1.5,
    borderColor: '#FFD0C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  returnLegPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FA634E',
    letterSpacing: 0.2,
  },

  /* Actions */
  actionsContainer: {
    marginTop: 24,
    gap: 12,
  },
  primaryCtaBtn: {
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FA634E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
    shadowColor: '#FA634E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryCtaText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  secondaryDelayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    backgroundColor: '#FFF0ED',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
  },
  secondaryDelayText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FA634E',
  },

  /* Scheduled Trips Section */
  scheduledSection: {
    paddingHorizontal: 16,
    marginTop: 24,
    marginBottom: 32,
  },
  scheduledSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  scheduledSectionUrdu: {
    fontSize: 14,
    fontWeight: '800',
    color: '#3E3C3D',
  },
  scheduledSectionEn: {
    fontSize: 15,
    fontWeight: '800',
    color: '#3E3C3D',
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FA634E',
  },
  scheduledCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  scheduledCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  customerLogoBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerLogoLetter: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  customerMetaCol: {
    flex: 1,
  },
  scheduledCustomerName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
  },
  scheduledTripIdText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  scheduledPillBadge: {
    backgroundColor: '#FFF0ED',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFD0C7',
  },
  scheduledPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FA634E',
  },
  scheduledRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  scheduledCityText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3E3C3D',
    flex: 1,
  },
  scheduledCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  footerTimeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  startTripSmallBtn: {
    backgroundColor: '#FA634E',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
  },
  startTripSmallBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
});

export default HomeScreen;
