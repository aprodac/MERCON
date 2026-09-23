import { useEffect, useState } from 'react';
import { Trip } from '@/services/tripService';
import { calculateRoadDistanceKm, resolveCityCoords } from '@/services/travelTimeService';
import { openMultipleWhatsappMessages } from '@/utils/whatsappFormatter';

export type WhatsAppRecipientType = 'driver' | 'customer' | 'custom';

/**
 * The WhatsApp share dialog on the trips list: pick a recipient, preview a
 * composed message (single-trip manifest line or a multi-trip summary), and
 * either open WhatsApp's web/app share URL for one trip or fire off one
 * window per trip for a bulk share. Extracted out of TripListPage as-is —
 * same state, same message-composition rule, same window.open call.
 */
export function useTripWhatsAppShare() {
  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [whatsappSelectedTrips, setWhatsappSelectedTrips] = useState<Trip[]>([]);
  const [whatsappRecipientType, setWhatsappRecipientType] = useState<WhatsAppRecipientType>('custom');
  const [whatsappCustomPhone, setWhatsappCustomPhone] = useState('');
  const [whatsappMessageText, setWhatsappMessageText] = useState('');
  const [whatsappWithTailgate, setWhatsappWithTailgate] = useState(false);

  const openWhatsappShare = (selectedRows: Trip[]) => {
    setWhatsappSelectedTrips(selectedRows);
    if (selectedRows.length === 0) return;
    setWhatsappWithTailgate(false);

    if (selectedRows.length === 1) {
      const trip = selectedRows[0];
      if (!trip.is_third_party && trip.driver?.phone_primary) {
        setWhatsappRecipientType('driver');
      } else if (trip.is_third_party && (trip.third_party_driver_phone || trip.thirdPartyProvider?.phone)) {
        setWhatsappRecipientType('custom');
        setWhatsappCustomPhone(trip.third_party_driver_phone || trip.thirdPartyProvider?.phone || '');
      } else if (trip.customer?.contact_phone) {
        setWhatsappRecipientType('customer');
      } else {
        setWhatsappRecipientType('custom');
        setWhatsappCustomPhone('');
      }
    } else {
      setWhatsappRecipientType('custom');
      setWhatsappCustomPhone('');
    }

    setWhatsappDialogOpen(true);
  };

  useEffect(() => {
    if (!whatsappDialogOpen || whatsappSelectedTrips.length === 0) return;

    if (whatsappSelectedTrips.length === 1) {
      const trip = whatsappSelectedTrips[0];
      const customerName = trip.customer?.name || 'Unassigned';
      const driverName = trip.is_third_party
        ? (trip.third_party_driver_name || trip.thirdPartyProvider?.name || '3PL Driver')
        : (trip.driver ? `${trip.driver.first_name} ${trip.driver.last_name}` : 'Unassigned');
      const plate = trip.is_third_party
        ? (trip.third_party_vehicle_plate || '3PL Vehicle')
        : (trip.vehicle?.plate_number || 'Unassigned');

      const pickupName = trip.stops?.find((s) => s.stop_type === 'Pickup')?.location_name || trip.stops?.[0]?.location_name || 'Origin';
      const dropoffStop = trip.stops?.find((s) => s.stop_type === 'Dropoff') || trip.stops?.[trip.stops.length - 1];
      const dropoffName = dropoffStop?.location_name || 'Destination';

      const isScheduled = ['Draft', 'Scheduled'].includes(trip.status);
      let text = '';

      if (isScheduled) {
        const isMonthly = trip.billing_type?.toUpperCase().includes('MONTHLY') || trip.quotation_billing_type?.toUpperCase().includes('MONTHLY');
        const billingLabel = isMonthly ? 'MONTHLY' : 'EXTRA';
        const vClass = trip.quotation_vehicle_class || trip.vehicle_type || trip.vehicle?.asset_type || 'VEHICLE';
        const lType = trip.quotation_line_type || 'ROUND TRIP';

        text = `@${customerName}\n` +
               `*(${billingLabel} VEHICLE)*\n` +
               `1. ${pickupName}>>>${dropoffName} ${vClass} (${lType})\n` +
               `Driver name # ${driverName}\n` +
               `Number # ${trip.driver?.phone_primary || trip.third_party_driver_phone || 'Unassigned'}\n` +
               `Truck no # ${plate}`;

        if (whatsappWithTailgate) {
           text += `\n\nWITH TAILGATE`;
        }
      } else {
        let distanceText = 'Unavailable';
        let etaText = 'Unavailable';

        const vehicleLat = trip.vehicle?.resolved_location?.latitude;
        const vehicleLng = trip.vehicle?.resolved_location?.longitude;

        let destLat = dropoffStop?.location_lat;
        let destLng = dropoffStop?.location_lng;

        if (!destLat || !destLng) {
          const resolvedDest = resolveCityCoords(dropoffName);
          if (resolvedDest) {
            destLat = resolvedDest.lat;
            destLng = resolvedDest.lng;
          }
        }

        if (vehicleLat && vehicleLng && destLat && destLng) {
          const distKm = calculateRoadDistanceKm(vehicleLat, vehicleLng, destLat, destLng);
          distanceText = `${distKm}KM TO ${dropoffName.toUpperCase()}`;
          const etaHours = (distKm / 70).toFixed(1);
          etaText = `${etaHours}HRS`;
        }

        let statusDisplay = trip.status;
        if (trip.status === 'AtPickup') statusDisplay = 'Loading';
        else if (trip.status === 'AtDelivery') statusDisplay = 'At Delivery';
        else if (trip.status === 'InTransit') statusDisplay = 'In Transit';

        text = `Vehicle Status Update\n\n` +
               `Truck: *${plate}*\n` +
               `Driver: ${driverName}\n` +
               `Route: ${pickupName}>>>${dropoffName}\n` +
               `Distance left: ${distanceText}\n` +
               `ETA: ${etaText}\n` +
               `Status: ${statusDisplay}`;
      }
      setWhatsappMessageText(text);
    } else {
      let text = `*MERCON LOGISTICS - Manifest Summary*\n`;
      whatsappSelectedTrips.forEach((t) => {
        const cust = t.customer?.name || 'Unassigned';
        const drv = t.is_third_party
          ? (t.third_party_driver_name || t.thirdPartyProvider?.name || '3PL Driver')
          : (t.driver ? `${t.driver.first_name} ${t.driver.last_name}` : 'Unassigned');
        const plate = t.is_third_party
          ? (t.third_party_vehicle_plate || '3PL Vehicle')
          : (t.vehicle?.plate_number || 'Unassigned');
        text += `\n*${t.ref_id || 'Draft'}* - ${cust}\n` +
                (t.is_third_party ? `  • 3PL Provider: ${t.thirdPartyProvider?.name || '3PL'}\n` : '') +
                `  • Driver: ${drv}\n` +
                `  • Vehicle: ${plate}\n` +
                `  • Status: ${t.status}\n`;
      });
      setWhatsappMessageText(text);
    }
  }, [whatsappSelectedTrips, whatsappWithTailgate, whatsappDialogOpen]);

  const handleWhatsappSend = () => {
    if (whatsappSelectedTrips.length > 1) {
      openMultipleWhatsappMessages(whatsappSelectedTrips);
      setWhatsappDialogOpen(false);
      return;
    }

    let phone = '';
    if (whatsappSelectedTrips.length === 1) {
      const trip = whatsappSelectedTrips[0];
      if (whatsappRecipientType === 'driver') {
        phone = trip.driver?.phone_primary || '';
      } else if (whatsappRecipientType === 'customer') {
        phone = trip.customer?.contact_phone || '';
      } else {
        phone = whatsappCustomPhone;
      }
    } else {
      phone = whatsappCustomPhone;
    }

    const cleanPhone = phone.trim().replace(/\+/g, '').replace(/\D/g, '');
    const shareUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(whatsappMessageText)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappMessageText)}`;
    window.open(shareUrl, '_blank');
    setWhatsappDialogOpen(false);
  };

  return {
    whatsappDialogOpen,
    setWhatsappDialogOpen,
    whatsappSelectedTrips,
    whatsappRecipientType,
    setWhatsappRecipientType,
    whatsappCustomPhone,
    setWhatsappCustomPhone,
    whatsappMessageText,
    setWhatsappMessageText,
    whatsappWithTailgate,
    setWhatsappWithTailgate,
    openWhatsappShare,
    handleWhatsappSend,
  };
}
