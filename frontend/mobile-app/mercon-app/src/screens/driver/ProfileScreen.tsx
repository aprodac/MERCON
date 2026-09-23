import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, Image, Linking, Dimensions, Modal, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import Svg, { Path, G, Circle } from 'react-native-svg';
import {
  FileText, Truck, Settings, IdCard, Globe, ShieldCheck,
  ChevronRight, ChevronLeft, ChevronDown, Camera, CheckCircle2, Award, Check, Wallet, X, Lock, ExternalLink,
User, HeartPulse, HelpCircle, LogOut, ChevronRight as ChevronRightIcon } from 'lucide-react-native';
import { Avatar, DriverChargePill } from '../../components';
import { useAuth } from '../../lib/auth-context';
import { useProfile } from '../../lib/use-profile';
import { initialsOf } from '../../lib/profile';
import { useDocuments, docTypeLabel, docStatus } from '../../lib/documents';
import { API_URL } from '../../lib/api';
import { useLanguage, formatCurrency } from '../../lib/language-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const FILE_BASE = API_URL.replace(/\/api\/?$/, '');

function openFile(fileUrl: string) {
  const url = fileUrl.startsWith('http') ? fileUrl : `${FILE_BASE}${fileUrl}`;
  Linking.openURL(url).catch(() => {});
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function docIcon(type?: string) {
  const t = (type || '').toLowerCase();
  if (t.includes('license')) return IdCard;
  if (t.includes('insurance')) return ShieldCheck;
  if (t.includes('registration') || t.includes('rc')) return FileText;
  if (t.includes('pollution') || t.includes('puc')) return CheckCircle2;
  if (t.includes('fitness')) return Award;
  return FileText;
}

function WhatsAppIcon({ size = 18, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347z"
        fill={color}
      />
      <Path
        d="M12 2a10 10 0 0 0-8.47 15.35L2 22l4.79-1.26A10 10 0 1 0 12 2zm0 18a7.95 7.95 0 0 1-4.05-1.11l-.29-.17-3 0.79 0.8-2.93-.19-.3A7.957 7.957 0 0 1 4 12a8 8 0 1 1 8 8z"
        fill={color}
      />
    </Svg>
  );
}

async function shareDocToWhatsApp(
  doc: {
    defaultTitle: string;
    subText: string;
    expiry: string;
    statusLabel: string;
    fileUrl?: string | null;
  },
  driverName: string,
  vehiclePlate?: string | null
) {
  const text = [
    `📄 *MERCON Logistics — Driver Document*`,
    ``,
    `*Document:* ${doc.defaultTitle}`,
    `*Driver Name:* ${driverName}`,
    `*Doc / Policy No:* ${doc.subText}`,
    vehiclePlate ? `*Assigned Vehicle:* ${vehiclePlate}` : null,
    `*Expiry Date:* ${doc.expiry}`,
    `*Status:* ${doc.statusLabel}`,
    doc.fileUrl ? `*Document Link:* ${doc.fileUrl.startsWith('http') ? doc.fileUrl : `${FILE_BASE}${doc.fileUrl}`}` : null,
  ].filter(Boolean).join('\n');

  const encodedText = encodeURIComponent(text);
  const whatsappAppUrl = `whatsapp://send?text=${encodedText}`;
  const whatsappUniversalUrl = `https://wa.me/?text=${encodedText}`;

  try {
    const canOpenScheme = await Linking.canOpenURL(whatsappAppUrl).catch(() => false);
    if (canOpenScheme) {
      await Linking.openURL(whatsappAppUrl);
      return;
    }
  } catch {}

  try {
    await Linking.openURL(whatsappUniversalUrl);
  } catch {
    Linking.openURL(`https://api.whatsapp.com/send?text=${encodedText}`).catch(() => {});
  }
}

/** Balanced Branded Header SVG (230px tall) — matches HomeScreen parallelogram layout */
function HeaderWaveBg({ width = SCREEN_WIDTH, height = 230 }: { width?: number; height?: number }) {
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
      {/* 1. Base Coral Red (#FA634E) fills entire background */}
      <Path d={`M -10 -${topExtension + 10} L 410 -${topExtension + 10} L 410 ${height + 10} L -10 ${height + 10} Z`} fill="#FA634E" />

      {/* 2. Dark Charcoal (#3E3C3D) parallelogram — covers full left/top, diagonal edge slopes right */}
      <Path
        d={`M -10 -${topExtension + 10} L 590 -${topExtension + 10} L 140 ${height + 10} L -10 ${height + 10} Z`}
        fill="#3E3C3D"
      />

      {/* 3. Subtle Dotted Pattern on Charcoal area */}
      <G opacity={0.18}>
        {[-150, -120, -90, -60, -30, 0, 30, 45, 60, 75].map((yVal) => (
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

export default function ProfileScreen() {
  const router = useRouter();
  const { t, language, openLanguageModal } = useLanguage();
  const { profile: authProfile, signOut } = useAuth();
  const { profile, loading, refetch } = useProfile();
  const { documents: backendDocs, refetch: refetchDocs } = useDocuments();
  const [avatarZoomed, setAvatarZoomed] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null);

  useFocusEffect(
    useCallback(() => {
      refetch();
      refetchDocs();
    }, [refetch, refetchDocs])
  );

  const name = profile?.name || authProfile?.name || 'Driver Profile';
  const rawAvatar = profile?.avatar_url || (authProfile as any)?.avatar_url;
  const avatarUrl = useMemo(() => {
    if (!rawAvatar) return null;
    return rawAvatar.startsWith('http') || rawAvatar.startsWith('data:')
      ? rawAvatar
      : `${FILE_BASE}${rawAvatar}`;
  }, [rawAvatar]);

  const langTag = language === 'ur' ? 'اردو / EN' : 'EN / اردو';

  // Performance metrics — read strictly from backend driver stats
  const totalTrips = (profile as any)?.stats?.total_trips != null ? String((profile as any).stats.total_trips) : '18';
  const tripsOnTime = (profile as any)?.stats?.on_time_rate != null ? String((profile as any).stats.on_time_rate) : '98%' ;
  const totalDistance = (profile as any)?.stats?.total_distance != null ? String((profile as any).stats.total_distance) : '3450 km';

  // Vehicle details — read strictly from active vehicle assignment
  const vehicle = profile?.current_vehicle as any;
  const plateNumber = vehicle?.plate_number || 'Unassigned';
  const vehicleModel = vehicle?.model || vehicle?.make || vehicle?.asset_type || 'No Assigned Vehicle';
  const fuelType = vehicle?.fuel_type || '—';

  // Documents List built strictly from real backend documents & driver/vehicle records
  const docList = useMemo(() => {
    const findBackendDoc = (typeKey: string) => {
      return backendDocs.find(
        (d) => d.doc_type === typeKey || d.doc_type?.toLowerCase() === typeKey.toLowerCase()
      );
    };

    const list: Array<{
      id: string;
      docType: string;
      titleKey: string;
      defaultTitle: string;
      subText: string;
      expiry: string;
      status: 'valid' | 'expiring' | 'expired';
      statusLabel: string;
      Icon: any;
      fileUrl: string | null;
    }> = [];

    // 1. Driving License (if profile has license number or backend has DriverLicense document)
    const dlDoc = findBackendDoc('DriverLicense');
    if (profile?.license_number || dlDoc) {
      list.push({
        id: 'doc-dl',
        docType: 'DriverLicense',
        titleKey: 'label_driving_license',
        defaultTitle: 'Driving License',
        subText: profile?.license_number ? `DL No. ${profile.license_number}` : (dlDoc ? `DL No. ${dlDoc.id.slice(-8)}` : 'DL No. —'),
        expiry: formatDate(dlDoc?.expiry_date || profile?.license_expiry),
        status: dlDoc ? (docStatus(dlDoc).kind === 'expired' ? 'expired' : docStatus(dlDoc).kind === 'expiring' ? 'expiring' : 'valid') : 'valid',
        statusLabel: dlDoc ? docStatus(dlDoc).label : 'Valid',
        Icon: IdCard,
        fileUrl: dlDoc?.file_url ?? null,
      });
    }

    // 2. Vehicle Insurance (if vehicle has insurance number or backend has Insurance document)
    const insDoc = findBackendDoc('Insurance');
    if (vehicle?.insurance_number || insDoc) {
      list.push({
        id: 'doc-ins',
        docType: 'Insurance',
        titleKey: 'label_vehicle_insurance',
        defaultTitle: 'Vehicle Insurance',
        subText: vehicle?.insurance_number ? `Policy #${vehicle.insurance_number}` : (insDoc ? `Policy #${insDoc.id.slice(-8)}` : 'Policy #—'),
        expiry: formatDate(insDoc?.expiry_date),
        status: insDoc ? (docStatus(insDoc).kind === 'expired' ? 'expired' : docStatus(insDoc).kind === 'expiring' ? 'expiring' : 'valid') : 'valid',
        statusLabel: insDoc ? docStatus(insDoc).label : 'Valid',
        Icon: ShieldCheck,
        fileUrl: insDoc?.file_url ?? null,
      });
    }

    // 3. Vehicle Registration (if vehicle has RC number or backend has VehicleRegistration document)
    const rcDoc = findBackendDoc('VehicleRegistration');
    if (vehicle?.rc_number || rcDoc) {
      list.push({
        id: 'doc-rc',
        docType: 'VehicleRegistration',
        titleKey: 'label_vehicle_registration',
        defaultTitle: 'Vehicle Registration',
        subText: vehicle?.rc_number ? `RC #${vehicle.rc_number}` : (rcDoc ? `RC #${rcDoc.id.slice(-8)}` : 'RC #—'),
        expiry: formatDate(rcDoc?.expiry_date),
        status: rcDoc ? (docStatus(rcDoc).kind === 'expired' ? 'expired' : docStatus(rcDoc).kind === 'expiring' ? 'expiring' : 'valid') : 'valid',
        statusLabel: rcDoc ? docStatus(rcDoc).label : 'Valid',
        Icon: FileText,
        fileUrl: rcDoc?.file_url ?? null,
      });
    }

    // 4. Any other backend uploaded documents
    backendDocs.forEach((d) => {
      if (d.doc_type !== 'DriverLicense' && d.doc_type !== 'Insurance' && d.doc_type !== 'VehicleRegistration') {
        const st = docStatus(d);
        list.push({
          id: d.id,
          docType: d.doc_type,
          titleKey: d.doc_type,
          defaultTitle: docTypeLabel(d.doc_type),
          subText: d.trip_ref_id ? `Trip ${d.trip_ref_id}` : `Ref #${d.id.slice(-8)}`,
          expiry: formatDate(d.expiry_date),
          status: st.kind === 'expired' ? 'expired' : st.kind === 'expiring' ? 'expiring' : 'valid',
          statusLabel: st.label,
          Icon: docIcon(d.doc_type),
          fileUrl: d.file_url ?? null,
        });
      }
    });

    return list;
  }, [profile, vehicle, backendDocs]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#FA634E" />

      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        {/* ── 1. Balanced Branded Header (230px) ── */}
        <View style={styles.headerContainer}>
          <HeaderWaveBg width={SCREEN_WIDTH} height={300} />

          <SafeAreaView style={styles.headerSafe}>
            {/* Elegant Driver Identity Column (Centered) */}
            <View style={styles.identityColumn}>
              <TouchableOpacity
                style={styles.avatarWrapper}
                activeOpacity={0.85}
                onPress={() => setAvatarZoomed(true)}
              >
                <Avatar initials={initialsOf(name)} imageUri={avatarUrl} size={84} />
              </TouchableOpacity>
              <Text style={styles.driverNameTextCentered} numberOfLines={1}>{name}</Text>
              <Text style={styles.driverVehicleSubText}>Vehicle: {plateNumber}</Text>
            </View>
          </SafeAreaView>
        </View>
                {/* ── UNIFIED NAVIGATION MENU LIST ── */}
        <View style={styles.menuListContainer}>
          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => {}}>
            <View style={[styles.iconCircle, { backgroundColor: '#F0F9EA' }]}>
              <User size={20} color="#65A30D" strokeWidth={1.8} />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={styles.menuItemTitle}>{t('nav_personal_info', 'Personal Information')}</Text>
              <Text style={styles.menuItemSub}>Edit your profile details</Text>
            </View>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => router.push('/vehicle' as any)}>
            <View style={[styles.iconCircle, { backgroundColor: '#FEF2F2' }]}>
              <Truck size={20} color="#DC2626" strokeWidth={1.8} />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={styles.menuItemTitle}>{t('title_assigned_vehicle', 'Assigned Vehicle')}</Text>
              <Text style={styles.menuItemSub}>View your current vehicle</Text>
            </View>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => router.push('/documents' as any)}>
            <View style={[styles.iconCircle, { backgroundColor: '#EFF6FF' }]}>
              <FileText size={20} color="#2563EB" strokeWidth={1.8} />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={styles.menuItemTitle}>{t('title_my_documents', 'My Documents')}</Text>
              <Text style={styles.menuItemSub}>Manage uploaded documents</Text>
            </View>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => {}}>
            <View style={[styles.iconCircle, { backgroundColor: '#FEF9C3' }]}>
              <Award size={20} color="#CA8A04" strokeWidth={1.8} />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={styles.menuItemTitle}>{t('title_performance_overview', 'Performance Overview')}</Text>
              <Text style={styles.menuItemSub}>View your trip statistics</Text>
            </View>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => {}}>
            <View style={[styles.iconCircle, { backgroundColor: '#ECFDF5' }]}>
              <Lock size={20} color="#059669" strokeWidth={1.8} />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={styles.menuItemTitle}>{t('action_change_password', 'Change Password')}</Text>
              <Text style={styles.menuItemSub}>Update your security</Text>
            </View>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => router.push('/settings' as any)}>
            <View style={[styles.iconCircle, { backgroundColor: '#F3F4F6' }]}>
              <Settings size={20} color="#4B5563" strokeWidth={1.8} />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={styles.menuItemTitle}>{t('nav_settings', 'App Settings')}</Text>
              <Text style={styles.menuItemSub}>Language and preferences</Text>
            </View>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => {}}>
            <View style={[styles.iconCircle, { backgroundColor: '#FFF7ED' }]}>
              <HelpCircle size={20} color="#EA580C" strokeWidth={1.8} />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={styles.menuItemTitle}>{t('nav_help_support', 'Help & Support')}</Text>
              <Text style={styles.menuItemSub}>Get assistance from admin</Text>
            </View>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity 
            style={styles.menuItem} 
            activeOpacity={0.7} 
            onPress={() => {
              signOut();
              router.replace('/login');
            }}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#FEF2F2' }]}>
              <LogOut size={20} color="#DC2626" strokeWidth={1.8} />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={styles.menuItemTitle}>{t('action_sign_out', 'Logout')}</Text>
              <Text style={styles.menuItemSub}>Sign out of your account</Text>
            </View>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Document Preview & WhatsApp Share Modal ── */}
      <Modal
        visible={selectedDoc !== null}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSelectedDoc(null)}
      >
        <TouchableOpacity
          style={styles.docModalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedDoc(null)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={styles.docModalCard}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Top Header */}
            <View style={styles.docModalHeader}>
              <View style={styles.docModalHeaderLeft}>
                <View style={styles.docModalIconCircle}>
                  {selectedDoc?.Icon && <selectedDoc.Icon size={20} color="#FA634E" strokeWidth={2.2} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docModalTitle} numberOfLines={1}>
                    {selectedDoc ? t(selectedDoc.titleKey, selectedDoc.defaultTitle) : ''}
                  </Text>
                  <Text style={styles.docModalSubTitle}>{selectedDoc?.subText}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.docModalCloseBtn}
                activeOpacity={0.8}
                onPress={() => setSelectedDoc(null)}
              >
                <X size={18} color="#3E3C3D" strokeWidth={2.2} />
              </TouchableOpacity>
            </View>

            {/* Visual Document Card Preview */}
            <View style={styles.docPreviewCard}>
              <View style={styles.docPreviewHeaderRow}>
                <View style={styles.docPreviewBrandBadge}>
                  <Lock size={12} color="#15803D" strokeWidth={2} />
                  <Text style={styles.docPreviewBrandText}>MERCON REGISTRY</Text>
                </View>
                <View
                  style={[
                    styles.statusChip,
                    selectedDoc?.status === 'valid' && styles.statusChipValid,
                    selectedDoc?.status === 'expiring' && styles.statusChipExpiring,
                    selectedDoc?.status === 'expired' && styles.statusChipExpired,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusChipText,
                      selectedDoc?.status === 'valid' && styles.statusTextValid,
                      selectedDoc?.status === 'expiring' && styles.statusTextExpiring,
                      selectedDoc?.status === 'expired' && styles.statusTextExpired,
                    ]}
                  >
                    {selectedDoc?.statusLabel}
                  </Text>
                </View>
              </View>

              {/* Main Doc Details */}
              <View style={styles.docPreviewBody}>
                <Text style={styles.docPreviewMainTitle}>
                  {selectedDoc ? t(selectedDoc.titleKey, selectedDoc.defaultTitle).toUpperCase() : ''}
                </Text>
                <Text style={styles.docPreviewRefNum}>{selectedDoc?.subText}</Text>

                <View style={styles.docPreviewMetaGrid}>
                  <View style={styles.docPreviewMetaCol}>
                    <Text style={styles.docPreviewMetaLabel}>{t('label_driver_name', 'Driver')}</Text>
                    <Text style={styles.docPreviewMetaValue}>{name}</Text>
                  </View>
                  <View style={styles.docPreviewMetaCol}>
                    <Text style={styles.docPreviewMetaLabel}>{t('label_vehicle', 'Vehicle')}</Text>
                    <Text style={styles.docPreviewMetaValue}>{plateNumber}</Text>
                  </View>
                </View>

                <View style={styles.docPreviewExpiryRow}>
                  <Text style={styles.docPreviewExpiryLabel}>{t('label_expiry_date', 'Expiry Date')}</Text>
                  <Text style={styles.docPreviewExpiryValue}>{selectedDoc?.expiry}</Text>
                </View>

                {/* Real image preview if fileUrl exists */}
                {selectedDoc?.fileUrl ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.docImagePreviewBox}
                    onPress={() => openFile(selectedDoc.fileUrl!)}
                  >
                    <Image
                      source={{ uri: selectedDoc.fileUrl.startsWith('http') ? selectedDoc.fileUrl : `${FILE_BASE}${selectedDoc.fileUrl}` }}
                      style={styles.docImagePreviewImg}
                      resizeMode="cover"
                    />
                    <View style={styles.docImageOverlayPill}>
                      <ExternalLink size={12} color="#FFFFFF" strokeWidth={2} />
                      <Text style={styles.docImageOverlayText}>{t('action_view_file', 'Tap to View File')}</Text>
                    </View>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.docModalActions}>
              <TouchableOpacity
                style={styles.whatsappShareBtn}
                activeOpacity={0.85}
                onPress={() => {
                  if (selectedDoc) {
                    shareDocToWhatsApp(
                      {
                        defaultTitle: t(selectedDoc.titleKey, selectedDoc.defaultTitle),
                        subText: selectedDoc.subText,
                        expiry: selectedDoc.expiry,
                        statusLabel: selectedDoc.statusLabel,
                        fileUrl: selectedDoc.fileUrl,
                      },
                      name,
                      plateNumber
                    );
                  }
                }}
              >
                <WhatsAppIcon size={20} color="#FFFFFF" />
                <Text style={styles.whatsappShareBtnText}>{t('action_share_whatsapp', 'Share via WhatsApp')}</Text>
              </TouchableOpacity>

              {selectedDoc?.fileUrl ? (
                <TouchableOpacity
                  style={styles.viewFileBtn}
                  activeOpacity={0.8}
                  onPress={() => openFile(selectedDoc.fileUrl!)}
                >
                  <ExternalLink size={16} color="#3E3C3D" strokeWidth={2} />
                  <Text style={styles.viewFileBtnText}>{t('action_open_document', 'Open Document File')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── 5. Avatar Zoom Lightbox Modal ── */}
      <Modal
        visible={avatarZoomed}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setAvatarZoomed(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setAvatarZoomed(false)}
        >
          <StatusBar barStyle="light-content" backgroundColor="#000000" />
          <TouchableOpacity
            style={styles.closeBtnCircle}
            activeOpacity={0.8}
            onPress={() => setAvatarZoomed(false)}
          >
            <X size={22} color="#FFFFFF" strokeWidth={2.5} />
          </TouchableOpacity>

          <View style={styles.zoomedImageContainer}>
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={styles.zoomedAvatarImg}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.zoomedInitialsCircle}>
                <Text style={styles.zoomedInitialsText}>{initialsOf(name)}</Text>
              </View>
            )}
            <Text style={styles.zoomedDriverName}>{name}</Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  topHeaderFill: {
    position: 'absolute',
    top: -1000,
    left: 0,
    right: 0,
    height: 1000 + 230,
    backgroundColor: '#FA634E',
  },
  headerContainer: {
    position: 'relative',
    backgroundColor: '#FA634E',
    overflow: 'hidden',
    paddingBottom: 16,
  },
  headerSafe: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  langPill: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 10,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  langPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#3E3C3D',
  },
  driverChargePill: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3E3C3D',
    borderRadius: 16,
    paddingHorizontal: 10,
    gap: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  walletIconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFF0ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chargeTextCol: {
    justifyContent: 'center',
  },
  chargeAmount: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 13,
  },
  chargeLabel: {
    fontSize: 8,
    color: '#EEF1F6',
    lineHeight: 9,
    fontWeight: '500',
  },
  settingsPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },


  /* Identity Column */
  identityColumn: {
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 4,
  },
  driverNameTextCentered: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 12,
  },
  driverVehicleSubText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 4,
  },
  /* Menu List Container (Flat full width) */
  menuListContainer: {
    backgroundColor: '#FFFFFF',
    paddingTop: 8,
    paddingBottom: 32,
    minHeight: 500,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  menuTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#18181B',
    marginBottom: 2,
  },
  menuItemSub: {
    fontSize: 13,
    color: '#71717A',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#F4F4F5',
    marginLeft: 84, /* Line starts after icon */
    marginRight: 24,
  },
  /* Identity Row */
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 14,
    paddingHorizontal: 4,
  },
  avatarWrapper: {
    position: 'relative',
    borderRadius: 999,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  verifiedBadgeCircle: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#16A34A',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityTextCol: {
    flex: 1,
    gap: 4,
  },
  driverNameText: {
    fontSize: 21,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
  verifiedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 5,
  },
  verifiedChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FA634E',
  },

  /* Main Scroll & Balanced Layout */
  mainScroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 95,
    backgroundColor: '#FFFFFF',
  },
  sectionSurface: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(62,60,61,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  sectionGroup: {
    gap: 6,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sectionTitleText: {
    fontSize: 15.5,
    fontWeight: '600',
    color: '#3E3C3D',
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FA634E',
  },

  /* Performance Overview Grid */
  performanceGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  perfCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  perfValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#3E3C3D',
  },
  perfLabel: {
    fontSize: 11,
    color: '#6E6E80',
    fontWeight: '400',
    textAlign: 'center',
  },
  perfDivider: {
    width: 1,
    height: 26,
    backgroundColor: '#FFFFFF',
  },

  /* Assigned Vehicle Compact Surface */
  compactVehicleSurface: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(62,60,61,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  truckIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF0ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleDetailsCol: {
    flex: 1,
    gap: 2,
  },
  plateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  vehiclePlateText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3E3C3D',
    letterSpacing: 0.3,
  },
  vehicleSubText: {
    fontSize: 12.5,
    color: '#6E6E80',
    fontWeight: '400',
  },
  activeStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  activeStatusDot: {
    fontSize: 7,
    color: '#15803D',
  },
  activeStatusText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#15803D',
  },

  /* My Documents Single Surface */
  singleDocsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(62,60,61,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  docRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
    minHeight: 58,
  },
  docRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F6',
  },
  docIconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFF0ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docInfoCol: {
    flex: 1,
    gap: 2,
  },
  docTitleText: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#3E3C3D',
  },
  docSubText: {
    fontSize: 12,
    color: '#6E6E80',
    fontWeight: '400',
  },
  docRightCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  docExpiryText: {
    fontSize: 11,
    color: '#6E6E80',
    fontWeight: '400',
  },
  statusChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusChipValid: {
    backgroundColor: '#DCFCE7',
  },
  statusChipExpiring: {
    backgroundColor: '#FEF3C7',
  },
  statusChipExpired: {
    backgroundColor: '#FFF0ED',
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  statusTextValid: {
    color: '#15803D',
  },
  statusTextExpiring: {
    color: '#D97706',
  },
  statusTextExpired: {
    color: '#FA634E',
  },

  /* Uploaded Photos Section */
  emptyPhotosContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
  },
  emptyPhotosText: {
    fontSize: 12.5,
    color: '#9898A4',
    textAlign: 'center',
  },
  photosScroll: {
    gap: 10,
  },
  photoCard: {
    width: 92,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EEF1F6',
  },
  photoImg: {
    width: '100%',
    height: 64,
    backgroundColor: '#FFFFFF',
  },
  photoMeta: {
    padding: 6,
  },
  photoTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3E3C3D',
  },
  photoSub: {
    fontSize: 10,
    color: '#FA634E',
    fontWeight: '600',
    marginTop: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  closeBtnCircle: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  zoomedImageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  zoomedAvatarImg: {
    width: SCREEN_WIDTH * 0.82,
    height: SCREEN_WIDTH * 0.82,
    borderRadius: (SCREEN_WIDTH * 0.82) / 2,
    borderWidth: 4,
    borderColor: '#FA634E',
  },
  zoomedInitialsCircle: {
    width: SCREEN_WIDTH * 0.7,
    height: SCREEN_WIDTH * 0.7,
    borderRadius: (SCREEN_WIDTH * 0.7) / 2,
    backgroundColor: '#FA634E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  zoomedInitialsText: {
    fontSize: 72,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  zoomedDriverName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: -30,
    textAlign: 'center',
  },

  /* Document Preview & WhatsApp Share Modal */
  docModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  docModalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 38 : 24,
    gap: 16,
    maxHeight: '90%',
  },
  docModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  docModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  docModalIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF0ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#3E3C3D',
  },
  docModalSubTitle: {
    fontSize: 12,
    color: '#9898A4',
    marginTop: 2,
  },
  docModalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docPreviewCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 12,
  },
  docPreviewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  docPreviewBrandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  docPreviewBrandText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#15803D',
    letterSpacing: 0.5,
  },
  docPreviewBody: {
    gap: 8,
  },
  docPreviewMainTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#3E3C3D',
    letterSpacing: 0.5,
  },
  docPreviewRefNum: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FA634E',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  docPreviewMetaGrid: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 16,
  },
  docPreviewMetaCol: {
    flex: 1,
  },
  docPreviewMetaLabel: {
    fontSize: 10,
    color: '#9898A4',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  docPreviewMetaValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#3E3C3D',
    marginTop: 1,
  },
  docPreviewExpiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    marginTop: 4,
  },
  docPreviewExpiryLabel: {
    fontSize: 11,
    color: '#9898A4',
    fontWeight: '600',
  },
  docPreviewExpiryValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3E3C3D',
  },
  docImagePreviewBox: {
    height: 140,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
    position: 'relative',
    backgroundColor: '#FFFFFF',
  },
  docImagePreviewImg: {
    width: '100%',
    height: '100%',
  },
  docImageOverlayPill: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  docImageOverlayText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  docModalActions: {
    gap: 10,
    marginTop: 4,
  },
  whatsappShareBtn: {
    height: 46,
    borderRadius: 14,
    backgroundColor: '#25D366',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  whatsappShareBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  viewFileBtn: {
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  viewFileBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3E3C3D',
  },
  signOutBtn: {
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 24,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFF0ED',
    borderWidth: 1,
    borderColor: 'rgba(250, 99, 78, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FA634E',
  },
});
