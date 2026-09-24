import React from 'react';
import { View, Text, StyleSheet, Platform, Image } from 'react-native';
import { Calendar, Globe, MapPin, Building2 } from 'lucide-react-native';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';

const merconLogo = require('../../assets/images/merconclosed-logo.webp');

export interface GoogleMapsGeotagProps {
  latitude?: number;
  longitude?: number;
  timestamp?: string | null;
  locationName?: string | null;
  fullAddress?: string | null;
  address?: string | null;
  companyName?: string | null;
  customerName?: string | null;
  compact?: boolean;
  bottomPadding?: number;
}

export const GoogleMapsGeotagPreview: React.FC<GoogleMapsGeotagProps> = ({
  latitude = 11.0467,
  longitude = 76.0747,
  timestamp,
  locationName,
  fullAddress,
  address,
  companyName,
  customerName,
  bottomPadding = 16,
}) => {
  const { t } = useLanguage();
  const displayLocation = locationName ?? address ?? 'Up Hill, Malappuram, India';
  const displayFullAddress = fullAddress ?? (address && address !== locationName ? address : 'Up Hill, Malappuram,\nKerala 676519, India');
  const displayCompany = companyName ?? customerName ?? 'Horizon Distributors Co.';

  const dateObj = timestamp ? new Date(timestamp) : new Date('2026-08-28T09:23:00');
  
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });

  const formattedTime = dateObj.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const latStr = `${latitude.toFixed(4)}°N`;
  const lngStr = `${longitude.toFixed(4)}°E`;

  return (
    <View style={[styles.edgePanelContainer, { paddingBottom: bottomPadding }]}>
      {/* Top Main Section: Map Preview Left + Location & Metadata Right */}
      <View style={styles.mainRow}>
        {/* LEFT: Compact Snapshot-Friendly Google Maps Preview */}
        <View style={styles.mapTileWrapper} collapsable={false}>
          <View style={styles.webMapSim}>
            <View style={styles.simTerrainGreen} />
            <View style={styles.simRoadHorizontal} />
            <View style={styles.simRoadVertical} />
            <Text style={styles.simLocalityText} numberOfLines={1}>
              {displayLocation.split(',')[0]}
            </Text>
            <View style={styles.pinWrapper}>
              <MapPin size={22} color="#FA634E" fill="#FA634E" />
            </View>
          </View>

          {/* Subtle Google Attribution Label */}
          <View style={styles.googleAttributionBadge}>
            <Text style={styles.googleAttributionText}>Google</Text>
          </View>
        </View>

        {/* RIGHT: Location Details & Metadata */}
        <View style={styles.detailsCol}>
          {/* Location Title (Primary) */}
          <Text style={styles.locationTitle} numberOfLines={1}>
            {displayLocation}
          </Text>

          {/* Address Subtitle (Secondary) */}
          <Text style={styles.fullAddressText} numberOfLines={2}>
            {displayFullAddress}
          </Text>

          {/* Separator Line */}
          <View style={styles.innerDivider} />

          {/* Metadata Row 1: Captured Date & Time */}
          <View style={styles.metaRow}>
            <Calendar size={11} color="#FA634E" strokeWidth={2.4} />
            <Text style={styles.metaLabel}>{t('label_captured', 'Captured')}</Text>
            <Text style={[styles.metaValue, { writingDirection: 'ltr' }]}>{formattedDate} · {formattedTime}</Text>
          </View>

          {/* Metadata Row 2: GPS Coordinates */}
          <View style={[styles.metaRow, { marginTop: 4 }]}>
            <Globe size={11} color="#FA634E" strokeWidth={2.4} />
            <Text style={styles.metaLabel}>{t('label_coordinates', 'Coordinates')}</Text>
            <Text style={[styles.metaValue, { writingDirection: 'ltr' }]}>{latStr} · {lngStr}</Text>
          </View>

          {/* Metadata Row 3: Customer / Company */}
          <View style={[styles.metaRow, { marginTop: 4 }]}>
            <Building2 size={11} color="#FA634E" strokeWidth={2.4} />
            <Text style={styles.metaLabel}>{t('label_customer', 'Customer')}</Text>
            <Text style={styles.metaValue} numberOfLines={1}>{displayCompany}</Text>
          </View>
        </View>
      </View>

      {/* FOOTER: Official Mercon Closed Logo + Customer Badge (Left) + Google Maps Attribution (Right) */}
      <View style={styles.footerRow}>
        <View style={styles.merconBrandContainer}>
          <Image
            source={merconLogo}
            style={styles.merconClosedLogoImg}
            resizeMode="contain"
          />
          <Text style={styles.companyBadgeText} numberOfLines={1}>
            • {displayCompany}
          </Text>
        </View>

        <Text style={styles.attributionText}>
          Google Maps · GPS Verified
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  edgePanelContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  mapTileWrapper: {
    width: 102,
    height: 116,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  nativeMap: {
    ...StyleSheet.absoluteFill,
  },
  webMapSim: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  simTerrainGreen: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DCFCE7',
    opacity: 0.7,
  },
  simRoadHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#CBD5E1',
    top: 50,
  },
  simRoadVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 12,
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#CBD5E1',
    left: 44,
  },
  simLocalityText: {
    position: 'absolute',
    top: 10,
    left: 8,
    fontSize: 8.5,
    fontWeight: '700',
    color: '#64748B',
  },
  pinWrapper: {
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleAttributionBadge: {
    position: 'absolute',
    bottom: 4,
    left: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  googleAttributionText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#5F6368',
  },
  detailsCol: {
    flex: 1,
    marginLeft: 14,
  },
  locationTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#3E3C3D',
    lineHeight: 19,
  },
  fullAddressText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 2,
    lineHeight: 15,
  },
  innerDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.4,
    marginRight: 2,
  },
  metaValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3E3C3D',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  merconBrandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  merconClosedLogoImg: {
    width: 72,
    height: 20,
  },
  companyBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    marginLeft: 4,
    maxWidth: 130,
  },
  attributionText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
  },
});
